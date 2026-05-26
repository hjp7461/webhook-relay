import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { startRedisContainer, type StartedRedis } from "./helpers/redis-container.js";
import { pollUntil, startApp, type AppFixture } from "./helpers/app-fixture.js";
import { delayForAttempt } from "@webhook-relay/core";

// IT-S3 — 재시도 가능 에러 + 지수 백오프
//
// PLAN `05` §3.2 / PRD `03` §3 IT-S3.
//
// 흐름:
// 1) Testcontainers Redis + 고유 큐(app-fixture).
// 2) 별도 stub HTTP 서버: 첫 K=3 회 503, K+1 번째 200. 호출 시각 캡처.
// 3) WEBHOOK_MAX_ATTEMPTS=5, WEBHOOK_BACKOFF_BASE_MS=200 으로 부팅.
// 4) 작업 1건 등록.
// 5) 폴링: BullMQ 상태 == completed, attemptsMade == 4.
// 6) 각 시도 간 지연이 delayForAttempt 와 ±20% 일치.
//
// 결정 잠금:
// - Q-RETRY-1/2/3 (a) — 결정성 우선.
// - PLAN §8 대안 A — 짧은 base + wall-clock 진행 + 짧은 polling.

const K = 3; // 처음 K 회는 503, K+1 번째에 200.
const BASE_MS = 200;
const MAX_ATTEMPTS = 5;
const TOLERANCE_RATIO = 0.2;

interface StubReceiver {
  readonly server: Server;
  readonly url: string;
  readonly hits: ReadonlyArray<number>; // 호출 시각(Date.now()).
  stop(): Promise<void>;
}

async function startFlakyReceiver(failFirst: number): Promise<StubReceiver> {
  const hits: number[] = [];
  const server = createServer((req, res) => {
    hits.push(Date.now());
    // request body 는 drain.
    req.on("data", () => {});
    req.on("end", () => {
      if (hits.length <= failFirst) {
        res.statusCode = 503;
        res.end("retry me");
      } else {
        res.statusCode = 200;
        res.end("ok");
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${addr.port}/`;
  return {
    server,
    url,
    get hits(): ReadonlyArray<number> {
      return hits;
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
  app = await startApp({
    redisUrl: redis.url,
    maxAttempts: MAX_ATTEMPTS,
    backoffBaseMs: BASE_MS,
  });
  receiver = await startFlakyReceiver(K);
}, 120_000);

afterAll(async () => {
  if (receiver) await receiver.stop();
  if (app) await app.stop();
  if (redis) await redis.stop();
}, 60_000);

describe("IT-S3 retriable backoff", () => {
  it("retries on 5xx with exponential backoff and finally completes", async () => {
    const idempotencyKey = `it-s3-${randomUUID()}`;
    const payload = { event: "retry.test", id: 1 };

    const res = await fetch(`${app.baseUrl}/webhooks`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${app.bearerToken}`,
      },
      body: JSON.stringify({ url: receiver.url, payload, idempotencyKey }),
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { jobId: string };
    const jobId = body.jobId;

    // 폴링: 최대 시도 4회 → 사이 지연 합 ≤ 200+400+800 = 1400ms + 처리시간.
    // 안전 마진 포함 8s 한도.
    await pollUntil(
      async () => {
        const state = await app.server.queue.getJobState(jobId);
        return state === "completed" ? state : undefined;
      },
      { intervalMs: 50, timeoutMs: 10_000 },
    );

    // attemptsMade == K + 1.
    const job = await app.server.queue.raw.getJob(jobId);
    expect(job).toBeDefined();
    expect(job?.attemptsMade).toBe(K + 1);

    // 호출 시각: 정확히 K + 1 건.
    const hits = receiver.hits;
    expect(hits.length).toBe(K + 1);

    // 각 시도 간 지연이 delayForAttempt 와 ±20% 일치.
    // delayForAttempt(1, base) 은 1차 실패 → 2차 시도까지의 지연.
    // 즉 hits[i] - hits[i-1] ≈ delayForAttempt(i, base).
    for (let i = 1; i < hits.length; i++) {
      const observed = (hits[i] as number) - (hits[i - 1] as number);
      const expected = delayForAttempt(i, BASE_MS);
      // wall-clock 변동성 + 처리 시간 흡수 — 단조 증가는 별도 단언.
      // ±20% 허용 오차이되, 하한은 expected*(1-tol)-50ms(잡 활성화 지연).
      const lower = Math.max(0, expected * (1 - TOLERANCE_RATIO) - 50);
      const upper = expected * (1 + TOLERANCE_RATIO) + 500; // upper 는 처리 시간 포함 넉넉히.
      expect(observed).toBeGreaterThanOrEqual(lower);
      expect(observed).toBeLessThanOrEqual(upper);
    }

    // 단조 증가(보조 단언): i+1 시도의 지연이 i 시도 이상.
    for (let i = 2; i < hits.length; i++) {
      const prev = (hits[i - 1] as number) - (hits[i - 2] as number);
      const cur = (hits[i] as number) - (hits[i - 1] as number);
      // 약간의 노이즈 허용 — 50ms 마진.
      expect(cur + 50).toBeGreaterThanOrEqual(prev);
    }
  }, 30_000);
});
