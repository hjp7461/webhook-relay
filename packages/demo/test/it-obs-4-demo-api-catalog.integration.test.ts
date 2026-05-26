import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { startRedisContainer, type StartedRedis } from "./helpers/redis-container.js";
import { startApp, type AppFixture } from "./helpers/app-fixture.js";

// IT-OBS-4 — Demo API 메트릭 카탈로그(D1~D3) 전건 노출
//
// PLAN `docs/plan-phase3/04-m-obs-3-demo-metrics.md` §3.
//
// 사전조건:
//   - api/all 모드 부트스트랩.
//   - 1회 `POST /webhooks` 호출.
//
// 단언:
//   1) `webhook_relay_api_requests_total` (D1)
//        route="/webhooks", method="POST", status_class="2xx" 라벨 행 존재.
//   2) `webhook_relay_api_request_duration_seconds_bucket` (D2)
//   3) `webhook_relay_api_request_body_bytes_bucket` (D3)
//   4) D1 의 route 라벨이 ROUTE_ENUM 7종 외 값 0건(Q-OBS-8 (a)).

const ALLOWED_ROUTES: ReadonlySet<string> = new Set([
  "/webhooks",
  "/_demo/receiver",
  "/dashboard",
  "/dashboard/...",
  "/api/queue/stats",
  "/healthz",
  "/metrics",
]);

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

describe("IT-OBS-4 demo API catalog D1-D3 exposure", () => {
  it("exposes all 3 demo API metrics after a POST /webhooks call", async () => {
    const targetUrl = `${app.baseUrl}/_demo/receiver`;
    const idempotencyKey = `it-obs-4-${randomUUID()}`;
    const res = await fetch(`${app.baseUrl}/webhooks`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${app.bearerToken}`,
      },
      body: JSON.stringify({
        url: targetUrl,
        payload: { event: "it-obs-4.tick", id: 1 },
        idempotencyKey,
      }),
    });
    expect(res.status).toBe(202);

    const metricsRes = await fetch(`${app.baseUrl}/metrics`);
    expect(metricsRes.status).toBe(200);
    const body = await metricsRes.text();

    // D1 metric 정의 등장.
    expect(body).toContain("webhook_relay_api_requests_total");
    // D1: 본 시나리오에서 POST /webhooks 2xx 라벨 행이 반드시 존재.
    expect(body).toMatch(
      /webhook_relay_api_requests_total\{[^}]*route="\/webhooks"[^}]*method="POST"[^}]*status_class="2xx"[^}]*\}\s+\d+/,
    );
    // D2 — Histogram 의 `_bucket` 시리즈가 등장.
    expect(body).toContain("webhook_relay_api_request_duration_seconds_bucket");
    expect(body).toContain("webhook_relay_api_request_duration_seconds_sum");
    expect(body).toContain("webhook_relay_api_request_duration_seconds_count");
    // D3 — POST /webhooks 본문 body bytes.
    expect(body).toContain("webhook_relay_api_request_body_bytes_bucket");
    expect(body).toContain("webhook_relay_api_request_body_bytes_sum");
    expect(body).toContain("webhook_relay_api_request_body_bytes_count");
  });

  it("D1/D2 route labels stay within the 7-route enum (Q-OBS-8 (a))", async () => {
    // 추가로 /healthz, /metrics 등을 한 번씩 호출해 라벨 셋이 풍부해지게.
    await fetch(`${app.baseUrl}/healthz`);
    await fetch(`${app.baseUrl}/metrics`);
    await fetch(`${app.baseUrl}/api/queue/stats`);
    await fetch(`${app.baseUrl}/dashboard`);

    const metricsRes = await fetch(`${app.baseUrl}/metrics`);
    const body = await metricsRes.text();
    const lines = body.split("\n");
    const ROUTE_RE = /route="([^"]+)"/;
    for (const line of lines) {
      if (
        !line.startsWith("webhook_relay_api_requests_total{") &&
        !line.startsWith("webhook_relay_api_request_duration_seconds_bucket{") &&
        !line.startsWith("webhook_relay_api_request_duration_seconds_sum{") &&
        !line.startsWith("webhook_relay_api_request_duration_seconds_count{") &&
        !line.startsWith("webhook_relay_api_request_body_bytes_bucket{") &&
        !line.startsWith("webhook_relay_api_request_body_bytes_sum{") &&
        !line.startsWith("webhook_relay_api_request_body_bytes_count{")
      ) {
        continue;
      }
      const found = line.match(ROUTE_RE);
      if (found === null) continue;
      const route = found[1] ?? "";
      expect(ALLOWED_ROUTES.has(route)).toBe(true);
    }
  });
});
