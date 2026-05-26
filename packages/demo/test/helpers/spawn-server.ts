import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// IT-S7 전용 자식 프로세스 spawn 헬퍼.
//
// 결정 잠금:
// - Q-OPS-2 (b) 자식 프로세스 + 실제 SIGTERM.
// - Q-SEC-4 (b) 강제 종료 시 exit code 1.
//
// 자식은 `tsx --import` 로 packages/demo/src/server.ts (의 main()) 진입점을 실행한다.
// dev 의존성으로 tsx 가 잡혀 있어야 한다(demo/package.json).
//
// 자식이 listen 시작했음을 stdout 의 구조화 로그(JSON) 한 줄로 감지한다 —
// server.ts 가 `"server listening"` 메시지를 부트스트랩 완료 시점에 출력한다.
//
// 본 헬퍼는 도메인 식별자를 모른다. 테스트 측이 env 로 주입한다.

const HERE = dirname(fileURLToPath(import.meta.url));
// packages/demo/test/helpers → packages/demo/src/server.ts
const SERVER_ENTRY = resolve(HERE, "..", "..", "src", "server.ts");

export interface SpawnedServer {
  readonly child: ChildProcessByStdio<null, Readable, Readable>;
  readonly baseUrl: string;
  readonly stdout: string[];
  readonly stderr: string[];
  /** SIGTERM 송신. 호출 측이 exit 까지 대기한다(waitForExit). */
  kill(signal?: NodeJS.Signals): void;
  /** 자식 프로세스가 종료될 때까지 대기. exit code/signal 을 반환. */
  waitForExit(timeoutMs?: number): Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
}

export interface SpawnServerOptions {
  readonly env: NodeJS.ProcessEnv;
  /** listen 감지 timeout (ms). 기본 8000. */
  readonly readyTimeoutMs?: number;
}

/**
 * server.ts 를 자식 프로세스로 띄운다.
 *
 * 흐름:
 * 1) `node --import tsx <entry>` 로 spawn (tsx 가 ts 를 트랜스파일).
 * 2) stdout 파싱: server 가 출력한 "server listening" 구조화 로그에서 주소를 추출.
 * 3) readyTimeoutMs 내에 감지하지 못하면 reject.
 *
 * 자식의 stdout/stderr 라인은 SpawnedServer.stdout / .stderr 에 누적되어
 * 테스트 측이 잔여 작업 ID 같은 키를 grep 할 수 있다.
 */
export async function spawnServer(opts: SpawnServerOptions): Promise<SpawnedServer> {
  const readyTimeoutMs = opts.readyTimeoutMs ?? 8_000;
  const child = spawn(
    process.execPath,
    ["--import", "tsx", SERVER_ENTRY],
    {
      env: opts.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];

  // 라인 단위 누적. JSON 파편을 줄 단위로 보존(여러 라인 fragment 처리 — 본 단순
  // 구현은 newline 기준으로만 분리. 라인 안에 부분 JSON 만 들어오면 다음 chunk
  // 와 합쳐서 다시 split). 안전을 위해 leftover 버퍼를 유지.
  let stdoutBuf = "";
  let stderrBuf = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdoutBuf += chunk;
    const parts = stdoutBuf.split(/\r?\n/);
    stdoutBuf = parts.pop() ?? "";
    for (const line of parts) {
      if (line.length > 0) stdoutLines.push(line);
    }
  });
  child.stderr.on("data", (chunk: string) => {
    stderrBuf += chunk;
    const parts = stderrBuf.split(/\r?\n/);
    stderrBuf = parts.pop() ?? "";
    for (const line of parts) {
      if (line.length > 0) stderrLines.push(line);
    }
  });

  // listen 감지 — pino 가 출력한 JSON 한 줄에서 address 를 추출.
  // server.ts 는 `fastify.log.info({ address }, "server listening")` 를 출력한다.
  const baseUrl = await new Promise<string>((resolvePromise, rejectPromise) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      const dump =
        `stdout:\n${stdoutLines.join("\n")}\nstderr:\n${stderrLines.join("\n")}`;
      rejectPromise(
        new Error(`child server did not start within ${readyTimeoutMs}ms\n${dump}`),
      );
      try {
        child.kill("SIGKILL");
      } catch {
        // best-effort
      }
    }, readyTimeoutMs);

    const tryExtract = (line: string): string | undefined => {
      // pino JSON 라인을 파싱해 msg == 'server listening' && address 추출.
      let obj: unknown;
      try {
        obj = JSON.parse(line);
      } catch {
        return undefined;
      }
      if (typeof obj !== "object" || obj === null) return undefined;
      const rec = obj as Record<string, unknown>;
      if (rec["msg"] !== "server listening") return undefined;
      const addr = rec["address"];
      if (typeof addr === "string" && addr.length > 0) return addr;
      return undefined;
    };

    const onStdoutLine = (chunk: string): void => {
      const combined = stdoutBuf + chunk;
      const parts = combined.split(/\r?\n/);
      // 마지막 라인은 leftover 일 수 있으므로 검사하지 않음(다음 chunk 와 합쳐짐).
      for (let i = 0; i < parts.length - 1; i++) {
        const addr = tryExtract(parts[i] ?? "");
        if (addr !== undefined) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          // 이미 누적된 stdoutLines + 현재 chunk 의 완성 라인들은 위 'data'
          // 핸들러가 이어서 처리한다(중복 푸시 방지 위해 본 리스너는 데이터를
          // 직접 누적하지 않음 — 'data' 가 단일 누적 채널).
          child.stdout.off("data", onStdoutLine);
          resolvePromise(addr);
          return;
        }
      }
    };
    child.stdout.on("data", onStdoutLine);

    // 자식이 일찍 죽으면 즉시 reject.
    child.once("exit", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const dump =
        `stdout:\n${stdoutLines.join("\n")}\nstderr:\n${stderrLines.join("\n")}`;
      rejectPromise(
        new Error(`child exited before listening (code=${code}, signal=${signal})\n${dump}`),
      );
    });
  });

  return {
    child,
    baseUrl,
    stdout: stdoutLines,
    stderr: stderrLines,
    kill(signal?: NodeJS.Signals): void {
      try {
        child.kill(signal ?? "SIGTERM");
      } catch {
        // best-effort
      }
    },
    async waitForExit(
      timeoutMs: number = 10_000,
    ): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
      if (child.exitCode !== null || child.signalCode !== null) {
        return { code: child.exitCode, signal: child.signalCode };
      }
      return new Promise((resolvePromise, rejectPromise) => {
        const timer = setTimeout(() => {
          rejectPromise(new Error(`child did not exit within ${timeoutMs}ms`));
          try {
            child.kill("SIGKILL");
          } catch {
            // best-effort
          }
        }, timeoutMs);
        child.once("exit", (code, signal) => {
          clearTimeout(timer);
          resolvePromise({ code, signal });
        });
      });
    },
  };
}
