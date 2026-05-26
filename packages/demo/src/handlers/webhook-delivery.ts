import type { CoreJob, CoreJobHandler } from "@webhook-relay/core";
import { WebhookJobDataSchema, type WebhookJobData } from "../domain/schemas.js";
import { deliver, type DeliverResult } from "./deliver.js";

// demo/handlers/webhook-delivery.ts
//
// core.createWorker 에 주입되는 핸들러.
// Redis 에서 꺼낸 job.data 를 WebhookJobDataSchema 로 재파싱(경계 검증, PRD `05` §7).

export interface HandlerDeps {
  readonly deliveryTimeoutMs: number;
  readonly allowPrivateTargets: boolean;
  /** 구조화 로그 출력 함수. server.ts 가 fastify.log 등을 주입. */
  readonly log: (
    level: "info" | "warn" | "error",
    msg: string,
    ctx: Record<string, unknown>,
  ) => void;
  /** 큐 이름(로그 컨텍스트). */
  readonly queueName: string;
}

export function createWebhookDeliveryHandler(
  deps: HandlerDeps,
): CoreJobHandler<unknown> {
  return async (job: CoreJob<unknown>): Promise<void> => {
    // 경계 재검증(Redis 페이로드는 unknown 으로 취급).
    const data: WebhookJobData = WebhookJobDataSchema.parse(job.data);

    // M3: BullMQ jobId == idempotencyKey (api/webhooks.ts 에서 그렇게 적재).
    // PRD `05` §9 — 2단계부터 idempotencyKey 는 구조화 로그 필수 컨텍스트.
    // `data.idempotencyKey` 도 동일 값이지만, BullMQ 가 보장하는 식별자인
    // `job.id` 를 단일 출처로 사용한다(중복 적재 흡수 후에도 동일).
    const idempotencyKey = job.id;
    const baseCtx: Record<string, unknown> = {
      jobId: job.id,
      idempotencyKey,
      attempt: job.attemptsMade + 1,
      queueName: deps.queueName,
    };

    deps.log("info", "webhook delivery started", baseCtx);

    try {
      const result: DeliverResult = await deliver({
        url: data.url,
        payload: data.payload,
        ...(data.headers !== undefined ? { headers: data.headers } : {}),
        timeoutMs: deps.deliveryTimeoutMs,
        allowPrivateTargets: deps.allowPrivateTargets,
      });
      deps.log("info", "webhook delivery completed", {
        ...baseCtx,
        httpStatus: result.status,
        durationMs: result.durationMs,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const name = err instanceof Error ? err.name : "Error";
      // 시크릿/Authorization 헤더 값은 절대 로그에 등장하지 않는다(I6.1, AC5.4).
      deps.log("warn", "webhook delivery failed", {
        ...baseCtx,
        errorClass: name,
        errorMessage: message,
      });
      throw err;
    }
  };
}
