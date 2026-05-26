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
