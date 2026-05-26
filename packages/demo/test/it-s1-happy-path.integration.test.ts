import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { startRedisContainer, type StartedRedis } from "./helpers/redis-container.js";
import { pollUntil, startApp, type AppFixture } from "./helpers/app-fixture.js";

// IT-S1 — Happy path
//
// PLAN `03` §3.2.
// 1) Testcontainers 로 Redis 기동.
// 2) 고유 큐 prefix 의 Fastify 앱 + Worker 1개 in-process.
// 3) POST /webhooks → 202 + jobId 단언.
// 4) 50ms × 최대 5s polling 으로 BullMQ 상태 == completed 그리고 동일 페이로드 수신 확인.
//
// IT-S1b — Authorization 누락 시 401.
// 결정 잠금 Q-API-1 (b) — 본 테스트는 동일 파일에 묶어 둔다.

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

describe("IT-S1 happy path", () => {
  it("POST /webhooks → 202 + jobId → worker delivers to /_demo/receiver", async () => {
    const targetUrl = `${app.baseUrl}/_demo/receiver`;
    const payload = { event: "user.created", id: 42 };
    // M3 에서 idempotencyKey 는 필수. 테스트 격리를 위해 고유 키.
    const idempotencyKey = `it-s1-${randomUUID()}`;

    const res = await fetch(`${app.baseUrl}/webhooks`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${app.bearerToken}`,
      },
      body: JSON.stringify({ url: targetUrl, payload, idempotencyKey }),
    });

    expect(res.status).toBe(202);
    const body = (await res.json()) as { jobId: string };
    expect(typeof body.jobId).toBe("string");
    expect(body.jobId.length).toBeGreaterThan(0);

    // BullMQ 상태가 completed 인지 확인하기 위해 queue.getJob().getState() 폴링.
    await pollUntil(
      async () => {
        const state = await app.server.queue.getJobState(body.jobId);
        return state === "completed" ? state : undefined;
      },
      { intervalMs: 50, timeoutMs: 5_000 },
    );

    // 데모 수신자가 동일 페이로드를 받았는지 확인.
    const received = app.server.receiverStore.list();
    const hit = received.find(
      (r) => JSON.stringify(r.body) === JSON.stringify(payload),
    );
    expect(hit).toBeDefined();
  });
});

describe("IT-S1b auth", () => {
  it("returns 401 when Authorization header is missing", async () => {
    const res = await fetch(`${app.baseUrl}/webhooks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: `${app.baseUrl}/_demo/receiver`,
        payload: { x: 1 },
      }),
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as {
      error: { code: string; message: string; details?: unknown[] };
    };
    expect(body.error.code).toBe("ERR_UNAUTHORIZED");
  });

  it("returns 401 when Bearer token mismatches", async () => {
    const res = await fetch(`${app.baseUrl}/webhooks`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer not-the-right-token-padded-to-32x",
      },
      body: JSON.stringify({
        url: `${app.baseUrl}/_demo/receiver`,
        payload: { x: 1 },
      }),
    });
    expect(res.status).toBe(401);
  });
});
