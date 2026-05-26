// demo/constants.ts
//
// 큐/라우트 이름의 단일 출처(CLAUDE.md §4 네이밍, PRD `05`).
// 매직 스트링 금지 — 코드 어디서든 본 파일의 상수를 import 한다.

export const QUEUE_NAME = "webhook-delivery";
export const DLQ_NAME = "webhook-delivery-dlq";

// HMAC 서명 헤더의 기본 이름(PRD `06` §2.2 — `WEBHOOK_HMAC_HEADER` 의 default).
// 환경변수로 재정의 가능(config Zod default 가 본 상수를 참조).
export const DEFAULT_WEBHOOK_HMAC_HEADER = "X-Webhook-Signature";

export const ROUTE_WEBHOOKS = "/webhooks";
export const ROUTE_DEMO_RECEIVER = "/_demo/receiver";
export const ROUTE_DASHBOARD = "/dashboard";
export const ROUTE_HEALTHZ = "/healthz";
export const ROUTE_QUEUE_STATS = "/api/queue/stats";
export const ROUTE_METRICS = "/metrics";

// 외부 송신 시 차단하는 헤더 블랙리스트(결정 잠금 Q-API-3 (a)).
// 비교는 대소문자 무시.
export const OUTGOING_HEADER_BLACKLIST: readonly string[] = [
  "authorization",
  "cookie",
  "host",
  "content-length",
  "transfer-encoding",
];

// 데모 수신자 메모리 저장소 보관 한도(PRD `01` F1.3 — 최근 N건).
export const RECEIVER_STORE_LIMIT = 50;

// 완료 작업의 Redis 보관 한도. 이 정책이 없으면 Redis 메모리가 누적된다.
// - count: 가장 최근 N건만 유지(관측·디버깅 용도)
// - age: N초 이후 자동 제거(고른 분포 보장)
// 본 PRD 범위에서는 환경변수로 노출하지 않는다(YAGNI). 운영에서 보관 기간을
// 늘리고 싶다면 본 상수 또는 별도 env 도입을 후속 PR로 결정.
export const REMOVE_ON_COMPLETE_COUNT = 1000;
export const REMOVE_ON_COMPLETE_AGE_SECONDS = 24 * 60 * 60; // 24h

// DLQ 보존 정책. 메인 큐(removeOnFail: { count: 0 })와 달리 DLQ 는 운영자가
// 분석할 대상이라 보존 기간을 길게 잡되, 무한 누적은 막는다.
// - DLQ_REMOVE_ON_FAIL_COUNT: 최근 N건만 유지(메인 큐 0 과 대비되는 보수적 마진).
// - DLQ_REMOVE_ON_FAIL_AGE_SECONDS: N초 이후 자동 제거(14일).
// - DLQ_REMOVE_ON_COMPLETE_COUNT: DLQ 에서 completed 가 생기는 일은 본 PRD 에서
//     거의 없으나(워커가 attach 하지 않으므로), 누군가 외부에서 처리한 경우를
//     대비한 안전망.
// 운영자가 보존 기간을 늘리고 싶다면 본 상수 또는 별도 env 도입을 후속 PR로 결정.
export const DLQ_REMOVE_ON_FAIL_COUNT = 10000;
export const DLQ_REMOVE_ON_FAIL_AGE_SECONDS = 14 * 24 * 60 * 60; // 14d
export const DLQ_REMOVE_ON_COMPLETE_COUNT = 100;

// 에러 코드(PRD `05` §4.4 형식).
export const ERROR_CODES = {
  VALIDATION: "ERR_VALIDATION",
  UNAUTHORIZED: "ERR_UNAUTHORIZED",
  PAYLOAD_TOO_LARGE: "ERR_PAYLOAD_TOO_LARGE",
  INTERNAL: "ERR_INTERNAL",
  // M7: 그레이스풀 셧다운 진행 중 신규 요청 거절(AC6.4, Q-SEC-5 (a) 정합).
  SHUTTING_DOWN: "ERR_SHUTTING_DOWN",
} as const;

// ---------------------------------------------------------------------------
// M-OBS-3 — D1~D3, W1~W4 메트릭 라벨 enum (PRD `prd-phase3/01` §3.2/§3.3/§4.2)
// ---------------------------------------------------------------------------
//
// 매직 스트링 금지(CLAUDE.md §4) — 메트릭 wiring 측은 본 모듈의 상수만 import.
// 라벨 값은 폐쇄 집합(PRD §4.2). 자유 문자열 라벨 미사용(AC3.2, I3.2).

// D1/D2 status_class — HTTP API 응답 상태 분류(PRD §4.2 / Q-OBS-5 (a)).
export const STATUS_CLASS_2XX = "2xx";
export const STATUS_CLASS_3XX = "3xx";
export const STATUS_CLASS_4XX = "4xx";
export const STATUS_CLASS_5XX = "5xx";

export const STATUS_CLASSES = [
  STATUS_CLASS_2XX,
  STATUS_CLASS_3XX,
  STATUS_CLASS_4XX,
  STATUS_CLASS_5XX,
] as const;

export type StatusClass = (typeof STATUS_CLASSES)[number];

// W1 http_status_class — 외부 송신 응답의 상태 분류. D1/D2 와 달리 응답 없음
// (네트워크 에러/타임아웃)을 `none` 으로 표현(PRD §4.2).
export const HTTP_STATUS_CLASS_NONE = "none";

export const HTTP_STATUS_CLASSES = [
  STATUS_CLASS_2XX,
  STATUS_CLASS_3XX,
  STATUS_CLASS_4XX,
  STATUS_CLASS_5XX,
  HTTP_STATUS_CLASS_NONE,
] as const;

export type HttpStatusClass = (typeof HTTP_STATUS_CLASSES)[number];

// W1 result — 외부 송신 결과 분류(PRD §4.2).
export const DELIVERY_RESULT_SUCCESS = "success";
export const DELIVERY_RESULT_HTTP_ERROR = "http_error";
export const DELIVERY_RESULT_NETWORK_ERROR = "network_error";
export const DELIVERY_RESULT_TIMEOUT = "timeout";
export const DELIVERY_RESULT_SSRF_BLOCKED = "ssrf_blocked";

export const DELIVERY_RESULTS = [
  DELIVERY_RESULT_SUCCESS,
  DELIVERY_RESULT_HTTP_ERROR,
  DELIVERY_RESULT_NETWORK_ERROR,
  DELIVERY_RESULT_TIMEOUT,
  DELIVERY_RESULT_SSRF_BLOCKED,
] as const;

export type DeliveryResult = (typeof DELIVERY_RESULTS)[number];

// W1 error_class — 1~2단계 분류 에러 타입(PRD §4.2 / Q-RETRY-1 정합).
export const ERROR_CLASS_NONE = "none";
export const ERROR_CLASS_RETRIABLE = "RetriableError";
export const ERROR_CLASS_NON_RETRIABLE = "NonRetriableError";

export const ERROR_CLASSES = [
  ERROR_CLASS_NONE,
  ERROR_CLASS_RETRIABLE,
  ERROR_CLASS_NON_RETRIABLE,
] as const;

export type ErrorClass = (typeof ERROR_CLASSES)[number];

// W3 outcome — 작업이 종단 상태(completed / DLQ 3종)에 도달한 분류(PRD §4.2).
// C3/C4 의 outcome(core) 과 별개 enum 임에 유의(core 의 outcome 은 시도 단위).
export const W3_OUTCOME_COMPLETED = "completed";
export const W3_OUTCOME_DLQ_MAX_ATTEMPTS = "dlq_max_attempts";
export const W3_OUTCOME_DLQ_NON_RETRIABLE = "dlq_non_retriable";
export const W3_OUTCOME_DLQ_STALLED_LOSS = "dlq_stalled_loss";

export const W3_OUTCOMES = [
  W3_OUTCOME_COMPLETED,
  W3_OUTCOME_DLQ_MAX_ATTEMPTS,
  W3_OUTCOME_DLQ_NON_RETRIABLE,
  W3_OUTCOME_DLQ_STALLED_LOSS,
] as const;

export type W3Outcome = (typeof W3_OUTCOMES)[number];

// D1/D2 method — Fastify 라우트에서 등장하는 HTTP 메서드(PRD §4.2).
// 본 PRD 범위에서는 GET / POST 만 사용. 그 외 메서드는 라벨로 기록하지 않는다.
export const METHOD_GET = "GET";
export const METHOD_POST = "POST";

export const ALLOWED_METHODS = [METHOD_GET, METHOD_POST] as const;
export type AllowedMethod = (typeof ALLOWED_METHODS)[number];

// D1/D2 route enum — 명세된 7개 경로만 허용(Q-OBS-8 (a), PRD §3.2 D1 / §4.2).
// `/dashboard/...` 는 향후 동적 path 가 등장할 경우의 placeholder enum 으로
// 본 PRD 가 잠근다(현재는 그대로 등장하지 않음).
export const ROUTE_ENUM = [
  ROUTE_WEBHOOKS,
  ROUTE_DEMO_RECEIVER,
  ROUTE_DASHBOARD,
  "/dashboard/...",
  ROUTE_QUEUE_STATS,
  ROUTE_HEALTHZ,
  ROUTE_METRICS,
] as const;

export type RouteEnum = (typeof ROUTE_ENUM)[number];

// D2 — Histogram 버킷(PRD `prd-phase3/01` §3.2 D2; Q-OBS-9 (b) 잠정 잠금).
export const REQUEST_DURATION_SECONDS_BUCKETS: ReadonlyArray<number> = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5,
];

// D3 — Histogram 버킷(PRD §3.2 D3).
export const REQUEST_BODY_BYTES_BUCKETS: ReadonlyArray<number> = [
  256, 1024, 4096, 16384, 65536, 262144,
];

// W2 — Histogram 버킷. PRD §3.3 W2 — "C4 와 동일" 명시.
export const DELIVERY_DURATION_SECONDS_BUCKETS: ReadonlyArray<number> = [
  0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30,
];

// W3 — Histogram 버킷(PRD §3.3 W3).
export const W3_DELIVERY_ATTEMPTS_BUCKETS: ReadonlyArray<number> = [
  1, 2, 3, 5, 8, 13, 21,
];
