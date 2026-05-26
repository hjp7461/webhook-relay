import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startRedisContainer, type StartedRedis } from "./helpers/redis-container.js";
import { startApp, type AppFixture } from "./helpers/app-fixture.js";

// IT-OBS-1 — `/metrics` 응답 형식 & Content-Type
//
// PLAN `docs/plan-phase3/03-m-obs-2-core-metrics.md` §3.1.
//
// 단언:
//   - `GET /metrics` 응답 상태 `200`.
//   - 헤더 `content-type` 가 정확한 prom-client exposition format 헤더
//     (`text/plain; version=0.0.4; charset=utf-8`) 을 포함.
//   - 응답 본문이 prom-client exposition format 을 따르는지 정규식 단언
//     (`# HELP` 와 `# TYPE` 라인이 각각 1건 이상 등장).
//
// 본 테스트는 M-OBS-1 (라우트 골격 + default metrics) 시점에 이미 그린이며,
// M-OBS-2 단계에서도 그린 유지가 요구되는 회귀 가드다(PLAN `03` §3.1 단서).

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

describe("IT-OBS-1 /metrics response format & content-type", () => {
  it("returns 200 with the exact Prometheus exposition Content-Type", async () => {
    const res = await fetch(`${app.baseUrl}/metrics`);
    expect(res.status).toBe(200);

    const contentType = res.headers.get("content-type") ?? "";
    // PRD `prd-phase3/02` §3.2 — `text/plain; version=0.0.4; charset=utf-8`.
    expect(contentType).toContain("text/plain");
    expect(contentType).toContain("version=0.0.4");
    expect(contentType).toContain("charset=utf-8");
  });

  it("returns a body in prom-client exposition format (# HELP + # TYPE lines)", async () => {
    const res = await fetch(`${app.baseUrl}/metrics`);
    const body = await res.text();
    // exposition format: 각 메트릭은 `# HELP <name> <help>` + `# TYPE <name> <type>`
    // + samples. 본 단계에서는 최소 1쌍이 존재함을 단언.
    expect(body).toMatch(/^# HELP /m);
    expect(body).toMatch(/^# TYPE /m);
    expect(body.length).toBeGreaterThan(0);
  });
});
