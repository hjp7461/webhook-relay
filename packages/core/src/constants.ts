// core/constants.ts
//
// 도메인 무관 식별자의 단일 출처(CLAUDE.md §4, PLAN `03` §4 단계 2).
//
// 본 파일에는 도메인 식별자가 등장해선 안 된다(IT-R1, IT-OBS-3).
//
// 메트릭 이름·라벨·헬프 텍스트는 PRD `prd-phase3/01` §3.1 표와 글자 단위 일치.
// 본 파일이 단일 출처이며, `core/metrics.ts` 등이 import 한다.

// ---------------------------------------------------------------------------
// 메트릭 이름 (C1~C11) — PRD `prd-phase3/01` §3.1
// ---------------------------------------------------------------------------

export const METRIC_QUEUE_DEPTH = "webhook_relay_queue_depth";
export const METRIC_JOBS_PROCESSED_TOTAL = "webhook_relay_jobs_processed_total";
export const METRIC_JOB_ATTEMPTS_TOTAL = "webhook_relay_job_attempts_total";
export const METRIC_WORKER_PROCESSING_DURATION_SECONDS =
  "webhook_relay_worker_processing_duration_seconds";
export const METRIC_DLQ_JOBS_TOTAL = "webhook_relay_dlq_jobs_total";
export const METRIC_WORKER_ACTIVE_JOBS = "webhook_relay_worker_active_jobs";
export const METRIC_REDIS_RECONNECTS_TOTAL = "webhook_relay_redis_reconnects_total";
export const METRIC_REDIS_UP = "webhook_relay_redis_up";
export const METRIC_SHUTDOWN_STATE = "webhook_relay_shutdown_state";
export const METRIC_SHUTDOWN_REMAINING_JOBS = "webhook_relay_shutdown_remaining_jobs";
export const METRIC_BUILD_INFO = "webhook_relay_build_info";

// ---------------------------------------------------------------------------
// 라벨 이름 (PRD `prd-phase3/01` §3.1 + §4.2 enum)
// ---------------------------------------------------------------------------

export const LABEL_QUEUE = "queue";
export const LABEL_JOB_STATE = "job_state";
export const LABEL_OUTCOME = "outcome";
export const LABEL_REASON = "reason";
export const LABEL_STATE = "state";
export const LABEL_VERSION = "version";
export const LABEL_COMMIT = "commit";
export const LABEL_NODE_VERSION = "node_version";

// ---------------------------------------------------------------------------
// 라벨 값 enum (PRD §4.2)
// ---------------------------------------------------------------------------

// C1 / C2 — job_state. BullMQ 상태 모델 그대로(waiting/active/delayed/completed/failed).
// C2 는 종단 결과만(completed/failed) 사용. C1 은 5개 모두.
export const JOB_STATE_WAITING = "waiting";
export const JOB_STATE_ACTIVE = "active";
export const JOB_STATE_DELAYED = "delayed";
export const JOB_STATE_COMPLETED = "completed";
export const JOB_STATE_FAILED = "failed";

export const QUEUE_DEPTH_JOB_STATES = [
  JOB_STATE_WAITING,
  JOB_STATE_ACTIVE,
  JOB_STATE_DELAYED,
  JOB_STATE_COMPLETED,
  JOB_STATE_FAILED,
] as const;

// C3 / C4 — outcome. PRD §4.2 표.
export const OUTCOME_SUCCESS = "success";
export const OUTCOME_RETRIABLE_ERROR = "retriable_error";
export const OUTCOME_NON_RETRIABLE_ERROR = "non_retriable_error";

export type AttemptOutcome =
  | typeof OUTCOME_SUCCESS
  | typeof OUTCOME_RETRIABLE_ERROR
  | typeof OUTCOME_NON_RETRIABLE_ERROR;

// C5 — reason. PRD §4.2 표.
export const DLQ_REASON_MAX_ATTEMPTS_EXCEEDED = "max_attempts_exceeded";
export const DLQ_REASON_NON_RETRIABLE = "non_retriable";
export const DLQ_REASON_STALLED_LOSS_RECOVERED = "stalled_loss_recovered";

export type DlqReason =
  | typeof DLQ_REASON_MAX_ATTEMPTS_EXCEEDED
  | typeof DLQ_REASON_NON_RETRIABLE
  | typeof DLQ_REASON_STALLED_LOSS_RECOVERED;

// C9 — shutdown state. PRD §4.2 표(running / draining / terminated).
export const SHUTDOWN_STATE_RUNNING = "running";
export const SHUTDOWN_STATE_DRAINING = "draining";
export const SHUTDOWN_STATE_TERMINATED = "terminated";

export const SHUTDOWN_STATES = [
  SHUTDOWN_STATE_RUNNING,
  SHUTDOWN_STATE_DRAINING,
  SHUTDOWN_STATE_TERMINATED,
] as const;

export type ShutdownState = (typeof SHUTDOWN_STATES)[number];

// ---------------------------------------------------------------------------
// Histogram 버킷 (Q-OBS-9 (b) 잠정 잠금 — PRD `prd-phase3/01` §3.1 C4)
// ---------------------------------------------------------------------------

export const WORKER_PROCESSING_DURATION_BUCKETS: ReadonlyArray<number> = [
  0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30,
];
