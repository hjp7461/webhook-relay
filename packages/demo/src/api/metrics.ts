import type { FastifyInstance } from "fastify";
import { enableDefaultMetrics, getMetricsRegistry } from "@webhook-relay/core";
import { ROUTE_METRICS } from "../constants.js";

// demo/api/metrics.ts — GET /metrics
//
// Phase 3 PRD `prd-phase3/02` §3 — Prometheus scrape 표준 엔드포인트.
//
// 결정 잠금:
// - Q-OBS-1 (a) — 인증 없음(내부망 전제). 미들웨어 미적용.
// - Q-OBS-2 (a) — 셧다운 진행 중 200 유지. draining 분기에 본 라우트를
//   추가하지 않는다(다른 200-유지 라우트와 동일 패턴).
// - Q-OBS-10 (a) — 압축 강제 없음. Fastify 기본 협상 수용.

export async function registerMetricsRoute(app: FastifyInstance): Promise<void> {
  enableDefaultMetrics();
  const registry = getMetricsRegistry();
  app.route({
    method: "GET",
    url: ROUTE_METRICS,
    handler: async (_req, reply) => {
      const body = await registry.metrics();
      reply.header("content-type", registry.contentType);
      return body;
    },
  });
}
