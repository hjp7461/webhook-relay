import { describe, expect, it } from "vitest";
import { Registry } from "prom-client";
import { enableDefaultMetrics, getMetricsRegistry } from "../src/metrics.js";

// UT — core/metrics.ts
//
// PLAN `docs/plan-phase3/02-m-obs-1-bootstrap.md` §3 시퀀스 2번.
// 본 파일은 Redis 의존성이 없는 순수 단위 테스트(`*.unit.test.ts`).
//
// 단언 4건:
//   1) getMetricsRegistry() 가 prom-client Registry 인스턴스를 반환.
//   2) 동일 호출이 동일 인스턴스(단일성, PRD `prd-phase3/02` §4.1).
//   3) enableDefaultMetrics() 호출 후 registry.metrics() 에
//      `nodejs_` 또는 `process_` 접두 메트릭이 1건 이상 등장.
//   4) enableDefaultMetrics() 의 멱등성 — 2회 호출해도 메트릭 중복 등록
//      에러 없음.
//
// 본 시점에서는 C1~C11 메트릭은 정의되지 않는다(M-OBS-2 책임).

describe("core/metrics — registry + default metrics", () => {
  it("getMetricsRegistry() returns a prom-client Registry instance", () => {
    const reg = getMetricsRegistry();
    expect(reg).toBeInstanceOf(Registry);
    // 명세 메서드가 존재함을 보강 단언.
    expect(typeof reg.metrics).toBe("function");
    expect(typeof reg.contentType).toBe("string");
  });

  it("returns the same singleton on repeated calls", () => {
    const a = getMetricsRegistry();
    const b = getMetricsRegistry();
    expect(a).toBe(b);
  });

  it("enableDefaultMetrics() exposes nodejs_/process_ metrics on the registry", async () => {
    enableDefaultMetrics();
    const reg = getMetricsRegistry();
    const text = await reg.metrics();
    // prom-client 의 collectDefaultMetrics 는 `process_*` 와 `nodejs_*`
    // 시리즈를 default registry 에 등록한다. 둘 중 하나라도 등장하면 통과.
    const hasDefault = /^(nodejs|process)_/m.test(text);
    expect(hasDefault).toBe(true);
  });

  it("enableDefaultMetrics() is idempotent (no duplicate registration error)", async () => {
    // 1회 호출은 이전 테스트에서 이미 수행됨. 추가 호출이 throw 하지 않아야 한다.
    expect(() => enableDefaultMetrics()).not.toThrow();
    expect(() => enableDefaultMetrics()).not.toThrow();
    // 호출 후에도 metrics() 호출이 정상.
    const text = await getMetricsRegistry().metrics();
    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(0);
  });
});
