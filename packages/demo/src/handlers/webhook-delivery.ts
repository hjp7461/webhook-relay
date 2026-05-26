import {
  NonRetriableError,
  RetriableError,
  type CoreJob,
  type CoreJobHandler,
} from "@webhook-relay/core";
import { WebhookJobDataSchema, type WebhookJobData } from "../domain/schemas.js";
import { deliver, type DeliverResult } from "./deliver.js";

// demo/handlers/webhook-delivery.ts
//
// core.createWorker 에 주입되는 핸들러.
// Redis 에서 꺼낸 job.data 를 WebhookJobDataSchema 로 재파싱(경계 검증, PRD `05` §7).
//
// M4 강화:
// - HMAC 시크릿/헤더 이름을 deliver 에 주입(송신 직전 서명 — PRD `06` §2.2).
// - 분류 결과 로깅(errorClass, httpStatus, attempt) — PRD `05` §9 2단계 필드.

export interface HandlerDeps {
  readonly deliveryTimeoutMs: number;
  readonly allowPrivateTargets: boolean;
  /** HMAC 서명 시크릿(>= 32 bytes; config Zod 강제). */
  readonly hmacSecret: string;
  /** HMAC 서명 헤더 이름(기본 'X-Webhook-Signature'). */
  readonly hmacHeaderName: string;
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
    // attempt 는 1-based(현재 시도가 몇 번째인가).
    // BullMQ 의 job.attemptsMade 는 핸들러 호출 시점에 이미 완료된 시도 횟수
    // 가 아니라 BullMQ 내부 시맨틱으로 "현재 시도"를 가리키는 값이 들어온다.
    // 안전을 위해 +1 로 정규화(이 정책은 M2/M3 핸들러와 동일).
    const attempt = job.attemptsMade + 1;
    const baseCtx: Record<string, unknown> = {
      jobId: job.id,
      idempotencyKey,
      attempt,
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
        hmacSecret: deps.hmacSecret,
        hmacHeaderName: deps.hmacHeaderName,
      });
      deps.log("info", "webhook delivery completed", {
        ...baseCtx,
        httpStatus: result.status,
        durationMs: result.durationMs,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // M4: 분류 결과를 로그 컨텍스트로 노출(PRD `05` §9 2단계 필드).
      // errorClass 는 RetriableError / NonRetriableError 중 하나, 또는 그 외 Error 의 name.
      let errorClass = err instanceof Error ? err.name : "Error";
      if (err instanceof NonRetriableError) errorClass = "NonRetriableError";
      else if (err instanceof RetriableError) errorClass = "RetriableError";
      const httpStatus =
        err instanceof RetriableError || err instanceof NonRetriableError
          ? err.httpStatus
          : undefined;
      // 시크릿/Authorization 헤더 값은 절대 로그에 등장하지 않는다(I6.1, AC5.4).
      const ctx: Record<string, unknown> = {
        ...baseCtx,
        errorClass,
        errorMessage: message,
      };
      if (httpStatus !== undefined) {
        ctx["httpStatus"] = httpStatus;
      }
      deps.log("warn", "webhook delivery failed", ctx);
      throw err;
    }
  };
}
