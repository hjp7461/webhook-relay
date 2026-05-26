import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startRedisContainer, type StartedRedis } from "./helpers/redis-container.js";
import { startApp, type AppFixture } from "./helpers/app-fixture.js";

// IT — GET /metrics (api/all mode)
//
// PLAN `docs/plan-phase3/02-m-obs-1-bootstrap.md` §3 시퀀스 3번.
//
// 단언:
//   - 200 응답.
//   - Content-Type 본문 prefix `text/plain; version=0.0.4`(charset 부분은
//     prom-client 버전에 따라 변동 가능하지만, version=0.0.4 까지는 안정).
//   - 본문에 `nodejs_*` 또는 `process_*` 접두의 prom-client 기본 메트릭 1건
//     이상 포함.
//   - 본 PLAN 범위에서는 C1~C11 도메인 메트릭 단언 없음(M-OBS-2 책임).

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

describe("GET /metrics — api/all mode", () => {
  it("returns 200 with Prometheus exposition Content-Type and default metrics", async () => {
    const res = await fetch(`${app.baseUrl}/metrics`);
    expect(res.status).toBe(200);

    const contentType = res.headers.get("content-type") ?? "";
    // Prometheus exposition format `version=0.0.4` 까지 안정 prefix.
    expect(contentType).toMatch(/^text\/plain; version=0\.0\.4/);

    const body = await res.text();
    // prom-client collectDefaultMetrics 가 등록하는 시리즈 — 최소 1건.
    const hasDefault = /^(nodejs|process)_/m.test(body);
    expect(hasDefault).toBe(true);
  });
});
