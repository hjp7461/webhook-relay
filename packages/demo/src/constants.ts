// demo/constants.ts
//
// 큐/라우트 이름의 단일 출처(CLAUDE.md §4 네이밍, PRD `05`).
// 매직 스트링 금지 — 코드 어디서든 본 파일의 상수를 import 한다.

export const QUEUE_NAME = "webhook-delivery";
export const DLQ_NAME = "webhook-delivery-dlq";

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

// 에러 코드(PRD `05` §4.4 형식).
export const ERROR_CODES = {
  VALIDATION: "ERR_VALIDATION",
  UNAUTHORIZED: "ERR_UNAUTHORIZED",
  PAYLOAD_TOO_LARGE: "ERR_PAYLOAD_TOO_LARGE",
  INTERNAL: "ERR_INTERNAL",
} as const;
