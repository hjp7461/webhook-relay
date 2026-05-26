// core/retry.ts
//
// 재시도 정책 표현 + BullMQ Worker 옵션 빌더.
//
// 본 모듈의 책임:
// 1. RetryPolicy 타입 — maxAttempts, backoffBaseMs (도메인 비의존).
// 2. delayForAttempt(attempt, baseMs) — 결정성 지수 백오프 공식
//    (`baseMs * 2^(attempt-1)`). Q-RETRY-3 (a) — jitter 없음.
// 3. buildWorkerRetryOptions(policy) — BullMQ 표준 옵션(`attempts` +
//    `backoff: { type: 'exponential', delay }`). 자체 백오프 구현은 금지
//    (PRD `02` §F2.3).
//
// 본 모듈은 BullMQ 의 backoff 공식과 정확히 같은 공식을 표현하는 명시적
// 함수를 제공한다(UT-1 대상). BullMQ 가 내부적으로 같은 계산을 하지만,
// IT-S3 의 단언이 이 함수에 일치하는지 검증할 수 있어야 한다(불변식
// I2.3 결정성).
//
// 본 파일에는 도메인 식별자가 등장해선 안 된다(CLAUDE.md §3, IT-R1, AC2.4).

export interface RetryPolicy {
  /** 최대 시도 횟수(첫 시도 포함). >= 1. */
  readonly maxAttempts: number;
  /** 지수 백오프의 base ms. > 0. */
  readonly backoffBaseMs: number;
}

/**
 * `attempt` 회차 실패 후 다음 시도까지의 지연(ms) 을 계산한다.
 *
 * 공식: `baseMs * 2^(attempt-1)`.
 * - attempt=1 → base
 * - attempt=2 → base*2
 * - attempt=3 → base*4
 * - ...
 *
 * Q-RETRY-3 (a) — jitter 없음. 결정성 우선(IT-S3 단언 정합).
 *
 * 경계값:
 * - attempt < 1 또는 비정수 → RangeError.
 * - baseMs <= 0 → RangeError.
 *
 * @throws RangeError 비정상 입력 시.
 */
export function delayForAttempt(attempt: number, baseMs: number): number {
  if (!Number.isInteger(attempt) || attempt < 1) {
    throw new RangeError(
      `delayForAttempt: attempt must be a positive integer, got ${attempt}`,
    );
  }
  if (!Number.isFinite(baseMs) || baseMs <= 0) {
    throw new RangeError(
      `delayForAttempt: baseMs must be a positive number, got ${baseMs}`,
    );
  }
  // 정수 보존: base 가 정수면 결과도 정수(2 의 거듭제곱 곱).
  return Math.trunc(baseMs * 2 ** (attempt - 1));
}

/**
 * BullMQ Worker / Job 옵션의 표준 표현. 호출 측(예: server.ts) 가
 * 큐/워커 옵션에 머지한다.
 *
 * BullMQ 의 표준 옵션만 사용(F2.3). 자체 백오프 구현 금지.
 */
export interface WorkerRetryOptions {
  readonly attempts: number;
  readonly backoff: {
    readonly type: "exponential";
    readonly delay: number;
  };
}

/**
 * RetryPolicy 를 BullMQ 가 인지하는 옵션 구조로 변환한다.
 */
export function buildWorkerRetryOptions(policy: RetryPolicy): WorkerRetryOptions {
  if (!Number.isInteger(policy.maxAttempts) || policy.maxAttempts < 1) {
    throw new RangeError(
      `buildWorkerRetryOptions: maxAttempts must be a positive integer, got ${policy.maxAttempts}`,
    );
  }
  if (!Number.isFinite(policy.backoffBaseMs) || policy.backoffBaseMs <= 0) {
    throw new RangeError(
      `buildWorkerRetryOptions: backoffBaseMs must be a positive number, got ${policy.backoffBaseMs}`,
    );
  }
  return {
    attempts: policy.maxAttempts,
    backoff: {
      type: "exponential",
      delay: policy.backoffBaseMs,
    },
  };
}
