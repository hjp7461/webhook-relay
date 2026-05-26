import { Counter, Histogram, register as defaultRegister } from "prom-client";

import {
  DELIVERY_DURATION_SECONDS_BUCKETS,
  REQUEST_BODY_BYTES_BUCKETS,
  REQUEST_DURATION_SECONDS_BUCKETS,
  W3_DELIVERY_ATTEMPTS_BUCKETS,
} from "./constants.js";

// demo/metrics.ts
//
// Phase 3 PRD `prd-phase3/01` §3.2 — D1~D3 (HTTP API)
// Phase 3 PRD `prd-phase3/01` §3.3 — W1~W4 (외부 송신 도메인)
//
// 본 모듈은 `demo` 패키지에 속한다(도메인 식별자 보유) — `core/metrics.ts`
// 와 별도. 둘 다 동일한 default registry 에 메트릭을 등록한다(`prd-phase3/02`
// §4.1 — 단일 registry 전략).
//
// PLAN `04-m-obs-3-demo-metrics.md` §4 — 본 모듈은 메트릭 객체만 정의·등록한다.
// wiring(라벨 갱신 시점)은 api/handlers/receiver 측이 담당.

// ---------------------------------------------------------------------------
// D1 — webhook_relay_api_requests_total (Counter)
// ---------------------------------------------------------------------------
// PRD §3.2 D1. 라벨: route / method / status_class.
// route 라벨은 ROUTE_ENUM 잠금(Q-OBS-8 (a)) — wiring 측이 enum 외 값을 등록
// 하지 않는다(카디널리티 보호).

export const apiRequestsTotal: Counter<string> = new Counter({
  name: "webhook_relay_api_requests_total",
  help: "Total HTTP API requests handled by the Fastify server, labeled by route/method/status_class.",
  labelNames: ["route", "method", "status_class"],
  registers: [defaultRegister],
});

// ---------------------------------------------------------------------------
// D2 — webhook_relay_api_request_duration_seconds (Histogram)
// ---------------------------------------------------------------------------
// PRD §3.2 D2. 라벨 동일(route / method / status_class). 버킷 잠정 잠금(Q-OBS-9).

export const apiRequestDurationSeconds: Histogram<string> = new Histogram({
  name: "webhook_relay_api_request_duration_seconds",
  help: "Wall-clock duration of HTTP API request handling, in seconds.",
  labelNames: ["route", "method", "status_class"],
  buckets: [...REQUEST_DURATION_SECONDS_BUCKETS],
  registers: [defaultRegister],
});

// ---------------------------------------------------------------------------
// D3 — webhook_relay_api_request_body_bytes (Histogram)
// ---------------------------------------------------------------------------
// PRD §3.2 D3. body 가 있는 라우트 전용 — wiring 측이 body 없는 라우트(GET 등)
// 에서는 등록하지 않는다.

export const apiRequestBodyBytes: Histogram<string> = new Histogram({
  name: "webhook_relay_api_request_body_bytes",
  help: "HTTP request body size in bytes for POST routes.",
  labelNames: ["route"],
  buckets: [...REQUEST_BODY_BYTES_BUCKETS],
  registers: [defaultRegister],
});

// ---------------------------------------------------------------------------
// W1 — webhook_relay_deliveries_total (Counter)
// ---------------------------------------------------------------------------
// PRD §3.3 W1. 외부 송신 시도 단위 결과. 라벨 enum 은 constants 의
// DELIVERY_RESULTS / HTTP_STATUS_CLASSES / ERROR_CLASSES 가 잠근다.

export const deliveriesTotal: Counter<string> = new Counter({
  name: "webhook_relay_deliveries_total",
  help: "Total outbound webhook deliveries (per-attempt), labeled by result/http_status_class/error_class.",
  labelNames: ["result", "http_status_class", "error_class"],
  registers: [defaultRegister],
});

// ---------------------------------------------------------------------------
// W2 — webhook_relay_delivery_duration_seconds (Histogram)
// ---------------------------------------------------------------------------
// PRD §3.3 W2 — "C4 와 동일" 버킷. fetch 시작→응답/abort 까지의 wall-clock.

export const deliveryDurationSeconds: Histogram<string> = new Histogram({
  name: "webhook_relay_delivery_duration_seconds",
  help: "Wall-clock duration of one outbound webhook delivery attempt, in seconds.",
  labelNames: ["result"],
  buckets: [...DELIVERY_DURATION_SECONDS_BUCKETS],
  registers: [defaultRegister],
});

// ---------------------------------------------------------------------------
// W3 — webhook_relay_delivery_attempts_per_job (Histogram)
// ---------------------------------------------------------------------------
// PRD §3.3 W3. 종단 상태 도달까지의 시도 수 분포. outcome enum 4종.

export const deliveryAttemptsPerJob: Histogram<string> = new Histogram({
  name: "webhook_relay_delivery_attempts_per_job",
  help: "Number of delivery attempts until a job reaches a terminal state (completed or DLQ).",
  labelNames: ["outcome"],
  buckets: [...W3_DELIVERY_ATTEMPTS_BUCKETS],
  registers: [defaultRegister],
});

// ---------------------------------------------------------------------------
// W4 — webhook_relay_receiver_received_total (Counter)
// ---------------------------------------------------------------------------
// PRD §3.3 W4. 데모 수신자(`POST /_demo/receiver`) 도착 카운트.

export const receiverReceivedTotal: Counter<string> = new Counter({
  name: "webhook_relay_receiver_received_total",
  help: "Total payloads received by the demo receiver endpoint.",
  labelNames: [],
  registers: [defaultRegister],
});
