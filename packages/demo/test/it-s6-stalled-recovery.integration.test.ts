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
// 2) buildServer 가 띄운 in-process Worker 는 본 시나리오에서 사용하지 않는다
//    — 즉시 close 해 작업 경쟁자에서 제외(워커 A/B 모두 SharedWorker 로 부팅).
// 3) 워커 A (SharedWorker) — 짧은 lockDuration + 짧은 stalledInterval. 첫 작업을
//    잡고 핸들러가 수신자의 의도적 hang 응답을 기다리는 동안 `close(true)` 강제
//    종료. BullMQ 는 lock 갱신을 멈추고, lockDuration 후 lock 만료.
// 4) 워커 B (SharedWorker) — 같은 옵션. stalledInterval 마다 만료 lock 을 감지해
//    작업을 'wait' 로 되돌리고 픽업해 두 번째 시도(이번엔 정상 응답)로 완료.
// 5) 폴링(최대 10초): BullMQ 작업 상태 == completed + 수신자가 페이로드 수신.
//
// 결정 잠금:
// - Q-STALL-1 (a) — STALLED_INTERVAL_MS 단일 env 채널(운영 30s, 테스트 단축).
// - F2.5 — 자체 stalled 매니저 금지. BullMQ 메커니즘에만 의존.
//
// 주의(PRD `03` §3 메모):
//   본 테스트는 wall-clock 의존 불가피. stalledInterval / lockDuration 을
//   짧게 두는 것 외에는 fake timer 적용이 어렵다.
//
//   lockDuration 은 env/AppConfig 에 노출하지 않고 SharedWorker 헬퍼의
//   테스트 전용 옵션 채널로만 단축한다(PRD `05` §8 미확장).

const STALLED_INTERVAL_MS = 500;
const MAX_STALLED_COUNT = 1;
// 워커 A 의 lock 이 만료될 때까지 BullMQ 의 lock 갱신 멈춘 시점부터 기다리는 시간.
// lock 갱신은 lockDuration/2 마다 일어나므로, lockDuration=1000ms 면 force close
// 후 최대 1000ms 안에 lock 이 만료된다.
const LOCK_DURATION_MS = 1_000;
// 핸들러가 첫 시도에서 매달리는 시간. lockDuration + stalledInterval * (maxStalledCount+1)
// 이상이어야 워커 B 가 회수 후 두 번째 시도를 시작할 때까지 hang 응답이 돌아오지 않는다.
// 1000 + 500*2 = 2000. 안전 마진 + 1000.
const HANG_MS = 3_000;

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
        // 의도적 hang. 워커 A 의 lock 이 만료되어 워커 B 가 회수해 두 번째 시도를
        // 시작할 때까지 첫 응답이 돌아오지 않게 한다. 회수 시점 이후 응답이 와도
        // 워커 A 는 이미 close 되어 결과 적용이 무시된다.
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
  // app-fixture 의 buildServer Worker 는 본 시나리오의 워커 A/B 와 옵션(특히
  // lockDuration)을 맞추기 어렵다(LOCK_DURATION_MS 는 env 미노출). 즉시 close 해
  // 작업 경쟁자에서 제외하고, 워커 A/B 모두 SharedWorker 로 부팅.
  app = await startApp({
    redisUrl: redis.url,
    // 회수 후 다음 시도에서 성공해야 하므로 attempts >= 2 필요. 짧은 백오프.
    maxAttempts: 3,
    backoffBaseMs: 50,
    stalledIntervalMs: STALLED_INTERVAL_MS,
    maxStalledCount: MAX_STALLED_COUNT,
  });
  // buildServer 워커는 본 테스트에서 사용하지 않음.
  await app.server.worker.close();
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

    let workerA: SharedWorker | undefined;
    let workerB: SharedWorker | undefined;
    try {
      // 워커 A 부팅. 짧은 lockDuration / stalledInterval.
      workerA = await startSharedWorker({
        redisUrl: redis.url,
        queueName: app.queueName,
        label: "worker-A",
        stalledIntervalMs: STALLED_INTERVAL_MS,
        maxStalledCount: MAX_STALLED_COUNT,
        lockDurationMs: LOCK_DURATION_MS,
        concurrency: 1,
      });

      // 작업 등록(워커 A 가 픽업).
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

      // 워커 B 부팅. 같은 큐 + 같은 옵션 + 다른 라벨/연결.
      workerB = await startSharedWorker({
        redisUrl: redis.url,
        queueName: app.queueName,
        label: "worker-B",
        stalledIntervalMs: STALLED_INTERVAL_MS,
        maxStalledCount: MAX_STALLED_COUNT,
        lockDurationMs: LOCK_DURATION_MS,
        concurrency: 1,
      });

      // 워커 A 를 강제 종료. BullMQ Worker.close(true) — 진행 중 작업을 기다리지
      // 않고 즉시 닫는다. lock 갱신이 멈춰 lockDuration 후 lock 만료. 워커 B 의
      // stalled scanner 가 다음 stalledInterval 사이클에서 회수.
      await workerA.close(true);

      // 폴링: BullMQ 작업 상태 == completed.
      await pollUntil(
        async () => {
          const job = await app.server.queue.raw.getJob(jobId);
          if (!job) return undefined;
          const state = await job.getState();
          return state === "completed" ? state : undefined;
        },
        { intervalMs: 50, timeoutMs: 10_000 },
      );

      // 수신자가 최종적으로 페이로드를 받았음. 두 번째 hit(워커 B 의 재시도)이
      // 정상 응답을 받아야 한다 — 본 단언은 핸들러가 실제로 두 번 호출되었고
      // 두 번째가 성공했음을 함의.
      const matched = receiver.hits.filter(
        (h) => JSON.stringify(h.body) === JSON.stringify(payload),
      );
      expect(matched.length).toBeGreaterThanOrEqual(2);
    } finally {
      // 워커 A 는 이미 닫혔거나, 실패 경로에서는 정리.
      if (workerA) await workerA.close();
      if (workerB) await workerB.close();
    }
  }, 30_000);
});
