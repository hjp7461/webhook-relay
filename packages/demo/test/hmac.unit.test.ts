import { describe, expect, it } from "vitest";

// UT-6 — HMAC 서명 생성 함수
//
// 본 테스트는 구현보다 먼저 작성된다(테스트 우선, CLAUDE.md §7-2).
// 처음 실행 시 모듈 미존재로 실패해야 하며, 이후 demo/src/domain/hmac.ts
// 에 `signHmacSha256` 가 정의되면 그린이 된다.
//
// 케이스 출처: PLAN `05` §3.1 / PRD `03` §5 UT-6, PRD `06` §2.
//
// 결정 잠금:
// - Q-SEC-2 (a) — timestamp/nonce 미적용. 결정성 보존(같은 입력 → 같은 서명).
// - Q-SEC-3 (a) — 시크릿 32 bytes 최소(M2 config 에서 이미 강제. 본 모듈에서도 방어적으로 거부).

import { signHmacSha256 } from "../src/domain/hmac.js";

const VALID_SECRET = "s".repeat(32);

describe("UT-6 signHmacSha256", () => {
  it("returns the same signature for the same input (determinism)", () => {
    const body = JSON.stringify({ event: "user.created", id: 1 });
    const a = signHmacSha256(VALID_SECRET, body);
    const b = signHmacSha256(VALID_SECRET, body);
    expect(a).toBe(b);
  });

  it("returns a string of the form 'sha256=<hex>'", () => {
    const sig = signHmacSha256(VALID_SECRET, "hello");
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it("produces different signatures for different bodies", () => {
    const a = signHmacSha256(VALID_SECRET, "payload-a");
    const b = signHmacSha256(VALID_SECRET, "payload-b");
    expect(a).not.toBe(b);
  });

  it("produces different signatures for different secrets", () => {
    const body = "same-body";
    const a = signHmacSha256(VALID_SECRET, body);
    const b = signHmacSha256("x".repeat(32), body);
    expect(a).not.toBe(b);
  });

  it("accepts Buffer body and produces identical output to string body", () => {
    const body = "hello world";
    const a = signHmacSha256(VALID_SECRET, body);
    const b = signHmacSha256(VALID_SECRET, Buffer.from(body, "utf8"));
    expect(a).toBe(b);
  });

  it("throws when secret is empty", () => {
    expect(() => signHmacSha256("", "payload")).toThrow();
  });

  it("throws when secret is too short (< 32 bytes)", () => {
    expect(() => signHmacSha256("short-secret", "payload")).toThrow();
  });
});
