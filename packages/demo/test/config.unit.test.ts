import { afterEach, beforeEach, describe, expect, it } from "vitest";

// UT-4 — 환경변수 Zod 스키마
//
// PLAN `03` §3.1, PRD `05` §8. 본 테스트도 구현보다 먼저 작성한다.
//
// 결정 잠금:
// - Q-API-1 (b) — API_BEARER_TOKEN 필수, 최소 32 bytes.
// - Q-SEC-3 (a) — 모든 시크릿 최소 32 bytes 동일 적용.
// - Q-SEC-1 (b) — ALLOW_PRIVATE_TARGETS env 토글, 기본 true.
//
// `parseConfig(env: Record<string, string | undefined>)` 시그니처를 가정하고
// 본 단위 테스트는 process.env 에 의존하지 않는다(결정성).

import { parseConfig } from "../src/config.js";

// 본 테스트에서 반복 사용하는 "유효한 최소 환경변수" 베이스.
// 32 바이트 시크릿(영문자 32 글자 = 32 bytes UTF-8).
const SECRET_32 = "a".repeat(32);
const BASE_ENV: Record<string, string> = {
  API_BEARER_TOKEN: SECRET_32,
  WEBHOOK_HMAC_SECRET: SECRET_32,
};

describe("UT-4 parseConfig", () => {
  it("applies sensible defaults when only required secrets are provided", () => {
    const cfg = parseConfig(BASE_ENV);
    expect(cfg.REDIS_URL).toBe("redis://localhost:6379");
    expect(cfg.PORT).toBe(3000);
    expect(cfg.LOG_LEVEL).toBe("info");
    expect(cfg.WEBHOOK_MAX_PAYLOAD_BYTES).toBe(65536);
    expect(cfg.WEBHOOK_DELIVERY_TIMEOUT_MS).toBeGreaterThan(0);
    expect(cfg.ALLOW_PRIVATE_TARGETS).toBe(true);
    expect(cfg.WORKER_CONCURRENCY).toBeGreaterThan(0);
  });

  it("coerces numeric strings to numbers", () => {
    const cfg = parseConfig({ ...BASE_ENV, PORT: "4000" });
    expect(cfg.PORT).toBe(4000);
  });

  it("rejects non-numeric PORT (e.g., 'abc')", () => {
    expect(() => parseConfig({ ...BASE_ENV, PORT: "abc" })).toThrow();
  });

  it("accepts PORT=0 (OS-assigned port binding)", () => {
    // M7 자식 프로세스 우회 청산 — fixture/spawn-server 가 자식에 PORT=0 을 그대로
    // 전달할 수 있어야 한다(이전엔 positive 만 허용해 pickFreePort 가 필요했음).
    const cfg = parseConfig({ ...BASE_ENV, PORT: "0" });
    expect(cfg.PORT).toBe(0);
  });

  it("rejects when API_BEARER_TOKEN is missing", () => {
    const { API_BEARER_TOKEN: _omit, ...rest } = BASE_ENV;
    expect(() => parseConfig(rest)).toThrow();
  });

  it("rejects when API_BEARER_TOKEN is shorter than 32 bytes", () => {
    expect(() =>
      parseConfig({ ...BASE_ENV, API_BEARER_TOKEN: "short" }),
    ).toThrow();
  });

  it("rejects when WEBHOOK_HMAC_SECRET is missing", () => {
    const { WEBHOOK_HMAC_SECRET: _omit, ...rest } = BASE_ENV;
    expect(() => parseConfig(rest)).toThrow();
  });

  it("rejects when WEBHOOK_HMAC_SECRET is shorter than 32 bytes", () => {
    expect(() =>
      parseConfig({ ...BASE_ENV, WEBHOOK_HMAC_SECRET: "x".repeat(31) }),
    ).toThrow();
  });

  it("does not leak secret values in thrown error message", () => {
    const TOKEN = "y".repeat(20);
    try {
      parseConfig({ ...BASE_ENV, API_BEARER_TOKEN: TOKEN });
      throw new Error("should have thrown");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).not.toContain(TOKEN);
    }
  });

  it("parses ALLOW_PRIVATE_TARGETS as boolean (false)", () => {
    const cfg = parseConfig({
      ...BASE_ENV,
      ALLOW_PRIVATE_TARGETS: "false",
    });
    expect(cfg.ALLOW_PRIVATE_TARGETS).toBe(false);
  });

  it("parses ALLOW_PRIVATE_TARGETS as boolean (true)", () => {
    const cfg = parseConfig({
      ...BASE_ENV,
      ALLOW_PRIVATE_TARGETS: "true",
    });
    expect(cfg.ALLOW_PRIVATE_TARGETS).toBe(true);
  });
});

// process.env 와의 격리: 본 파일은 process.env 를 변경하지 않는다.
// (parseConfig 는 명시적 인자 기반이므로 부수 효과 없음.)
beforeEach(() => {
  // no-op — 명시적 인자 기반 테스트.
});

afterEach(() => {
  // no-op
});
