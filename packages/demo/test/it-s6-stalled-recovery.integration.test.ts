import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { startRedisContainer, type StartedRedis } from "./helpers/redis-container.js";
import {
  pollUntil,
  startApp,
  startSharedWorker,
  type AppFixture,
  type SharedWorker,
} from "./helpers/app-fixture.js";

// IT-S6 — Stalled-job recovery
//
// PLAN `07-m6-stalled-recovery.md` §3.1 / PRD `03` §3 IT-S6 / PRD `02` §F2.5·§I2.5.
//
// 흐름:
// 1) Testcontainers Redis + 고유 큐 prefix(app-fixture).
// 2) 두 워커가 같은 Redis + 같은 큐를 공유.
//    - 워커 A: app-fixture 가 띄운 in-process Worker(첫 작업을 잡음).
//    - 워커 B: 본 테스트가 인라인으로 직접 생성한 BullMQ Worker(회수 담당).
//      (단계 4 에서 헬퍼로 분리 예정 — 본 단계는 인라인.)
// 3) 환경 단축: STALLED_INTERVAL_MS=500, MAX_STALLED_COUNT=1.
// 4) 데모 핸들러는 첫 시도에서 "처리 시작" 신호를 외부 stub 수신자가 받게
//    하고 응답 직전에 의도적으로 오래(>= stalledInterval * (maxStalledCount+2)) 매달림.
//    그 직후 워커 A 를 강제 종료(`worker.close(true)`)해 lock 갱신을 중단.
// 5) 폴링(최대 10초): BullMQ 작업이 `completed` 상태에 도달 + 수신자가
//    최종적으로 페이로드를 받았음.
//
// 결정 잠금:
// - Q-STALL-1 (a) — STALLED_INTERVAL_MS 단일 env 채널(운영 30s, 테스트 단축).
// - F2.5 — 자체 stalled 매니저 금지. BullMQ 메커니즘에만 의존.
//
// 주의(PRD `03` §3 메모):
//   본 테스트는 wall-clock 의존 불가피. stalledInterval 을 짧게 두는 것 외에는
//   fake timer 적용이 어렵다.

const STALLED_INTERVAL_MS = 500;
const MAX_STALLED_COUNT = 1;
// 핸들러가 첫 시도에서 매달리는 시간. stalledInterval * (maxStalledCount + 2) 이상.
// 500 * 3 = 1500ms 를 안전 마진과 함께 2500ms 로.
const HANG_MS = 2500;

interface StubReceiver {
  readonly server: Server;
  readonly url: string;
  readonly hits: ReadonlyArray<{ at: number; body: unknown }>;
  /** 다음 N개의 요청을 의도적으로 hang 시키는 카운터. */
  hangNext(n: number): void;
  stop(): Promise<void>;
}

async function startHangThenOkReceiver(): Promise<StubReceiver> {
  const hits: { at: number; body: unknown }[] = [];
  let hangBudget = 0;
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
      const at = Date.now();
      hits.push({ at, body });
      if (hangBudget > 0) {
        hangBudget -= 1;
        // 의도적 hang. 워커가 lock 을 갱신하지 못하도록 워커 A 를 강제 종료할 시간
        // 을 벌어 준다. 다만 본 응답이 결국 돌아오더라도 워커 A 는 close 되어 결과
        // 적용이 무시되며, 워커 B 가 회수해 두 번째 시도를 정상 처리한다.
        setTimeout(() => {
          if (!res.writableEnded) {
            res.statusCode = 200;
            res.end("ok-after-hang");
          }
        }, HANG_MS);
        return;
      }
      res.statusCode = 200;
      res.end("ok");
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
    hangNext(n: number): void {
      hangBudget = n;
    },
    async stop(): Promise<void> {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

let redis: StartedRedis;
let app: AppFixture;
let receiver: StubReceiver;

beforeAll(async () => {
  redis = await startRedisContainer();
  // 워커 A 는 app-fixture 가 띄운 in-process Worker. stalled env 를 단축해야 함.
  // (단계 3 에서 server.ts 가 두 env 를 BullMQ Worker 옵션으로 전달하도록 연결.)
  app = await startApp({
    redisUrl: redis.url,
    // 본 테스트는 stalled 회수 후 다음 시도에서 성공해야 하므로 attempts >= 2 필요.
    // 단, 회수된 작업의 재시도는 backoff 정책을 따른다(F2.5 → F2.3). 짧게 둔다.
    maxAttempts: 3,
    backoffBaseMs: 100,
    stalledIntervalMs: STALLED_INTERVAL_MS,
    maxStalledCount: MAX_STALLED_COUNT,
  });
  receiver = await startHangThenOkReceiver();
}, 120_000);

afterAll(async () => {
  if (receiver) await receiver.stop();
  if (app) await app.stop();
  if (redis) await redis.stop();
}, 60_000);

describe("IT-S6 stalled recovery", () => {
  it("worker A hangs and is force-closed → another worker recovers the job and completes it", async () => {
    // 첫 1회의 요청은 hang. 그 사이 워커 A 를 강제 종료해 lock 갱신을 끊는다.
    receiver.hangNext(1);

    const idempotencyKey = `it-s6-${randomUUID()}`;
    const payload = { event: "stalled.recovery.test", id: 11 };

    const res = await fetch(`${app.baseUrl}/webhooks`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${app.bearerToken}`,
      },
      body: JSON.stringify({
        url: receiver.url,
        payload,
        idempotencyKey,
      }),
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { jobId: string };
    const jobId = body.jobId;

    // 워커 A 가 작업을 잡고 처리에 들어가는 순간을 수신자의 첫 hit 도착으로 감지.
    await pollUntil(
      async () => (receiver.hits.length >= 1 ? true : undefined),
      { intervalMs: 25, timeoutMs: 5_000 },
    );

    // 워커 B: 같은 Redis + 같은 큐 + 동일한 stalled 옵션으로 별도 부팅.
    // PLAN `07` §4 단계 4 — app-fixture 가 노출하는 startSharedWorker 헬퍼 사용.
    // 워커 B 를 워커 A 강제 종료 전에 띄워 둔다 — A 가 lock 갱신을 멈춘 직후
    // 부터 B 가 stalled scanner 로 회수 가능하도록.
    let workerB: SharedWorker | undefined;
    try {
      workerB = await startSharedWorker({
        redisUrl: redis.url,
        queueName: app.queueName,
        label: "worker-B",
        stalledIntervalMs: STALLED_INTERVAL_MS,
        maxStalledCount: MAX_STALLED_COUNT,
        concurrency: 1,
      });

      // 워커 A 를 강제 종료. BullMQ Worker.close(true) — 진행 중 작업을 기다리지
      // 않고 즉시 닫는다. lock 갱신이 멈춰 stalledInterval 이후 워커 B 가 회수.
      await app.server.worker.close(true);

      // 폴링: BullMQ 작업 상태 == completed.
      await pollUntil(
        async () => {
          // app.queue 의 raw 핸들은 워커 A 가 닫힐 때 함께 닫히지 않으므로 그대로 사용.
          const job = await app.server.queue.raw.getJob(jobId);
          if (!job) return undefined;
          const state = await job.getState();
          return state === "completed" ? state : undefined;
        },
        { intervalMs: 50, timeoutMs: 10_000 },
      );

      // 수신자가 최종적으로 페이로드를 받았음(두 번째 hit 가 정상 응답).
      // hangNext(1) 이므로 첫 요청은 hang 후 ok-after-hang, 두 번째 요청은 즉시 ok.
      const matched = receiver.hits.filter(
        (h) => JSON.stringify(h.body) === JSON.stringify(payload),
      );
      expect(matched.length).toBeGreaterThanOrEqual(1);
    } finally {
      if (workerB) await workerB.close();
    }
  }, 30_000);
});
