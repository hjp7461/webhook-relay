import { describe, expect, it } from "vitest";

// UT-3 — 작업 등록 요청 Zod 스키마
//
// 본 테스트는 구현보다 먼저 작성된다(테스트 우선, CLAUDE.md §7-2). 처음
// 실행 시 모듈 미존재로 실패해야 하며, 이후 demo/src/domain/schemas.ts 에
// `WebhookCreateRequestSchema` 가 정의되면 그린이 된다.
//
// 케이스 출처: PRD `05-api-and-contracts.md` §4.2 와 PLAN `03` §3.1.
// - url 누락 → 거부
// - 잘못된 URL → 거부
// - payload 가 객체가 아님 → 거부
// - 페이로드 크기 한도 초과 → 거부 (직렬화 바이트 기준)
// - 정상 입력 → 통과
// - idempotencyKey 는 M2 단계에서 선택(M3 에서 필수로 격상).

import {
  WEBHOOK_DEFAULT_MAX_PAYLOAD_BYTES,
  WebhookCreateRequestSchema,
} from "../src/domain/schemas.js";

describe("UT-3 WebhookCreateRequestSchema", () => {
  const valid = {
    url: "https://example.com/hook",
    payload: { event: "user.created", id: 1 },
  };

  it("accepts a well-formed request without idempotencyKey (M2 stage)", () => {
    const parsed = WebhookCreateRequestSchema.parse(valid);
    expect(parsed.url).toBe(valid.url);
    expect(parsed.payload).toEqual(valid.payload);
  });

  it("accepts optional idempotencyKey when provided", () => {
    const parsed = WebhookCreateRequestSchema.parse({
      ...valid,
      idempotencyKey: "abc12345",
    });
    expect(parsed.idempotencyKey).toBe("abc12345");
  });

  it("rejects when url is missing", () => {
    const result = WebhookCreateRequestSchema.safeParse({ payload: { a: 1 } });
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
