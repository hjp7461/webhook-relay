import { describe, expect, it } from "vitest";

// UT-5 — 멱등성 키 정합성 검증 함수
//
// 본 테스트는 구현보다 먼저 작성된다(테스트 우선, CLAUDE.md §7-2).
// 처음 실행 시 모듈 미존재로 실패해야 하며, 이후 demo/src/domain/idempotency-key.ts
// 에 `assertIdempotencyKey` 가 정의되면 그린이 된다.
//
// 케이스 출처: PLAN `04` §3.1.
// - 길이 8~128자 외 → 거부 (8자 미만, 128자 초과, 빈 문자열)
// - 허용 문자(`[A-Za-z0-9_\-]`) 외 → 거부
// - 정상 입력 → 통과

import { assertIdempotencyKey } from "../src/domain/idempotency-key.js";

describe("UT-5 assertIdempotencyKey", () => {
  it("accepts a well-formed key (8 chars, alphanum)", () => {
    expect(assertIdempotencyKey("abc12345")).toBe("abc12345");
  });

  it("accepts a maximum-length key (128 chars)", () => {
    const key = "a".repeat(128);
    expect(assertIdempotencyKey(key)).toBe(key);
  });

  it("accepts allowed special characters: underscore and hyphen", () => {
    const key = "user_42-order-abcd";
    expect(assertIdempotencyKey(key)).toBe(key);
  });

  it("rejects an empty string", () => {
    expect(() => assertIdempotencyKey("")).toThrow();
  });

  it("rejects a key shorter than 8 characters", () => {
    expect(() => assertIdempotencyKey("abc123")).toThrow();
  });

  it("rejects a key longer than 128 characters", () => {
    expect(() => assertIdempotencyKey("a".repeat(129))).toThrow();
  });

  it("rejects a key with disallowed characters (whitespace)", () => {
    expect(() => assertIdempotencyKey("abc 12345")).toThrow();
  });

  it("rejects a key with disallowed characters (slash)", () => {
    expect(() => assertIdempotencyKey("abc/12345")).toThrow();
  });

  it("rejects a key with disallowed characters (unicode)", () => {
    expect(() => assertIdempotencyKey("abc12345한국")).toThrow();
  });

  it("rejects a non-string input (number)", () => {
    expect(() => assertIdempotencyKey(12345678)).toThrow();
  });

  it("rejects a non-string input (undefined)", () => {
    expect(() => assertIdempotencyKey(undefined)).toThrow();
  });

  it("rejects a non-string input (null)", () => {
    expect(() => assertIdempotencyKey(null)).toThrow();
  });
});
