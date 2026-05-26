import { describe, expect, it } from "vitest";
import { NonRetriableError, RetriableError } from "@webhook-relay/core";

// UT-2 — 에러 분류 함수
//
// 본 테스트는 구현보다 먼저 작성된다(테스트 우선, CLAUDE.md §7-2).
// 처음 실행 시 모듈 미존재로 실패해야 하며, 이후 demo/src/handlers/classify-error.ts
// 에 `classifyDeliveryFailure` 가 정의되면 그린이 된다.
//
// 케이스 출처: PLAN `05` §3.1 / PRD `03` §5 UT-2.
//
// 결정 잠금:
// - Q-RETRY-1 (a) — 3xx → NonRetriableError(자동 리다이렉트 미수행, SSRF/체인 우려).
// - Q-RETRY-2 (a) — 408/425/429 → 모두 RetriableError(Retry-After 헤더 존중은 본 PRD 범위 밖).
// - 4xx 일반 → NonRetriableError(F2.2).
// - 5xx → RetriableError(F2.2).
// - AbortError(타임아웃) → RetriableError.
// - DNS/ECONNREFUSED → RetriableError.
// - 알 수 없는 cause → RetriableError(보수적; F2.2 와 일치).

import { classifyDeliveryFailure } from "../src/handlers/classify-error.js";

describe("UT-2 classifyDeliveryFailure", () => {
  describe("HTTP status", () => {
    it("classifies 4xx as NonRetriableError (400)", () => {
      const err = classifyDeliveryFailure({ httpStatus: 400 });
      expect(err).toBeInstanceOf(NonRetriableError);
    });

    it("classifies 4xx as NonRetriableError (401)", () => {
      const err = classifyDeliveryFailure({ httpStatus: 401 });
      expect(err).toBeInstanceOf(NonRetriableError);
    });

    it("classifies 4xx as NonRetriableError (404)", () => {
      const err = classifyDeliveryFailure({ httpStatus: 404 });
      expect(err).toBeInstanceOf(NonRetriableError);
    });

    it("classifies 408 as RetriableError (Q-RETRY-2)", () => {
      const err = classifyDeliveryFailure({ httpStatus: 408 });
      expect(err).toBeInstanceOf(RetriableError);
    });

    it("classifies 425 as RetriableError (Q-RETRY-2)", () => {
      const err = classifyDeliveryFailure({ httpStatus: 425 });
      expect(err).toBeInstanceOf(RetriableError);
    });

    it("classifies 429 as RetriableError (Q-RETRY-2)", () => {
      const err = classifyDeliveryFailure({ httpStatus: 429 });
      expect(err).toBeInstanceOf(RetriableError);
    });

    it("classifies 5xx as RetriableError (500)", () => {
      const err = classifyDeliveryFailure({ httpStatus: 500 });
      expect(err).toBeInstanceOf(RetriableError);
    });

    it("classifies 5xx as RetriableError (502)", () => {
      const err = classifyDeliveryFailure({ httpStatus: 502 });
      expect(err).toBeInstanceOf(RetriableError);
    });

    it("classifies 5xx as RetriableError (503)", () => {
      const err = classifyDeliveryFailure({ httpStatus: 503 });
      expect(err).toBeInstanceOf(RetriableError);
    });

    it("classifies 3xx as NonRetriableError (Q-RETRY-1, 301)", () => {
      const err = classifyDeliveryFailure({ httpStatus: 301 });
      expect(err).toBeInstanceOf(NonRetriableError);
    });

    it("classifies 3xx as NonRetriableError (Q-RETRY-1, 302)", () => {
      const err = classifyDeliveryFailure({ httpStatus: 302 });
      expect(err).toBeInstanceOf(NonRetriableError);
    });
  });

  describe("network cause", () => {
    it("classifies AbortError (timeout) as RetriableError", () => {
      const abortErr = new Error("aborted");
      abortErr.name = "AbortError";
      const err = classifyDeliveryFailure({ cause: abortErr });
      expect(err).toBeInstanceOf(RetriableError);
    });

    it("classifies ECONNREFUSED as RetriableError", () => {
      const netErr = new Error("connect ECONNREFUSED 127.0.0.1:9") as Error & {
        code?: string;
      };
      netErr.code = "ECONNREFUSED";
      const err = classifyDeliveryFailure({ cause: netErr });
      expect(err).toBeInstanceOf(RetriableError);
    });

    it("classifies ENOTFOUND (DNS) as RetriableError", () => {
      const dnsErr = new Error("getaddrinfo ENOTFOUND nope.invalid") as Error & {
        code?: string;
      };
      dnsErr.code = "ENOTFOUND";
      const err = classifyDeliveryFailure({ cause: dnsErr });
      expect(err).toBeInstanceOf(RetriableError);
    });

    it("classifies EAI_AGAIN (DNS temporary failure) as RetriableError", () => {
      const dnsErr = new Error("getaddrinfo EAI_AGAIN") as Error & { code?: string };
      dnsErr.code = "EAI_AGAIN";
      const err = classifyDeliveryFailure({ cause: dnsErr });
      expect(err).toBeInstanceOf(RetriableError);
    });

    it("classifies ETIMEDOUT as RetriableError", () => {
      const netErr = new Error("ETIMEDOUT") as Error & { code?: string };
      netErr.code = "ETIMEDOUT";
      const err = classifyDeliveryFailure({ cause: netErr });
      expect(err).toBeInstanceOf(RetriableError);
    });

    it("classifies an unknown cause as RetriableError (conservative)", () => {
      const err = classifyDeliveryFailure({ cause: new Error("something unexpected") });
      expect(err).toBeInstanceOf(RetriableError);
    });
  });
});
