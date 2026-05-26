// core/errors.ts
//
// 재시도 가능/불가능 에러를 구분하는 추상 에러 클래스.
// 분류 함수(어떤 응답을 retriable 로 볼지)는 M4 에서 demo 측에 작성한다
// (PRD `04` §7, PLAN `03` §4 단계2 항목8).

export class RetriableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "RetriableError";
  }
}

export class NonRetriableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "NonRetriableError";
  }
}
