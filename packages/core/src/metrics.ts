import {
  Registry,
  collectDefaultMetrics as promCollectDefaultMetrics,
  register as defaultRegister,
} from "prom-client";

// core/metrics.ts
//
// Phase 3 PRD `prd-phase3/02` §4.1 — single default registry.
// 본 모듈은 prom-client 의 default registry 핸들과 기본 메트릭 수집 토글만
// 노출한다. 도메인 식별자/wiring 은 일체 두지 않는다(CLAUDE.md §3, IT-R1).

/**
 * Returns the single default prom-client Registry used by the app.
 */
export function getMetricsRegistry(): Registry {
  return defaultRegister;
}

let defaultMetricsEnabled = false;

/**
 * Enables collection of default Node.js / process metrics on the single
 * default registry. Idempotent — multiple calls are no-ops after the first.
 */
export function enableDefaultMetrics(): void {
  if (defaultMetricsEnabled) return;
  promCollectDefaultMetrics({ register: defaultRegister });
  defaultMetricsEnabled = true;
}

// Phase 3 PRD `prd-phase3/01` §3.1 — metric definitions land in M-OBS-2.
// Keep this file domain-agnostic (CLAUDE.md §3, IT-R1).
