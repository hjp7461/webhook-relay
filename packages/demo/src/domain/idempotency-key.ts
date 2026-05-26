// demo/domain/idempotency-key.ts
//
// 멱등성 키 정합성 검증의 순수 함수(PLAN `04` §3.1, PRD `02` §F2.1).
//
// 규칙:
// - 입력은 문자열이어야 한다.
// - 길이 8~128 자.
// - 허용 문자 클래스 `[A-Za-z0-9_\-]` 만.
//
// 본 함수는 schemas.ts 의 `WebhookCreateRequestSchema` 에서도 동일 규칙을
// 적용하기 위해 호출된다(단일 출처). Zod 의 `refine` 보다 순수 함수가
// 단위 테스트(UT-5) 와 1:1 매핑이 용이하다.

export const IDEMPOTENCY_KEY_MIN = 8;
export const IDEMPOTENCY_KEY_MAX = 128;
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_\-]+$/;

/**
 * idempotencyKey 의 형식을 검증하고 유효한 키를 반환한다.
 *
 * 유효하지 않으면 `TypeError` 를 던진다(에러는 호출 측이 도메인 에러로
 * 감싸거나 그대로 전파한다 — schemas.ts 에서는 Zod `refine` 의 부울 반환을
 * 위해 별도 `isValidIdempotencyKey` 를 함께 노출).
 */
export function assertIdempotencyKey(input: unknown): string {
  if (typeof input !== "string") {
    throw new TypeError("idempotencyKey must be a string");
  }
  if (input.length < IDEMPOTENCY_KEY_MIN || input.length > IDEMPOTENCY_KEY_MAX) {
    throw new TypeError(
      `idempotencyKey length must be between ${IDEMPOTENCY_KEY_MIN} and ${IDEMPOTENCY_KEY_MAX}`,
    );
  }
  if (!IDEMPOTENCY_KEY_PATTERN.test(input)) {
    throw new TypeError(
      "idempotencyKey must match [A-Za-z0-9_-] only",
    );
  }
  return input;
}

/**
 * idempotencyKey 가 유효한지 검사한다(부울 반환). Zod `refine` 호환용.
 */
export function isValidIdempotencyKey(input: unknown): input is string {
  try {
    assertIdempotencyKey(input);
    return true;
  } catch {
    return false;
  }
}
