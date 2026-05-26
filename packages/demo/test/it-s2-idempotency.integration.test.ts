import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { startRedisContainer, type StartedRedis } from "./helpers/redis-container.js";
import { pollUntil, startApp, type AppFixture } from "./helpers/app-fixture.js";

// IT-S2 — Idempotency
//
// PLAN `04` §3.2.
// 1) Testcontainers Redis + 고유 큐 prefix(app-fixture.ts 에서 처리).
// 2) in-process Fastify + Worker(M2 의 app-fixture 헬퍼 재사용).
// 3) 데모 수신자 호출 카운트는 server.receiverStore.size() 로 측정.
// 4) 동일 `idempotencyKey` 로 동시 3회 `Promise.all` 병렬 POST. 유효 Bearer 헤더 포함.
// 5) 단언: 3개 응답 모두 `202`, 3개 응답의 jobId 가 모두 동일(= idempotencyKey).
// 6) 폴링(50ms × 최대 5s): BullMQ completed count == 1, 수신자 카운트 == 1.
//
// 결정 잠금: Q-API-2 (a) — `202 Accepted` + 동일 jobId.

let redis: StartedRedis;
let app: AppFixture;

beforeAll(async () => {
  redis = await startRedisContainer();
  app = await startApp({ redisUrl: redis.url });
}, 120_000);

afterAll(async () => {
  if (app) await app.stop();
  if (redis) await redis.stop();
}, 60_000);

describe("IT-S2 idempotency", () => {
  it("same idempotencyKey N times → exactly one execution + one delivery", async () => {
    // 테스트별 고유 키(다른 IT 테스트와 격리).
    const idempotencyKey = `it-s2-${randomUUID()}`;
    const targetUrl = `${app.baseUrl}/_demo/receiver`;
    const payload = { event: "user.created", id: 7 };

    const sizeBefore = app.server.receiverStore.size();

    const requestBody = JSON.stringify({
      url: targetUrl,
      payload,
      idempotencyKey,
    });

    const doPost = (): Promise<Response> =>
      fetch(`${app.baseUrl}/webhooks`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${app.bearerToken}`,
        },
        body: requestBody,
      });

    // 동시 3회 병렬 POST.
    const responses = await Promise.all([doPost(), doPost(), doPost()]);

    for (const res of responses) {
      expect(res.status).toBe(202);
    }
    const bodies = (await Promise.all(
      responses.map((r) => r.json()),
    )) as Array<{ jobId: string }>;

    // 모든 jobId 가 동일하고 비어 있지 않음.
    expect(bodies[0]?.jobId).toBeTruthy();
    expect(bodies[0]?.jobId).toBe(idempotencyKey);
    expect(bodies[1]?.jobId).toBe(bodies[0]?.jobId);
    expect(bodies[2]?.jobId).toBe(bodies[0]?.jobId);

    const jobId = bodies[0]!.jobId;

    // BullMQ completed 카운트 == 1 (= 동일 키로 큐 적재가 1회만 일어남).
    await pollUntil(
      async () => {
        const state = await app.server.queue.getJobState(jobId);
        return state === "completed" ? state : undefined;
      },
      { intervalMs: 50, timeoutMs: 5_000 },
    );

    const counts = await app.server.queue.raw.getJobCounts(
      "completed",
      "failed",
      "active",
      "waiting",
      "delayed",
    );
    expect(counts["completed"] ?? 0).toBe(1);
    expect(counts["failed"] ?? 0).toBe(0);
    expect(counts["active"] ?? 0).toBe(0);
    expect(counts["waiting"] ?? 0).toBe(0);
    expect(counts["delayed"] ?? 0).toBe(0);

    // 수신자 카운트 == 1 (정확히 1건 도착).
    const sizeAfter = app.server.receiverStore.size();
    expect(sizeAfter - sizeBefore).toBe(1);
  });
});
