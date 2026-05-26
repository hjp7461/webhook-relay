import type { FastifyInstance } from "fastify";
import type { Redis } from "ioredis";
import { ROUTE_HEALTHZ } from "../constants.js";

// demo/api/healthz.ts — GET /healthz
//
// Redis ping. 끊김 시 503 (Q-SEC-5 (a)). 인증 없음(LB/오케스트레이터 호환).
//
// M7: 셧다운 진행 중에도 503 으로 일관 응답한다(Q-SEC-5 (a) 정합 —
// LB/오케스트레이터가 draining 상태를 인지해 트래픽 전환).

export interface HealthzRouteDeps {
  readonly connection: Redis;
  /**
   * 셧다운 진행 중 여부. true 면 본 라우트는 Redis ping 결과와 관계없이
   * 503 응답(PRD `06` §6.2.3, AC6.4).
   */
  readonly isDraining: () => boolean;
}

export async function registerHealthzRoute(
  app: FastifyInstance,
  deps: HealthzRouteDeps,
): Promise<void> {
  app.get(ROUTE_HEALTHZ, async (_req, reply) => {
    if (deps.isDraining()) {
      return reply.code(503).send({ status: "draining" });
    }
    try {
      const res = await deps.connection.ping();
      if (res === "PONG") {
        return reply.code(200).send({ status: "ok" });
      }
      return reply.code(503).send({ status: "degraded", reason: "unexpected_ping_response" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(503).send({ status: "degraded", reason: message });
    }
  });
}
