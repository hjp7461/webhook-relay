// core/errors.ts
//
// 재시도 가능/불가능 에러를 구분하는 추상 에러 클래스.
// 분류 함수(어떤 응답을 retriable 로 볼지)는 demo 측에 작성된다
// (PRD `04` §7, PRD `02` §F2.2).
//
// 본 모듈은 도메인 식별자를 포함하지 않는다(CLAUDE.md §3, IT-R1).
//
// M4 메타 컨텍스트 옵션:
// - httpStatus / cause 를 클래스 인스턴스에 보존해 워커/로깅 측이
//   추가 컨텍스트(구조화 로그의 errorClass/httpStatus — PRD `05` §9 2단계)
//   를 노출할 수 있게 한다. 도메인 식별자는 받지 않는다.

export interface ClassifiedErrorContext {
  /** 외부 응답 HTTP 상태(있을 때). */
  readonly httpStatus?: number;
  /** 원인 에러(타임아웃/네트워크 등). */
  readonly cause?: unknown;
}

export class RetriableError extends Error {
  readonly httpStatus?: number;
  constructor(message: string, options?: ErrorOptions & ClassifiedErrorContext) {
    // ErrorOptions.cause 는 표준. ClassifiedErrorContext.cause 와 중복되지만
    // 호출 측이 두 채널 중 어느 쪽을 써도 동작하도록 머지.
    const cause = options?.cause;
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = "RetriableError";
    if (options?.httpStatus !== undefined) {
      this.httpStatus = options.httpStatus;
    }
  }
}

export class NonRetriableError extends Error {
  readonly httpStatus?: number;
  constructor(message: string, options?: ErrorOptions & ClassifiedErrorContext) {
    const cause = options?.cause;
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = "NonRetriableError";
    if (options?.httpStatus !== undefined) {
      this.httpStatus = options.httpStatus;
    }
  }
}
