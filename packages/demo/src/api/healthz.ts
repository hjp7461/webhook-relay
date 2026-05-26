import type { FastifyInstance } from "fastify";
import type { Redis } from "ioredis";
import { ROUTE_HEALTHZ } from "../constants.js";

// demo/api/healthz.ts — GET /healthz
//
// Redis ping. 끊김 시 503 (Q-SEC-5 (a)). 인증 없음(LB/오케스트레이터 호환).

export interface HealthzRouteDeps {
  readonly connection: Redis;
}

export async function registerHealthzRoute(
  app: FastifyInstance,
  deps: HealthzRouteDeps,
): Promise<void> {
  app.get(ROUTE_HEALTHZ, async (_req, reply) => {
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
