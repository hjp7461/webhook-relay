import { describe, expect, it } from "vitest";
import { Counter, Histogram } from "prom-client";

import * as demoMetrics from "../src/metrics.js";
import {
  DELIVERY_RESULTS,
  ERROR_CLASSES,
  HTTP_STATUS_CLASSES,
  REQUEST_BODY_BYTES_BUCKETS,
  REQUEST_DURATION_SECONDS_BUCKETS,
  ROUTE_ENUM,
  STATUS_CLASSES,
  W3_DELIVERY_ATTEMPTS_BUCKETS,
  W3_OUTCOMES,
} from "../src/constants.js";

// UT — Demo 메트릭 카탈로그(D1~D3, W1~W4) 정의 검증
//
// PLAN `docs/plan-phase3/04-m-obs-3-demo-metrics.md` §3 UT.
//
// 단언:
//   1) D1~D3, W1~W4 메트릭 객체가 demo/src/metrics.ts 에서 export 된다.
//   2) prom-client 인스턴스 타입(Counter / Histogram) 이 PRD §3.2/§3.3 일치.
//   3) 라벨 이름 집합이 PRD 표 정확 일치.
//   4) 히스토그램 버킷이 PRD 표 정확 일치(Q-OBS-9).
//   5) 라벨 enum 이 demo/constants.ts 단일 출처와 정합.

interface PromMetricLike {
  readonly name: string;
  readonly help: string;
  readonly labelNames: ReadonlyArray<string>;
}

interface HistogramLike extends PromMetricLike {
  readonly buckets: ReadonlyArray<number>;
}

function asMetric(x: unknown): PromMetricLike {
  return x as PromMetricLike;
}
function asHistogram(x: unknown): HistogramLike {
  return x as HistogramLike;
}

describe("UT demo D1-D3 + W1-W4 catalog — types, labels, buckets", () => {
  it("D1 api_requests_total: Counter with labels [route, method, status_class]", () => {
    const m = demoMetrics.apiRequestsTotal;
    expect(m).toBeInstanceOf(Counter);
    expect(asMetric(m).name).toBe("webhook_relay_api_requests_total");
    expect([...asMetric(m).labelNames].sort()).toEqual([
      "method",
      "route",
      "status_class",
    ]);
  });

  it("D2 api_request_duration_seconds: Histogram with labels and PRD buckets", () => {
    const m = demoMetrics.apiRequestDurationSeconds;
    expect(m).toBeInstanceOf(Histogram);
    expect(asMetric(m).name).toBe("webhook_relay_api_request_duration_seconds");
    expect([...asMetric(m).labelNames].sort()).toEqual([
      "method",
      "route",
      "status_class",
    ]);
    expect([...asHistogram(m).buckets]).toEqual([
      0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5,
    ]);
  });

  it("D3 api_request_body_bytes: Histogram with label [route] and PRD buckets", () => {
    const m = demoMetrics.apiRequestBodyBytes;
    expect(m).toBeInstanceOf(Histogram);
    expect(asMetric(m).name).toBe("webhook_relay_api_request_body_bytes");
    expect([...asMetric(m).labelNames]).toEqual(["route"]);
    expect([...asHistogram(m).buckets]).toEqual([
      256, 1024, 4096, 16384, 65536, 262144,
    ]);
  });

  it("W1 deliveries_total: Counter with labels [result, http_status_class, error_class]", () => {
    const m = demoMetrics.deliveriesTotal;
    expect(m).toBeInstanceOf(Counter);
    expect(asMetric(m).name).toBe("webhook_relay_deliveries_total");
    expect([...asMetric(m).labelNames].sort()).toEqual([
      "error_class",
      "http_status_class",
      "result",
    ]);
  });

  it("W2 delivery_duration_seconds: Histogram with label [result] and C4 buckets", () => {
    const m = demoMetrics.deliveryDurationSeconds;
    expect(m).toBeInstanceOf(Histogram);
    expect(asMetric(m).name).toBe("webhook_relay_delivery_duration_seconds");
    expect([...asMetric(m).labelNames]).toEqual(["result"]);
    // PRD §3.3 W2 — "버킷: C4와 동일".
    expect([...asHistogram(m).buckets]).toEqual([
      0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30,
    ]);
  });

  it("W3 delivery_attempts_per_job: Histogram with label [outcome] and PRD buckets", () => {
    const m = demoMetrics.deliveryAttemptsPerJob;
    expect(m).toBeInstanceOf(Histogram);
    expect(asMetric(m).name).toBe("webhook_relay_delivery_attempts_per_job");
    expect([...asMetric(m).labelNames]).toEqual(["outcome"]);
    expect([...asHistogram(m).buckets]).toEqual([1, 2, 3, 5, 8, 13, 21]);
  });

  it("W4 receiver_received_total: Counter with no labels", () => {
    const m = demoMetrics.receiverReceivedTotal;
    expect(m).toBeInstanceOf(Counter);
    expect(asMetric(m).name).toBe("webhook_relay_receiver_received_total");
    expect([...asMetric(m).labelNames]).toEqual([]);
  });
});

describe("UT demo constants — label enum closures (PRD §4.2)", () => {
  it("STATUS_CLASSES = 2xx/3xx/4xx/5xx", () => {
    expect([...STATUS_CLASSES].sort()).toEqual(["2xx", "3xx", "4xx", "5xx"]);
  });

  it("HTTP_STATUS_CLASSES = 2xx/3xx/4xx/5xx/none", () => {
    expect([...HTTP_STATUS_CLASSES].sort()).toEqual([
      "2xx",
      "3xx",
      "4xx",
      "5xx",
      "none",
    ]);
  });

  it("DELIVERY_RESULTS = success/http_error/network_error/timeout/ssrf_blocked", () => {
    expect([...DELIVERY_RESULTS].sort()).toEqual([
      "http_error",
      "network_error",
      "ssrf_blocked",
      "success",
      "timeout",
    ]);
  });

  it("ERROR_CLASSES = none/RetriableError/NonRetriableError", () => {
    expect([...ERROR_CLASSES].sort()).toEqual([
      "NonRetriableError",
      "RetriableError",
      "none",
    ]);
  });

  it("W3_OUTCOMES = completed/dlq_max_attempts/dlq_non_retriable/dlq_stalled_loss", () => {
    expect([...W3_OUTCOMES].sort()).toEqual([
      "completed",
      "dlq_max_attempts",
      "dlq_non_retriable",
      "dlq_stalled_loss",
    ]);
  });

  it("ROUTE_ENUM = 7 fixed routes (PRD §3.2 D1, §4.2 cardinality 7)", () => {
    expect([...ROUTE_ENUM].sort()).toEqual([
      "/_demo/receiver",
      "/api/queue/stats",
      "/dashboard",
      "/dashboard/...",
      "/healthz",
      "/metrics",
      "/webhooks",
    ]);
  });

  it("REQUEST_DURATION_SECONDS_BUCKETS matches PRD §3.2 D2", () => {
    expect([...REQUEST_DURATION_SECONDS_BUCKETS]).toEqual([
      0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5,
    ]);
  });

  it("REQUEST_BODY_BYTES_BUCKETS matches PRD §3.2 D3", () => {
    expect([...REQUEST_BODY_BYTES_BUCKETS]).toEqual([
      256, 1024, 4096, 16384, 65536, 262144,
    ]);
  });

  it("W3_DELIVERY_ATTEMPTS_BUCKETS matches PRD §3.3 W3", () => {
    expect([...W3_DELIVERY_ATTEMPTS_BUCKETS]).toEqual([1, 2, 3, 5, 8, 13, 21]);
  });
});
