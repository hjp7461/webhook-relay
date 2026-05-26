import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics as promCollectDefaultMetrics,
  register as defaultRegister,
} from "prom-client";

import {
  LABEL_COMMIT,
  LABEL_JOB_STATE,
  LABEL_NODE_VERSION,
  LABEL_OUTCOME,
  LABEL_QUEUE,
  LABEL_REASON,
  LABEL_STATE,
  LABEL_VERSION,
  METRIC_BUILD_INFO,
  METRIC_DLQ_JOBS_TOTAL,
  METRIC_JOBS_PROCESSED_TOTAL,
  METRIC_JOB_ATTEMPTS_TOTAL,
  METRIC_QUEUE_DEPTH,
  METRIC_REDIS_RECONNECTS_TOTAL,
  METRIC_REDIS_UP,
  METRIC_SHUTDOWN_REMAINING_JOBS,
  METRIC_SHUTDOWN_STATE,
  METRIC_WORKER_ACTIVE_JOBS,
  METRIC_WORKER_PROCESSING_DURATION_SECONDS,
  WORKER_PROCESSING_DURATION_BUCKETS,
} from "./constants.js";

// core/metrics.ts
//
// Phase 3 PRD `prd-phase3/01` §3.1 — C1~C11 메트릭 카탈로그 단일 출처.
// Phase 3 PRD `prd-phase3/02` §4.1 — 단일 default registry.
//
// 본 모듈은 도메인(웹훅) 식별자를 포함하지 않는다(CLAUDE.md §3, IT-R1, IT-OBS-3).
// 메트릭 이름·라벨·헬프 텍스트는 PRD 와 글자 단위 일치(AC3.1).
// 본 모듈은 default registry 에 메트릭을 등록만 한다(wiring 은 queue/worker/
// shutdown/demo 가 담당 — PLAN `03` §4).

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

// ---------------------------------------------------------------------------
// C1 — webhook_relay_queue_depth (Gauge)
// ---------------------------------------------------------------------------
// PRD `prd-phase3/01` §3.1 C1.
// collect() hook 은 본 모듈이 아닌 wiring 측(`core/queue.ts`)이 설정한다.

export const queueDepth: Gauge<string> = new Gauge({
  name: METRIC_QUEUE_DEPTH,
  help: "Number of jobs in the queue by state (scraped from the broker on demand).",
  labelNames: [LABEL_QUEUE, LABEL_JOB_STATE],
});

// ---------------------------------------------------------------------------
// C2 — webhook_relay_jobs_processed_total (Counter)
// ---------------------------------------------------------------------------

export const jobsProcessedTotal: Counter<string> = new Counter({
  name: METRIC_JOBS_PROCESSED_TOTAL,
  help: "Total number of jobs processed terminally by workers.",
  labelNames: [LABEL_QUEUE, LABEL_JOB_STATE],
});

// ---------------------------------------------------------------------------
// C3 — webhook_relay_job_attempts_total (Counter)
// ---------------------------------------------------------------------------

export const jobAttemptsTotal: Counter<string> = new Counter({
  name: METRIC_JOB_ATTEMPTS_TOTAL,
  help: "Total number of job handler attempts, classified by outcome.",
  labelNames: [LABEL_QUEUE, LABEL_OUTCOME],
});

// ---------------------------------------------------------------------------
// C4 — webhook_relay_worker_processing_duration_seconds (Histogram)
// ---------------------------------------------------------------------------
// Q-OBS-9 (b) 잠정 잠금 — 버킷은 PRD `prd-phase3/01` §3.1 표 그대로.

export const workerProcessingDurationSeconds: Histogram<string> = new Histogram({
  name: METRIC_WORKER_PROCESSING_DURATION_SECONDS,
  help: "Wall-clock duration of one worker handler invocation, in seconds.",
  labelNames: [LABEL_QUEUE, LABEL_OUTCOME],
  buckets: [...WORKER_PROCESSING_DURATION_BUCKETS],
});

// ---------------------------------------------------------------------------
// C5 — webhook_relay_dlq_jobs_total (Counter)
// ---------------------------------------------------------------------------

export const dlqJobsTotal: Counter<string> = new Counter({
  name: METRIC_DLQ_JOBS_TOTAL,
  help: "Total number of jobs moved to the dead-letter queue, by reason.",
  labelNames: [LABEL_REASON],
});

// ---------------------------------------------------------------------------
// C6 — webhook_relay_worker_active_jobs (Gauge)
// ---------------------------------------------------------------------------

export const workerActiveJobs: Gauge<string> = new Gauge({
  name: METRIC_WORKER_ACTIVE_JOBS,
  help: "Number of in-flight jobs currently being processed inside this worker process.",
  labelNames: [],
});

// ---------------------------------------------------------------------------
// C7 — webhook_relay_redis_reconnects_total (Counter)
// ---------------------------------------------------------------------------

export const redisReconnectsTotal: Counter<string> = new Counter({
  name: METRIC_REDIS_RECONNECTS_TOTAL,
  help: "Total number of broker client reconnect events observed by the process.",
  labelNames: [],
});

// ---------------------------------------------------------------------------
// C8 — webhook_relay_redis_up (Gauge, 0/1)
// ---------------------------------------------------------------------------

export const redisUp: Gauge<string> = new Gauge({
  name: METRIC_REDIS_UP,
  help: "Broker client connection state as observed by the process (1 = connected, 0 = disconnected).",
  labelNames: [],
});

// ---------------------------------------------------------------------------
// C9 — webhook_relay_shutdown_state (Gauge with enum label)
// ---------------------------------------------------------------------------

export const shutdownState: Gauge<string> = new Gauge({
  name: METRIC_SHUTDOWN_STATE,
  help: "Process lifecycle state machine; exactly one label value is 1 at any time.",
  labelNames: [LABEL_STATE],
});

// ---------------------------------------------------------------------------
// C10 — webhook_relay_shutdown_remaining_jobs (Gauge)
// ---------------------------------------------------------------------------

export const shutdownRemainingJobs: Gauge<string> = new Gauge({
  name: METRIC_SHUTDOWN_REMAINING_JOBS,
  help: "Number of jobs still in-flight when a graceful shutdown timeout is reached.",
  labelNames: [],
});

// ---------------------------------------------------------------------------
// C11 — webhook_relay_build_info (Gauge, always 1)
// ---------------------------------------------------------------------------

export const buildInfo: Gauge<string> = new Gauge({
  name: METRIC_BUILD_INFO,
  help: "Build metadata exposed as a constant 1 sample for version tracking.",
  labelNames: [LABEL_VERSION, LABEL_COMMIT, LABEL_NODE_VERSION],
});
