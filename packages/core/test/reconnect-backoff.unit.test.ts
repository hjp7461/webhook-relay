import { describe, expect, it } from "vitest";

// UT — Redis 재연결 백오프 공식(`computeReconnectDelay`).
//
// 본 테스트는 PRD `06` §5 / CLAUDE.md §8 / 불변식 I6.4("Redis 재연결 간격은
// 백오프를 따른다. 즉시 재시도 폭주가 없다")를 코드 레벨에서 단언한다.
//
// 공식(`packages/core/src/queue.ts::computeReconnectDelay`):
//   delay = min(cap, base * 2^(times-1))
//   단, base = max(1, reconnectBaseMs), cap = max(base, reconnectMaxMs).
//
// `times` 는 ioredis 가 1 부터 증가시켜 호출. 본 함수는 음의 지수가 발생하지 않도록
// `Math.max(0, times-1)` 로 clamp 한다.

import { computeReconnectDelay } from "../src/queue.js";

describe("computeReconnectDelay (Redis reconnect backoff)", () => {
  it("returns base when times = 1", () => {
    expect(computeReconnectDelay(1, 200, 10_000)).toBe(200);
    expect(computeReconnectDelay(1, 500, 10_000)).toBe(500);
  });

  it("doubles each subsequent attempt (exponential)", () => {
    expect(computeReconnectDelay(2, 200, 10_000)).toBe(400);
    expect(computeReconnectDelay(3, 200, 10_000)).toBe(800);
    expect(computeReconnectDelay(4, 200, 10_000)).toBe(1600);
    expect(computeReconnectDelay(5, 200, 10_000)).toBe(3200);
    expect(computeReconnectDelay(6, 200, 10_000)).toBe(6400);
  });

  it("caps at reconnectMaxMs (no unbounded growth)", () => {
    // base=200, max=10000. 2^6*200 = 12800 > 10000 → cap.
    expect(computeReconnectDelay(7, 200, 10_000)).toBe(10_000);
    expect(computeReconnectDelay(20, 200, 10_000)).toBe(10_000);
    expect(computeReconnectDelay(100, 200, 10_000)).toBe(10_000);
  });

  it("never returns < base for valid times >= 1", () => {
    for (let t = 1; t <= 30; t++) {
      expect(computeReconnectDelay(t, 200, 10_000)).toBeGreaterThanOrEqual(200);
    }
  });

  it("clamps base to >= 1 when caller passes 0 or negative (no immediate-retry storm)", () => {
    // base = max(1, 0) = 1 → delay grows from 1. CLAUDE.md §8 "무한 재연결 폭주
    // 방지" 와 일치 — 즉시(0ms) 재시도가 되지 않는다.
    expect(computeReconnectDelay(1, 0, 10_000)).toBe(1);
    expect(computeReconnectDelay(1, -100, 10_000)).toBe(1);
  });

  it("clamps cap to >= base when caller passes max < base (no cap-below-base)", () => {
    // max < base 인 잘못된 설정에서도 base 가 cap 으로 승격되어 최소 base 만큼 대기.
    expect(computeReconnectDelay(1, 500, 100)).toBe(500);
    expect(computeReconnectDelay(5, 500, 100)).toBe(500);
  });

  it("handles times = 0 defensively (clamp to base, no negative exponent)", () => {
    // ioredis 는 times>=1 을 보장하지만, 본 함수는 times<1 에서도 base 를 반환.
    expect(computeReconnectDelay(0, 200, 10_000)).toBe(200);
  });
});
