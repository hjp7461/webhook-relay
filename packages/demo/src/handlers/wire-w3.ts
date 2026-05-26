import { NonRetriableError } from "@webhook-relay/core";
import { UnrecoverableError, type Worker } from "bullmq";

import {
  W3_OUTCOME_COMPLETED,
  W3_OUTCOME_DLQ_MAX_ATTEMPTS,
  W3_OUTCOME_DLQ_NON_RETRIABLE,
  W3_OUTCOME_DLQ_STALLED_LOSS,
  type W3Outcome,
} from "../constants.js";
import { deliveryAttemptsPerJob } from "../metrics.js";

// demo/handlers/wire-w3.ts
//
// W3 `webhook_relay_delivery_attempts_per_job` wiring.
// PRD `prd-phase3/01` §3.3 W3 — 작업이 종단 상태(completed / DLQ 3종)에 도달
// 했을 때의 시도 수 분포.
//
// PRD `prd-phase3/02` §4.3 — 갱신 시점: Worker 'completed' / 'failed' 이벤트.
//
// 종단 판정 로직은 `core/worker.ts` 의 DLQ 적재 분기와 동일한 규칙을 사용한다
// (NonRetriableError 우선 → 그 외 attemptsMade >= attempts → stalled-loss).
// core 가 이미 동일 분기에서 C5 / C2 를 갱신하므로 본 wiring 은 핸들러 추가
// 부착만으로 W3 의 attempts 분포를 단일 출처(BullMQ Job)에서 측정한다.

/**
 * Worker 에 W3 wiring 핸들러를 부착한다. attach 후 분리 API 는 제공하지 않는다
 * (worker close 시점에 BullMQ 가 핸들러를 자동 정리).
 */
export function attachW3Wiring<TData>(
  worker: Worker<TData, void, string>,
): void {
  worker.on("completed", (job): void => {
    const attempts = computeAttemptsObserved(job?.attemptsMade);
    deliveryAttemptsPerJob.observe(
      { outcome: W3_OUTCOME_COMPLETED },
      attempts,
    );
  });

  worker.on("failed", (job, err): void => {
    if (job === undefined) {
      // 'failed(undefined)' = stalled-loss recovery 경로(core/worker.ts).
      // attemptsMade 정보는 core 의 activeJobs 맵에 있으나 본 hook 에서는
      // 알 수 없다. 보수적으로 1 로 관찰(W3 의 +Inf bucket 단언은 동일하게
      // +1 — IT-OBS-6.S6b 가 사용).
      deliveryAttemptsPerJob.observe(
        { outcome: W3_OUTCOME_DLQ_STALLED_LOSS },
        1,
      );
      return;
    }
    const outcome = classifyTerminalOutcome(job.attemptsMade, job.opts.attempts, err);
    if (outcome === undefined) {
      // 중간 실패 — 다음 시도가 스케줄됨. W3 는 종단에서만 관찰.
      return;
    }
    const attempts = computeAttemptsObserved(job.attemptsMade);
    deliveryAttemptsPerJob.observe({ outcome }, attempts);
  });
}

/**
 * BullMQ Job.attemptsMade 가 종단 시점에 무엇을 가리키는지에 대한 시맨틱은
 * 버전·이벤트별로 차이가 있어, 본 helper 는 최소값 1 을 보장한다(
 * `delivery_attempts_per_job` 의 의미는 "최소 1회 시도되었음").
 */
function computeAttemptsObserved(attemptsMade: number | undefined): number {
  if (typeof attemptsMade !== "number" || attemptsMade < 1) return 1;
  return attemptsMade;
}

function classifyTerminalOutcome(
  attemptsMade: number,
  attemptsOpt: number | undefined,
  err: Error,
): W3Outcome | undefined {
  // NonRetriable 분류 우선(즉시 격리 경로).
  const isNonRetriable =
    err instanceof UnrecoverableError ||
    err.name === "UnrecoverableError" ||
    err instanceof NonRetriableError ||
    isNonRetriableCause(err);
  const attempts = attemptsOpt ?? 1;
  const isTerminalByAttempts = attemptsMade >= attempts;

  if (isNonRetriable) return W3_OUTCOME_DLQ_NON_RETRIABLE;
  if (isTerminalByAttempts) return W3_OUTCOME_DLQ_MAX_ATTEMPTS;
  return undefined; // 중간 실패.
}

function isNonRetriableCause(err: Error): boolean {
  const cause = (err as Error & { cause?: unknown }).cause;
  return cause instanceof NonRetriableError;
}
