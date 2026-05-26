import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { startRedisContainer, type StartedRedis } from "./helpers/redis-container.js";
import { pollUntil, startApp, type AppFixture } from "./helpers/app-fixture.js";

// IT-OBS-2 — Core 메트릭 카탈로그(C1~C11) 전건 노출
//
// PLAN `docs/plan-phase3/03-m-obs-2-core-metrics.md` §3.2.
//
// 사전조건:
//   - Fastify api/all 모드 부트스트랩 + Testcontainers Redis.
//   - 1회 happy-path 작업 등록·처리(IT-S1 fixture 재사용).
//
// 단언(substring 검색):
//   1)  webhook_relay_queue_depth                                       (C1)
//   2)  webhook_relay_jobs_processed_total                              (C2)
//   3)  webhook_relay_job_attempts_total                                (C3)
//   4)  webhook_relay_worker_processing_duration_seconds_bucket         (C4)
//       webhook_relay_worker_processing_duration_seconds_sum
//       webhook_relay_worker_processing_duration_seconds_count
//   5)  webhook_relay_dlq_jobs_total                                    (C5)
//   6)  webhook_relay_worker_active_jobs                                (C6)
//   7)  webhook_relay_redis_reconnects_total                            (C7)
//   8)  webhook_relay_redis_up                                          (C8)
//   9)  webhook_relay_shutdown_state                                    (C9 — state 3종 enum 모두 등장)
//   10) webhook_relay_shutdown_remaining_jobs                           (C10)
//   11) webhook_relay_build_info                                        (C11)
//
// PLAN §3.2: 본 단계는 "메트릭이 노출되고 있다" 만 확인. 값 정확성은 IT-OBS-6
// (M-OBS-3) 책임.

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

describe("IT-OBS-2 core catalog C1-C11 exposure", () => {
  it("exposes all 11 core metrics after a happy-path job is processed", async () => {
    // 1회 happy-path 등록·처리(IT-S1 fixture 동일 패턴).
    const targetUrl = `${app.baseUrl}/_demo/receiver`;
    const payload = { event: "it-obs-2.tick", id: 1 };
    const idempotencyKey = `it-obs-2-${randomUUID()}`;

    const res = await fetch(`${app.baseUrl}/webhooks`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${app.bearerToken}`,
      },
      body: JSON.stringify({ url: targetUrl, payload, idempotencyKey }),
    });
    expect(res.status).toBe(202);
    const acceptBody = (await res.json()) as { jobId: string };

    await pollUntil(
      async () => {
        const state = await app.server.queue.getJobState(acceptBody.jobId);
        return state === "completed" ? state : undefined;
      },
      { intervalMs: 50, timeoutMs: 5_000 },
    );

    // 메트릭 스크레이프.
    const metricsRes = await fetch(`${app.baseUrl}/metrics`);
    expect(metricsRes.status).toBe(200);
    const body = await metricsRes.text();

    // C1
    expect(body).toContain("webhook_relay_queue_depth");
    // C2
    expect(body).toContain("webhook_relay_jobs_processed_total");
    // C3
    expect(body).toContain("webhook_relay_job_attempts_total");
    // C4 — bucket / sum / count 모두.
    expect(body).toContain("webhook_relay_worker_processing_duration_seconds_bucket");
    expect(body).toContain("webhook_relay_worker_processing_duration_seconds_sum");
    expect(body).toContain("webhook_relay_worker_processing_duration_seconds_count");
    // C5
    expect(body).toContain("webhook_relay_dlq_jobs_total");
    // C6
    expect(body).toContain("webhook_relay_worker_active_jobs");
    // C7
    expect(body).toContain("webhook_relay_redis_reconnects_total");
    // C8
    expect(body).toContain("webhook_relay_redis_up");
    // C9 — PRD §4.2 enum: running / draining / terminated 모두 등장.
    expect(body).toContain("webhook_relay_shutdown_state");
    expect(body).toMatch(/webhook_relay_shutdown_state\{state="running"\}/);
    expect(body).toMatch(/webhook_relay_shutdown_state\{state="draining"\}/);
    expect(body).toMatch(/webhook_relay_shutdown_state\{state="terminated"\}/);
    // C10
    expect(body).toContain("webhook_relay_shutdown_remaining_jobs");
    // C11 — build_info 값 1.
    expect(body).toContain("webhook_relay_build_info");
    expect(body).toMatch(/webhook_relay_build_info\{[^}]*\} 1/);
  });
});
