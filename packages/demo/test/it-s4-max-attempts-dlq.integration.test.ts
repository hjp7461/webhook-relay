import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { startRedisContainer, type StartedRedis } from "./helpers/redis-container.js";
import { pollUntil, startApp, type AppFixture } from "./helpers/app-fixture.js";

// IT-S4 — max attempts 초과 → DLQ 이동
//
// PLAN `06` §3.1 / PRD `03` §3 IT-S4.
//
// 흐름:
// 1) Testcontainers Redis + 고유 큐 prefix(app-fixture).
// 2) 별도 stub HTTP 서버: 항상 503.
// 3) WEBHOOK_MAX_ATTEMPTS=3, WEBHOOK_BACKOFF_BASE_MS=100 (테스트 단축).
// 4) 작업 1건 등록.
// 5) 폴링(최대 5초): 원 큐에서 jobId 사라짐 + DLQ 에 1건.
// 6) DLQ 항목 데이터: 원본 페이로드(url/payload/headers/idempotencyKey)
//    + lastError: { class: 'Retriable', httpStatus: 503, attemptsMade: 3 }.
//
// 결정 잠금:
// - Q-RETRY-1/2/3 (a) — 5xx 는 Retriable, jitter 없음.
// - Q-DLQ-1 (a) — 격리만, 자동 재투입 없음.

const MAX_ATTEMPTS = 3;
const BASE_MS = 100;

interface StubReceiver {
  readonly server: Server;
  readonly url: string;
  readonly hits: ReadonlyArray<number>;
  stop(): Promise<void>;
}

async function startAlways503Receiver(): Promise<StubReceiver> {
  const hits: number[] = [];
  const server = createServer((req, res) => {
    hits.push(Date.now());
    req.on("data", () => {});
    req.on("end", () => {
      res.statusCode = 503;
      res.end("nope");
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
  receiver = await startAlways503Receiver();
}, 120_000);

afterAll(async () => {
  if (receiver) await receiver.stop();
  if (app) await app.stop();
  if (redis) await redis.stop();
}, 60_000);

describe("IT-S4 max attempts dlq", () => {
  it("after max attempts exhausted → main queue empty, DLQ contains entry with payload + lastError", async () => {
    const idempotencyKey = `it-s4-${randomUUID()}`;
    const payload = { event: "max.attempts.test", id: 7 };
    const customHeader = { "x-test-trace": "it-s4" };

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
        headers: customHeader,
      }),
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { jobId: string };
    const jobId = body.jobId;

    // 폴링: 원 큐에서 jobId 가 사라지고 DLQ 에 1건이 들어올 때까지.
    // backoff: 100 * (1 + 2 + 4) = 700ms 의 백오프 + 처리시간. 5초 한도면 넉넉.
    await pollUntil(
      async () => {
        const stillInMainQueue = await app.server.queue.raw.getJob(jobId);
        const dlqCount = await app.dlqQueue.countJobs();
        if (stillInMainQueue === undefined && dlqCount >= 1) return true;
        return undefined;
      },
      { intervalMs: 50, timeoutMs: 5_000 },
    );

    // 수신자가 정확히 MAX_ATTEMPTS 회 호출됨.
    expect(receiver.hits.length).toBe(MAX_ATTEMPTS);

    // 원 큐에서 사라짐(removeOnFail: { count: 0 }).
    const mainJob = await app.server.queue.raw.getJob(jobId);
    expect(mainJob).toBeUndefined();

    // DLQ 단언.
    const dlqJobs = await app.dlqQueue.listJobs();
    expect(dlqJobs.length).toBe(1);
    const entry = dlqJobs[0] as { id: string; name: string; data: unknown };
    const entryData = entry.data as {
      data: {
        url: string;
        payload: Record<string, unknown>;
        headers?: Record<string, string>;
        idempotencyKey?: string;
      };
      lastError: {
        class: "Retriable" | "NonRetriable";
        httpStatus?: number;
        attemptsMade: number;
        message?: string;
      };
    };
    // 원본 페이로드 보존.
    expect(entryData.data.url).toBe(receiver.url);
    expect(entryData.data.payload).toEqual(payload);
    expect(entryData.data.headers).toEqual(customHeader);
    expect(entryData.data.idempotencyKey).toBe(idempotencyKey);
    // lastError 컨텍스트.
    expect(entryData.lastError.class).toBe("Retriable");
    expect(entryData.lastError.httpStatus).toBe(503);
    expect(entryData.lastError.attemptsMade).toBe(MAX_ATTEMPTS);
  }, 20_000);
});
