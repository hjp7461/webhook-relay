import type { FastifyInstance } from "fastify";
import type { Queue } from "bullmq";
import { addJob } from "@webhook-relay/core";
import { ROUTE_WEBHOOKS, ERROR_CODES } from "../constants.js";
import {
  WebhookCreateRequestSchema,
  type WebhookJobData,
} from "../domain/schemas.js";

// demo/api/webhooks.ts — POST /webhooks
//
// 결정 잠금 Q-API-1 (b): Authorization: Bearer <API_BEARER_TOKEN> 검증.
// Q-API-2 (a): 멱등성 재요청도 `202 Accepted` + 동일 jobId(= idempotencyKey).
// Q-API-3 (a): 헤더 블랙리스트는 outgoing 송신 측(deliver.ts)에서 적용.
// Q-API-4 (a): 응답은 { jobId } 만.

export interface WebhooksRouteDeps {
  readonly queue: Queue<WebhookJobData, void, string>;
  readonly bearerToken: string;
}

export async function registerWebhooksRoute(
  app: FastifyInstance,
  deps: WebhooksRouteDeps,
): Promise<void> {
  app.post(ROUTE_WEBHOOKS, {
    // Fastify 라우트 단위로 Authorization 가드를 건다(전역 훅이 healthz/
    // dashboard 를 막지 않도록 의도적으로 라우트 한정).
    preHandler: async (req, reply) => {
      const auth = req.headers["authorization"];
      if (!isValidBearer(auth, deps.bearerToken)) {
        await reply.code(401).send({
          error: {
            code: ERROR_CODES.UNAUTHORIZED,
            message: "Authentication required",
            details: [],
          },
        });
      }
    },
    handler: async (req, reply) => {
      const parsed = WebhookCreateRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        const details = parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        }));
        return reply.code(400).send({
          error: {
            code: ERROR_CODES.VALIDATION,
            message: "Invalid request body",
            details,
          },
        });
      }

      // M3: idempotencyKey 를 BullMQ jobId 로 사용한다(PRD `02` §F2.1).
      // BullMQ 는 동일 jobId 로 add 시 새 작업 생성을 무시하여 중복을 흡수.
      // Q-API-2 (a) — 멱등성 재요청도 동일 jobId 로 `202` 응답.
      const idempotencyKey = parsed.data.idempotencyKey;
      const data: WebhookJobData = {
        url: parsed.data.url,
        payload: parsed.data.payload,
        idempotencyKey,
        ...(parsed.data.headers !== undefined ? { headers: parsed.data.headers } : {}),
      };
      const result = await addJob(deps.queue, "deliver", data, {
        jobId: idempotencyKey,
      });
      return reply.code(202).send({ jobId: result.jobId });
    },
  });
}

// `Bearer <token>` 형식이며 token 이 일치하는지. 비교는 일정 시간(상수 시간 비교는
// 본 단계 범위 외 — 시크릿이 32 bytes 짧은 문자열이므로 timing leak 위험은
// 본 PRD 범위에서 미고려).
function isValidBearer(authHeader: string | string[] | undefined, expected: string): boolean {
  if (Array.isArray(authHeader)) return false;
  if (typeof authHeader !== "string") return false;
  const trimmed = authHeader.trim();
  if (!trimmed.toLowerCase().startsWith("bearer ")) return false;
  const token = trimmed.slice("bearer ".length).trim();
  return token === expected;
}
