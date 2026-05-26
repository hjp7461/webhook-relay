import { describe, expect, it } from "vitest";

// UT-1 — 백오프 지연 계산 함수
//
// 본 테스트는 구현보다 먼저 작성된다(테스트 우선, CLAUDE.md §7-2).
// 처음 실행 시 모듈 미존재로 실패해야 하며, 이후 core/src/retry.ts 의
// `delayForAttempt` 가 정의되면 그린이 된다.
//
// 케이스 출처: PLAN `05` §3.1 / PRD `03` §5 UT-1.
//
// 결정 잠금:
// - Q-RETRY-3 (a) — jitter 없음. 공식 `baseMs * 2^(attempt-1)` 결정성.
// - attempt < 1 은 거부(throw).

import { delayForAttempt } from "../src/retry.js";

describe("UT-1 delayForAttempt", () => {
  it("returns base when attempt = 1", () => {
    expect(delayForAttempt(1, 1000)).toBe(1000);
    expect(delayForAttempt(1, 200)).toBe(200);
  });

  it("returns base * 2 when attempt = 2", () => {
    expect(delayForAttempt(2, 1000)).toBe(2000);
    expect(delayForAttempt(2, 200)).toBe(400);
  });

  it("returns base * 4 when attempt = 3", () => {
    expect(delayForAttempt(3, 1000)).toBe(4000);
    expect(delayForAttempt(3, 200)).toBe(800);
  });

  it("returns base * 8 when attempt = 4", () => {
    expect(delayForAttempt(4, 1000)).toBe(8000);
    expect(delayForAttempt(4, 200)).toBe(1600);
  });

  it("returns base * 16 when attempt = 5", () => {
    expect(delayForAttempt(5, 200)).toBe(3200);
  });

  it("returns integer value (no fractional)", () => {
    const v = delayForAttempt(3, 200);
    expect(Number.isInteger(v)).toBe(true);
  });

  it("rejects attempt = 0", () => {
    expect(() => delayForAttempt(0, 1000)).toThrow();
  });

  it("rejects negative attempt", () => {
    expect(() => delayForAttempt(-1, 1000)).toThrow();
  });

  it("rejects non-integer attempt", () => {
    expect(() => delayForAttempt(1.5, 1000)).toThrow();
  });

  it("rejects non-positive baseMs", () => {
    expect(() => delayForAttempt(1, 0)).toThrow();
    expect(() => delayForAttempt(1, -1)).toThrow();
  });
});
