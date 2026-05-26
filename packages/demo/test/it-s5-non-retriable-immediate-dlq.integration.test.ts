import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { startRedisContainer, type StartedRedis } from "./helpers/redis-container.js";
import { pollUntil, startApp, type AppFixture } from "./helpers/app-fixture.js";

// IT-S5 — 재시도 불가 에러(4xx) 즉시 격리
//
// PLAN `05` §3.2 / PRD `03` §3 IT-S5.
//
// 본 M4 버전 범위:
// - 수신자 첫 시도 400.
// - 단언: attemptsMade == 1, BullMQ 상태 == failed, 수신자 호출 == 1.
// - DLQ 큐 단언은 M5 에서 추가(본 마일스톤 범위 외).
//
// 결정 잠금:
// - Q-RETRY-1/2 (a) — 4xx 는 NonRetriableError → BullMQ UnrecoverableError 로 변환되어
//   재시도 없이 즉시 failed 로 종료.

interface StubReceiver {
  readonly server: Server;
  readonly url: string;
  readonly hits: ReadonlyArray<number>;
  stop(): Promise<void>;
}

async function startAlways4xxReceiver(): Promise<StubReceiver> {
  const hits: number[] = [];
  const server = createServer((req, res) => {
    hits.push(Date.now());
    req.on("data", () => {});
    req.on("end", () => {
      res.statusCode = 400;
      res.end("bad");
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
  // MAX_ATTEMPTS=5 로 설정하더라도 NonRetriable 분류면 즉시 1회만 시도되어야 한다(불변식 I2.3).
  app = await startApp({
    redisUrl: redis.url,
    maxAttempts: 5,
    backoffBaseMs: 200,
  });
  receiver = await startAlways4xxReceiver();
}, 120_000);

afterAll(async () => {
  if (receiver) await receiver.stop();
  if (app) await app.stop();
  if (redis) await redis.stop();
}, 60_000);

describe("IT-S5 non-retriable immediate (M4-scope: no DLQ assertion)", () => {
  it("4xx response → attemptsMade == 1, failed, no further calls", async () => {
    const idempotencyKey = `it-s5-${randomUUID()}`;
    const payload = { event: "nonretriable.test", id: 1 };

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

    // failed 상태 폴링.
    await pollUntil(
      async () => {
        const state = await app.server.queue.getJobState(jobId);
        return state === "failed" ? state : undefined;
      },
      { intervalMs: 50, timeoutMs: 5_000 },
    );

    // attemptsMade == 1 — 즉시 격리(재시도 없음).
    const job = await app.server.queue.raw.getJob(jobId);
    expect(job).toBeDefined();
    expect(job?.attemptsMade).toBe(1);

    // 수신자 호출 카운트 == 1.
    expect(receiver.hits.length).toBe(1);

    // 한 박오프 사이클(=400ms ~ 첫 backoff 200ms*2) 이상을 기다려도 추가 호출이 없음.
    await new Promise((r) => setTimeout(r, 600));
    expect(receiver.hits.length).toBe(1);
  }, 20_000);
});
