import { describe, expect, it } from "vitest";

// UT-3 — 작업 등록 요청 Zod 스키마
//
// 본 테스트는 구현보다 먼저 작성된다(테스트 우선, CLAUDE.md §7-2).
//
// 케이스 출처: PRD `05-api-and-contracts.md` §4.2 와 PLAN `04` §3.1.
// - url 누락 → 거부
// - 잘못된 URL → 거부
// - payload 가 객체가 아님 → 거부
// - 페이로드 크기 한도 초과 → 거부 (직렬화 바이트 기준)
// - 정상 입력(idempotencyKey 포함) → 통과
// - idempotencyKey 는 M3 에서 필수로 격상(PRD `02` §F2.1, AC2.2).

import {
  WEBHOOK_DEFAULT_MAX_PAYLOAD_BYTES,
  WebhookCreateRequestSchema,
} from "../src/domain/schemas.js";

describe("UT-3 WebhookCreateRequestSchema", () => {
  const valid = {
    url: "https://example.com/hook",
    payload: { event: "user.created", id: 1 },
    idempotencyKey: "abc12345",
  };

  it("accepts a well-formed request with idempotencyKey", () => {
    const parsed = WebhookCreateRequestSchema.parse(valid);
    expect(parsed.url).toBe(valid.url);
    expect(parsed.payload).toEqual(valid.payload);
    expect(parsed.idempotencyKey).toBe(valid.idempotencyKey);
  });

  it("rejects when idempotencyKey is missing (M3 promotion)", () => {
    const { idempotencyKey: _omit, ...rest } = valid;
    const result = WebhookCreateRequestSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects when url is missing", () => {
    const result = WebhookCreateRequestSchema.safeParse({
      payload: { a: 1 },
      idempotencyKey: "abc12345",
    });
    expect(result.success).toBe(false);
  });

  it("rejects when url is not a valid URL", () => {
    const result = WebhookCreateRequestSchema.safeParse({
      ...valid,
      url: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("rejects when payload is not an object", () => {
    const result = WebhookCreateRequestSchema.safeParse({
      ...valid,
      payload: "not-an-object",
    });
    expect(result.success).toBe(false);
  });

  it("rejects when payload exceeds WEBHOOK_DEFAULT_MAX_PAYLOAD_BYTES", () => {
    // 기본 64 KiB 를 초과하는 페이로드(문자열로 70 KiB 정도).
    const big = "x".repeat(WEBHOOK_DEFAULT_MAX_PAYLOAD_BYTES + 1);
    const result = WebhookCreateRequestSchema.safeParse({
      ...valid,
      payload: { blob: big },
    });
    expect(result.success).toBe(false);
  });

  it("rejects when headers is not a string-string map", () => {
    const result = WebhookCreateRequestSchema.safeParse({
      ...valid,
      headers: { "x-bad": 123 },
    });
    expect(result.success).toBe(false);
  });
});
