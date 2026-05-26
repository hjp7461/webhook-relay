import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { startRedisContainer, type StartedRedis } from "./helpers/redis-container.js";
import { spawnServer, type SpawnedServer } from "./helpers/spawn-server.js";

// IT-S7 — Graceful shutdown
//
// PLAN `08-m7-graceful-shutdown.md` §3.1 / PRD `03` §3 IT-S7 / PRD `02` §F2.6·§I2.6.
//
// 결정 잠금:
// - Q-SEC-4 (b) — 정상 완료(잔여 작업 없음) → exit 0. 타임아웃 강제 종료 → exit 1.
// - Q-OPS-2 (b) — 자식 프로세스 + 실제 SIGTERM.
// - Q-SEC-5 (a) — 셧다운 진행 중 /healthz 503.
//
// 케이스:
//   A) 정상 완료
//      1) 자식 server.ts 부팅(자식 in-process worker).
//      2) 외부 stub 수신자(부모 프로세스)에서 1.5s 응답 지연을 두어 워커가 잡고 처리 중.
//      3) POST /webhooks 1회 → 202.
//      4) 워커가 작업을 잡았음을 stub hit 으로 확인 후 SIGTERM 송신.
//      5) 셧다운 진행 중: 추가 POST /webhooks → 503, GET /healthz → 503.
//      6) 자식 종료 대기. exit 0 단언.
//      7) Redis 의 BullMQ 작업 상태가 'completed' + stub 수신자가 1건 받음.
//
//   B) 타임아웃
//      1) 자식 server.ts 부팅. stub 수신자가 5s 응답 지연(>SHUTDOWN_TIMEOUT_MS).
//      2) POST /webhooks 1회 → 202.
//      3) 워커가 잡았음 확인 후 SIGTERM.
//      4) 자식 종료 대기 — exit 1 단언.
//      5) 자식 stdout 에 `remainingJobIds` 키를 가진 JSON 한 줄 등장 확인.

const SHUTDOWN_TIMEOUT_MS = 3_000;

interface StubReceiver {
  readonly server: Server;
  readonly url: string;
  readonly hits: ReadonlyArray<{ at: number; body: unknown }>;
  /** 모든 요청에 적용할 응답 지연(ms). */
  setDelay(ms: number): void;
  stop(): Promise<void>;
}

async function startStubReceiver(): Promise<StubReceiver> {
  const hits: { at: number; body: unknown }[] = [];
  let delayMs = 0;
  const server = createServer((req, res) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      raw += chunk;
    });
    req.on("end", () => {
      let body: unknown = undefined;
      try {
        body = raw.length > 0 ? JSON.parse(raw) : undefined;
      } catch {
        body = raw;
      }
      hits.push({ at: Date.now(), body });
      const finish = (): void => {
        if (!res.writableEnded) {
          res.statusCode = 200;
          res.setHeader("content-type", "text/plain");
          res.end("ok");
        }
      };
      if (delayMs > 0) {
        setTimeout(finish, delayMs);
      } else {
        finish();
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${addr.port}/`;
  return {
    server,
    url,
    get hits(): ReadonlyArray<{ at: number; body: unknown }> {
      return hits;
    },
    setDelay(ms: number): void {
      delayMs = ms;
    },
    async stop(): Promise<void> {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

async function waitFor(
  fn: () => Promise<boolean> | boolean,
  options: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<void> {
  const interval = options.intervalMs ?? 50;
  const timeout = options.timeoutMs ?? 5_000;
  const start = Date.now();
  while (true) {
    if (await fn()) return;
    if (Date.now() - start > timeout) {
      throw new Error(`waitFor timed out after ${timeout}ms`);
    }
    await new Promise((r) => setTimeout(r, interval));
  }
}

function buildChildEnv(input: {
  redisUrl: string;
  queueName: string;
  dlqName: string;
  bearerToken: string;
  hmacSecret: string;
}): NodeJS.ProcessEnv {
  return {
    // 자식 프로세스가 부트스트랩에 사용할 env. 시크릿은 32 bytes 이상.
    PATH: process.env["PATH"] ?? "",
    NODE_ENV: "test",
    REDIS_URL: input.redisUrl,
    PORT: "0",
    LOG_LEVEL: "info",
    QUEUE_NAME: input.queueName,
    DLQ_NAME: input.dlqName,
    API_BEARER_TOKEN: input.bearerToken,
    WEBHOOK_HMAC_SECRET: input.hmacSecret,
    WEBHOOK_MAX_ATTEMPTS: "1",
    WEBHOOK_BACKOFF_BASE_MS: "1000",
    WEBHOOK_DELIVERY_TIMEOUT_MS: "30000",
    WEBHOOK_MAX_PAYLOAD_BYTES: "65536",
    WORKER_CONCURRENCY: "1",
    ALLOW_PRIVATE_TARGETS: "true",
    SHUTDOWN_TIMEOUT_MS: String(SHUTDOWN_TIMEOUT_MS),
    STALLED_INTERVAL_MS: "30000",
    MAX_STALLED_COUNT: "1",
    REDIS_RECONNECT_BASE_MS: "200",
    REDIS_RECONNECT_MAX_MS: "10000",
  };
}

let redis: StartedRedis;
let receiver: StubReceiver;
// Redis 단언용(부모 프로세스의 별도 ioredis 연결).
let assertConnection: Redis | undefined;

beforeAll(async () => {
  redis = await startRedisContainer();
  receiver = await startStubReceiver();
}, 120_000);

afterAll(async () => {
  if (receiver) await receiver.stop();
  if (assertConnection) {
    try {
      await assertConnection.quit();
    } catch {
      // best-effort
    }
  }
  if (redis) await redis.stop();
}, 60_000);

describe("IT-S7 graceful shutdown", () => {
  it("case A: SIGTERM during in-flight work → in-flight completes, exit 0, /webhooks and /healthz return 503", async () => {
    receiver.setDelay(1_500);

    const queueName = `webhook-it-s7a-${randomUUID()}`;
    const dlqName = `${queueName}-dlq`;
    const bearerToken = "a".repeat(32);
    const hmacSecret = "h".repeat(32);
    const env = buildChildEnv({
      redisUrl: redis.url,
      queueName,
      dlqName,
      bearerToken,
      hmacSecret,
    });

    let server: SpawnedServer | undefined;
    let assertQueue: Queue | undefined;
    try {
      server = await spawnServer({ env });

      // 등록 요청 1회.
      const idempotencyKey = `it-s7a-${randomUUID()}`;
      const initialHits = receiver.hits.length;
      const postRes = await fetch(`${server.baseUrl}/webhooks`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({
          url: receiver.url,
          payload: { event: "it-s7-case-a", id: 1 },
          idempotencyKey,
        }),
      });
      expect(postRes.status).toBe(202);

      // 워커가 작업을 잡고 외부 송신을 시작했음을 stub 의 첫 hit 도착으로 감지.
      await waitFor(
        () => receiver.hits.length >= initialHits + 1,
        { intervalMs: 25, timeoutMs: 5_000 },
      );

      // SIGTERM 송신. 자식의 셧다운 시퀀스가 시작된다.
      server.kill("SIGTERM");

      // draining 진행 중: /webhooks 와 /healthz 가 503.
      // 자식이 setDraining(true) 를 시그널 즉시 호출하므로 폴링으로 503 안정화 확인.
      await waitFor(
        async () => {
          try {
            const r = await fetch(`${server!.baseUrl}/webhooks`, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                authorization: `Bearer ${bearerToken}`,
              },
              body: JSON.stringify({
                url: receiver.url,
                payload: { event: "blocked", id: 2 },
                idempotencyKey: `it-s7a-blocked-${randomUUID()}`,
              }),
            });
            return r.status === 503;
          } catch {
            return false;
          }
        },
        { intervalMs: 25, timeoutMs: 3_000 },
      );

      const healthzRes = await fetch(`${server.baseUrl}/healthz`);
      expect(healthzRes.status).toBe(503);

      // 자식 종료 대기. 정상 완료 → exit 0.
      const { code } = await server.waitForExit(SHUTDOWN_TIMEOUT_MS + 5_000);
      expect(code).toBe(0);

      // Redis 측 단언: 작업이 completed.
      assertConnection = new Redis(redis.url, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      });
      assertQueue = new Queue(queueName, { connection: assertConnection });
      const job = await assertQueue.getJob(idempotencyKey);
      expect(job).toBeDefined();
      // BullMQ Job 의 상태는 'completed' 여야 한다.
      const state = await job?.getState();
      expect(state).toBe("completed");

      // stub 수신자가 동일 페이로드로 1건 수신.
      const matched = receiver.hits.filter((h) => {
        if (typeof h.body !== "object" || h.body === null) return false;
        const b = h.body as Record<string, unknown>;
        return b["event"] === "it-s7-case-a" && b["id"] === 1;
      });
      expect(matched.length).toBe(1);
    } finally {
      if (assertQueue) {
        try {
          await assertQueue.close();
        } catch {
          // best-effort
        }
      }
      if (server && server.child.exitCode === null && server.child.signalCode === null) {
        try {
          server.kill("SIGKILL");
        } catch {
          // best-effort
        }
      }
    }
  }, 30_000);

  it("case B: in-flight exceeds SHUTDOWN_TIMEOUT_MS → exit 1 + remainingJobIds logged", async () => {
    receiver.setDelay(5_000);

    const queueName = `webhook-it-s7b-${randomUUID()}`;
    const dlqName = `${queueName}-dlq`;
    const bearerToken = "b".repeat(32);
    const hmacSecret = "h".repeat(32);
    const env = buildChildEnv({
      redisUrl: redis.url,
      queueName,
      dlqName,
      bearerToken,
      hmacSecret,
    });

    let server: SpawnedServer | undefined;
    try {
      server = await spawnServer({ env });

      const idempotencyKey = `it-s7b-${randomUUID()}`;
      const initialHits = receiver.hits.length;
      const postRes = await fetch(`${server.baseUrl}/webhooks`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({
          url: receiver.url,
          payload: { event: "it-s7-case-b", id: 1 },
          idempotencyKey,
        }),
      });
      expect(postRes.status).toBe(202);

      await waitFor(
        () => receiver.hits.length >= initialHits + 1,
        { intervalMs: 25, timeoutMs: 5_000 },
      );

      server.kill("SIGTERM");

      // 타임아웃 케이스 — 자식이 SHUTDOWN_TIMEOUT_MS 후 exit 1.
      const { code } = await server.waitForExit(SHUTDOWN_TIMEOUT_MS + 7_000);
      expect(code).toBe(1);

      // stdout 또는 stderr 의 어딘가에 remainingJobIds 키를 가진 JSON 한 줄.
      const lines = [...server.stdout, ...server.stderr];
      const found = lines.some((line) => {
        let obj: unknown;
        try {
          obj = JSON.parse(line);
        } catch {
          return false;
        }
        if (typeof obj !== "object" || obj === null) return false;
        const rec = obj as Record<string, unknown>;
        if (!("remainingJobIds" in rec)) return false;
        const v = rec["remainingJobIds"];
        return Array.isArray(v);
      });
      if (!found) {
        // 진단 dump.
        const dump = `stdout:\n${server.stdout.join("\n")}\nstderr:\n${server.stderr.join("\n")}`;
        throw new Error(
          `expected a JSON line containing remainingJobIds array. dump:\n${dump}`,
        );
      }
    } finally {
      if (server && server.child.exitCode === null && server.child.signalCode === null) {
        try {
          server.kill("SIGKILL");
        } catch {
          // best-effort
        }
      }
    }
  }, 30_000);
});
