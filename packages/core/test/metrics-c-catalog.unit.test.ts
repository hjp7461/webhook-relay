import { describe, expect, it } from "vitest";
import { Counter, Gauge, Histogram } from "prom-client";

import * as metricsModule from "../src/metrics.js";

// UT — Core 메트릭 카탈로그(C1~C11) 정의 검증
//
// PLAN `docs/plan-phase3/03-m-obs-2-core-metrics.md` §3.4.
//
// 단언:
//   1) `core/metrics.ts` 가 C1~C11 객체를 export 한다(이름은 모듈 export 키
//      또는 명세된 식별자 — 본 테스트는 모듈 export 의 정확 키를 사용한다).
//   2) 각 메트릭의 prom-client 인스턴스 타입(Counter / Gauge / Histogram) 이
//      PRD `prd-phase3/01` §3.1 표와 일치.
//   3) 라벨 이름(`labelNames`) 이 PRD 표 정확 일치.
//   4) C4 histogram 버킷이 `[0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30]`
//      정확 일치(Q-OBS-9 잠정 잠금).
//
// 본 테스트는 prom-client 의 public API(`instanceof`, `Histogram.bucketValues`,
// `Counter.labelNames` 등)를 사용해 인스턴스 메타데이터를 직접 확인한다.

interface PromMetricLike {
  readonly name: string;
  readonly help: string;
  readonly labelNames: ReadonlyArray<string>;
}

interface HistogramLike extends PromMetricLike {
  readonly buckets: ReadonlyArray<number>;
}

// prom-client 의 내부 필드(`name`, `help`, `labelNames`, `buckets`)는 public API
// 가 아니나, v15 에서 메트릭 인스턴스에 안정적으로 존재한다(prom-client 소스
// 참조). 본 단위 테스트는 인스턴스 메타데이터를 직접 검사한다.
function asMetric(x: unknown): PromMetricLike {
  return x as PromMetricLike;
}
function asHistogram(x: unknown): HistogramLike {
  return x as HistogramLike;
}

describe("UT core C1-C11 catalog — types, labels, buckets", () => {
  it("C1 queue_depth: Gauge with labels [queue, job_state]", () => {
    const m = metricsModule.queueDepth;
    expect(m).toBeInstanceOf(Gauge);
    expect(asMetric(m).name).toBe("webhook_relay_queue_depth");
    expect([...asMetric(m).labelNames].sort()).toEqual(["job_state", "queue"]);
  });

  it("C2 jobs_processed_total: Counter with labels [queue, job_state]", () => {
    const m = metricsModule.jobsProcessedTotal;
    expect(m).toBeInstanceOf(Counter);
    expect(asMetric(m).name).toBe("webhook_relay_jobs_processed_total");
    expect([...asMetric(m).labelNames].sort()).toEqual(["job_state", "queue"]);
  });

  it("C3 job_attempts_total: Counter with labels [queue, outcome]", () => {
    const m = metricsModule.jobAttemptsTotal;
    expect(m).toBeInstanceOf(Counter);
    expect(asMetric(m).name).toBe("webhook_relay_job_attempts_total");
    expect([...asMetric(m).labelNames].sort()).toEqual(["outcome", "queue"]);
  });

  it("C4 worker_processing_duration_seconds: Histogram with labels [queue, outcome] and PRD buckets", () => {
    const m = metricsModule.workerProcessingDurationSeconds;
    expect(m).toBeInstanceOf(Histogram);
    expect(asMetric(m).name).toBe(
      "webhook_relay_worker_processing_duration_seconds",
    );
    expect([...asMetric(m).labelNames].sort()).toEqual(["outcome", "queue"]);
    // Q-OBS-9 (b) — PRD `prd-phase3/01` §3.1 표 잠금.
    expect([...asHistogram(m).buckets]).toEqual([
      0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30,
    ]);
  });

  it("C5 dlq_jobs_total: Counter with label [reason]", () => {
    const m = metricsModule.dlqJobsTotal;
    expect(m).toBeInstanceOf(Counter);
    expect(asMetric(m).name).toBe("webhook_relay_dlq_jobs_total");
    expect([...asMetric(m).labelNames]).toEqual(["reason"]);
  });

  it("C6 worker_active_jobs: Gauge with no labels", () => {
    const m = metricsModule.workerActiveJobs;
    expect(m).toBeInstanceOf(Gauge);
    expect(asMetric(m).name).toBe("webhook_relay_worker_active_jobs");
    expect([...asMetric(m).labelNames]).toEqual([]);
  });

  it("C7 redis_reconnects_total: Counter with no labels", () => {
    const m = metricsModule.redisReconnectsTotal;
    expect(m).toBeInstanceOf(Counter);
    expect(asMetric(m).name).toBe("webhook_relay_redis_reconnects_total");
    expect([...asMetric(m).labelNames]).toEqual([]);
  });

  it("C8 redis_up: Gauge with no labels", () => {
    const m = metricsModule.redisUp;
    expect(m).toBeInstanceOf(Gauge);
    expect(asMetric(m).name).toBe("webhook_relay_redis_up");
    expect([...asMetric(m).labelNames]).toEqual([]);
  });

  it("C9 shutdown_state: Gauge with label [state]", () => {
    const m = metricsModule.shutdownState;
    expect(m).toBeInstanceOf(Gauge);
    expect(asMetric(m).name).toBe("webhook_relay_shutdown_state");
    expect([...asMetric(m).labelNames]).toEqual(["state"]);
  });

  it("C10 shutdown_remaining_jobs: Gauge with no labels", () => {
    const m = metricsModule.shutdownRemainingJobs;
    expect(m).toBeInstanceOf(Gauge);
    expect(asMetric(m).name).toBe("webhook_relay_shutdown_remaining_jobs");
    expect([...asMetric(m).labelNames]).toEqual([]);
  });

  it("C11 build_info: Gauge with labels [version, commit, node_version]", () => {
    const m = metricsModule.buildInfo;
    expect(m).toBeInstanceOf(Gauge);
    expect(asMetric(m).name).toBe("webhook_relay_build_info");
    expect([...asMetric(m).labelNames].sort()).toEqual([
      "commit",
      "node_version",
      "version",
    ]);
  });
});
