import { NonRetriableError, RetriableError } from "@webhook-relay/core";

// demo/handlers/classify-error.ts
//
// 외부 송신 실패를 core 의 분류 에러로 매핑하는 도메인 함수
// (PRD `02` §F2.2, AC2.5, 불변식 I2.3 분류 결정성).
//
// 결정 잠금:
// - Q-RETRY-1 (a) — 3xx → NonRetriableError(자동 리다이렉트 미수행, SSRF/체인).
// - Q-RETRY-2 (a) — 408/425/429 → 모두 RetriableError(Retry-After 헤더 존중은 본 PRD 범위 밖).
// - 4xx 일반 → NonRetriableError.
// - 5xx → RetriableError.
// - AbortError(타임아웃) → RetriableError.
// - ECONNREFUSED / ENOTFOUND / EAI_AGAIN / ETIMEDOUT 등 → RetriableError.
// - 알 수 없는 cause → RetriableError(보수적; F2.2 정책).

export interface ClassifyDeliveryFailureInput {
  readonly httpStatus?: number;
  readonly cause?: unknown;
}

const RETRIABLE_4XX = new Set<number>([408, 425, 429]);

/**
 * 외부 송신 실패의 입력(응답 상태 또는 원인 에러)을 분류해 core 의 두
 * 에러 클래스 중 하나를 반환한다. 본 함수는 throw 하지 않고 에러 인스턴스를
 * 반환하므로(테스트에서 instanceof 단언 용이), 호출 측이 throw 한다.
 *
 * 우선순위:
 * 1. httpStatus 가 있으면 상태 기반 분류.
 * 2. 아니면 cause 기반 분류.
 * 3. 둘 다 없으면 RetriableError(보수적).
 */
export function classifyDeliveryFailure(
  input: ClassifyDeliveryFailureInput,
): RetriableError | NonRetriableError {
  const { httpStatus, cause } = input;

  if (typeof httpStatus === "number") {
    return classifyByHttpStatus(httpStatus);
  }
  return classifyByCause(cause);
}

function classifyByHttpStatus(status: number): RetriableError | NonRetriableError {
  // 5xx → 일시적 장애로 간주.
  if (status >= 500 && status <= 599) {
    return new RetriableError(`Upstream returned ${status}`, { httpStatus: status });
  }
  // 408/425/429 — Q-RETRY-2 (a).
  if (RETRIABLE_4XX.has(status)) {
    return new RetriableError(`Upstream returned ${status}`, { httpStatus: status });
  }
  // 그 외 4xx → NonRetriable.
  if (status >= 400 && status <= 499) {
    return new NonRetriableError(`Upstream returned ${status}`, { httpStatus: status });
  }
  // 3xx — Q-RETRY-1 (a). 자동 리다이렉트 미수행.
  if (status >= 300 && status <= 399) {
    return new NonRetriableError(`Upstream redirected (${status}); follow disabled`, {
      httpStatus: status,
    });
  }
  // 1xx/2xx 가 분류에 들어오는 일은 없어야 하지만 방어적으로 Retriable 로.
  return new RetriableError(`Unexpected upstream status ${status}`, {
    httpStatus: status,
  });
}

function classifyByCause(cause: unknown): RetriableError | NonRetriableError {
  // 본 PRD 범위에서는 cause 기반 NonRetriable 케이스 없음 → 모두 Retriable.
  // 명시적 retriable 사유(타임아웃/DNS/Connection 등)를 식별 가능하면
  // 메시지에 노출, 그렇지 않으면 unknown 으로 보수적 retriable.
  if (cause instanceof Error) {
    if (cause.name === "AbortError") {
      return new RetriableError("Delivery aborted (timeout)", { cause });
    }
    const code = (cause as Error & { code?: string }).code;
    if (typeof code === "string") {
      // 네트워크 일시 장애 군 — 모두 retriable.
      // 명시 케이스: ECONNREFUSED, ENOTFOUND, EAI_AGAIN, ETIMEDOUT, ECONNRESET,
      //              EHOSTUNREACH, ENETUNREACH, EPIPE.
      return new RetriableError(`Network error: ${code}`, { cause });
    }
    return new RetriableError(`Delivery failed: ${cause.message}`, { cause });
  }
  return new RetriableError("Delivery failed (unknown cause)", {
    cause: cause ?? new Error("unknown"),
  });
}
