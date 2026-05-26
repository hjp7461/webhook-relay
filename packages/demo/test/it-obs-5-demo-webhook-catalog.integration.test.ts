import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { startRedisContainer, type StartedRedis } from "./helpers/redis-container.js";
import { pollUntil, startApp, type AppFixture } from "./helpers/app-fixture.js";

// IT-OBS-5 — Demo 웹훅 도메인 메트릭 카탈로그(W1~W4) 전건 노출
//
// PLAN `docs/plan-phase3/04-m-obs-3-demo-metrics.md` §3.
//
// 사전조건:
//   - api + worker 모드 부트스트랩 + Testcontainers Redis.
//   - 1회 happy-path 실행(IT-S1 fixture 재사용).
//
// 단언:
//   1) `webhook_relay_deliveries_total` (W1)
//        result="success", http_status_class="2xx", error_class="none" 라벨 행.
//   2) `webhook_relay_delivery_duration_seconds_bucket` (W2)
//   3) `webhook_relay_delivery_attempts_per_job_bucket` (W3)
//        outcome="completed" 라벨 행.
//   4) `webhook_relay_receiver_received_total` (W4) 1 이상.

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

describe("IT-OBS-5 demo webhook catalog W1-W4 exposure", () => {
  it("exposes all 4 demo webhook metrics after a happy-path job is processed", async () => {
    const targetUrl = `${app.baseUrl}/_demo/receiver`;
    const payload = { event: "it-obs-5.happy", id: 1 };
    const idempotencyKey = `it-obs-5-${randomUUID()}`;

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

    // W4 데모 수신자 카운트 안정화를 위해 짧게 대기.
    await new Promise((r) => setTimeout(r, 50));

    const metricsRes = await fetch(`${app.baseUrl}/metrics`);
    expect(metricsRes.status).toBe(200);
    const body = await metricsRes.text();

    // W1 — Counter 정의 + 성공 케이스 행.
    expect(body).toContain("webhook_relay_deliveries_total");
    expect(body).toMatch(
      /webhook_relay_deliveries_total\{[^}]*result="success"[^}]*http_status_class="2xx"[^}]*error_class="none"[^}]*\}\s+\d+/,
    );

    // W2 — Histogram bucket/sum/count.
    expect(body).toContain("webhook_relay_delivery_duration_seconds_bucket");
    expect(body).toContain("webhook_relay_delivery_duration_seconds_sum");
    expect(body).toContain("webhook_relay_delivery_duration_seconds_count");

    // W3 — outcome="completed" 라벨 행 등장.
    expect(body).toContain("webhook_relay_delivery_attempts_per_job_bucket");
    expect(body).toMatch(
      /webhook_relay_delivery_attempts_per_job_bucket\{[^}]*outcome="completed"[^}]*\}\s+\d+/,
    );
    expect(body).toContain("webhook_relay_delivery_attempts_per_job_sum");
    expect(body).toContain("webhook_relay_delivery_attempts_per_job_count");

    // W4 — Counter ≥ 1.
    expect(body).toContain("webhook_relay_receiver_received_total");
    const w4Match = body.match(/webhook_relay_receiver_received_total\s+(\d+)/);
    expect(w4Match).not.toBeNull();
    if (w4Match !== null && w4Match[1] !== undefined) {
      const v = Number.parseInt(w4Match[1], 10);
      expect(v).toBeGreaterThanOrEqual(1);
    }

    // W1 result enum 폐쇄성: 본 시나리오에서는 success 만 등장 가능.
    const w1Lines = body
      .split("\n")
      .filter((l) => l.startsWith("webhook_relay_deliveries_total{"));
    expect(w1Lines.length).toBeGreaterThan(0);
    const RESULT_RE = /result="([^"]+)"/;
    const ERR_RE = /error_class="([^"]+)"/;
    const ALLOWED_RESULTS = new Set([
      "success",
      "http_error",
      "network_error",
      "timeout",
      "ssrf_blocked",
    ]);
    const ALLOWED_ERROR_CLASSES = new Set([
      "none",
      "RetriableError",
      "NonRetriableError",
    ]);
    for (const line of w1Lines) {
      const r = line.match(RESULT_RE);
      if (r !== null && r[1] !== undefined) {
        expect(ALLOWED_RESULTS.has(r[1])).toBe(true);
      }
      const e = line.match(ERR_RE);
      if (e !== null && e[1] !== undefined) {
        expect(ALLOWED_ERROR_CLASSES.has(e[1])).toBe(true);
      }
    }
  });
});
