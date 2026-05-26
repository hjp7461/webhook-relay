import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { startRedisContainer, type StartedRedis } from "./helpers/redis-container.js";
import { pollUntil, startApp, type AppFixture } from "./helpers/app-fixture.js";

// IT-S5 — 재시도 불가 에러(4xx) 즉시 격리 + DLQ 적재
//
// PLAN `06` §3 / PRD `03` §3 IT-S5(강화).
//
// 본 M5 버전 범위(M4 의 단언을 보존하면서 DLQ 단언을 추가):
// - 수신자 첫 시도 400.
// - 단언:
//   - attemptsMade == 1, 수신자 호출 == 1 (즉시 격리, 재시도 없음).
//   - 원 큐(메인)에서 해당 jobId 가 사라짐(removeOnFail: { count: 0 }).
//   - DLQ 큐에 1건 적재.
//   - DLQ 항목 데이터: 원본 페이로드(url/payload/headers/idempotencyKey)
//     + lastError: { class: 'NonRetriable', httpStatus: 400, attemptsMade: 1 }.
//
// 결정 잠금:
// - Q-RETRY-1/2 (a) — 4xx 는 NonRetriableError → BullMQ UnrecoverableError 로 변환되어
//   재시도 없이 즉시 failed 로 종료.
// - Q-DLQ-1 (a) — 격리만, 자동 재투입 없음.

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

describe("IT-S5 non-retriable immediate dlq (M5 strengthened)", () => {
  it("4xx response → immediate DLQ, no retries, payload + lastError preserved", async () => {
    const idempotencyKey = `it-s5-${randomUUID()}`;
    const payload = { event: "nonretriable.test", id: 1 };
    const customHeader = { "x-test-trace": "it-s5" };

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

    // DLQ 적재까지 폴링: 원 큐에서 해당 jobId 가 사라지고 DLQ 에 1건 존재.
    await pollUntil(
      async () => {
        const stillInMainQueue = await app.server.queue.raw.getJob(jobId);
        const dlqCount = await app.dlqQueue.countJobs();
        if (stillInMainQueue === undefined && dlqCount >= 1) return true;
        return undefined;
      },
      { intervalMs: 50, timeoutMs: 5_000 },
    );

    // 수신자 호출 카운트 == 1 (재시도 없이 즉시 격리).
    expect(receiver.hits.length).toBe(1);

    // 원 큐에서 jobId 사라짐(removeOnFail: { count: 0 }).
    const mainJob = await app.server.queue.raw.getJob(jobId);
    expect(mainJob).toBeUndefined();

    // DLQ 단언: 정확히 1건.
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
    expect(entryData.lastError.class).toBe("NonRetriable");
    expect(entryData.lastError.httpStatus).toBe(400);
    expect(entryData.lastError.attemptsMade).toBe(1);

    // 추가 박오프 사이클(=400ms ~ 첫 backoff 200ms*2) 이상을 기다려도 추가 호출이 없음.
    await new Promise((r) => setTimeout(r, 600));
    expect(receiver.hits.length).toBe(1);
  }, 20_000);
});
