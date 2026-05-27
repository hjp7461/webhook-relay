// docker/k6/scenarios/lp-1.js — LP-1 baseline 측정 시나리오
//
// 단일 출처:
// - PRD docs/prd-phase4/01-load-profiles.md §3.1 (LP-1 잠금) + §4.3 (결정성 패딩)
// - PLAN docs/plan-phase4/03-m-load-2-lp1-baseline.md §4 단계 1 (본 시나리오 명세)
// - PLAN docs/plan-phase4/08-cross-cutting.md §4 (결정성 패딩 + 횡단 정책)
//
// LP-1 부하 패턴 (PRD §3.1):
//   R = 10 RPS  (Q-LOAD-6 (b) 중도 셋 잠금)
//   P = small 1KB 고정 (request body 전체, 단계 1 결정 잠금 2 정합)
//   T = steady  (constant-arrival-rate)
//   W = 60s warmup + 5m load + 30s cooldown ≈ 6.5분 (Q-LOAD-8 (a) 짧은 측정)
//
// 단계 1 결정 잠금 (PLAN §4 단계 1, 2026-05-27):
//   1) HMAC 헤더 부착 없음. POST /webhooks 는 Bearer 만 검증하며 HMAC 는
//      워커 → 외부 수신자 송신 시 부착(packages/demo/src/handlers/deliver.ts +
//      domain/hmac.ts). k6 가 HMAC 부착할 필요 0.
//   2) 페이로드 1024 bytes 기준은 POST /webhooks request body 전체.
//      D3 api_request_body_bytes 메트릭 + PRD §2.2 "P = 요청 본문 바이트 분포"
//      정합. _pad 길이는 매 요청 skeleton.length 로부터 동적 계산.

import http from 'k6/http';

const TARGET_URL = __ENV.K6_TARGET_URL || 'http://api:3000/webhooks';
const BEARER_TOKEN = __ENV.K6_API_BEARER_TOKEN;
// 워커 송신 대상. 같은 컨테이너 네트워크 안의 _demo/receiver
// (PRD prd-phase4/01 §6 IT-S1 happy-path stub).
const RECEIVER_URL = __ENV.K6_RECEIVER_URL || 'http://api:3000/_demo/receiver';

const TARGET_BODY_BYTES = 1024; // small = 1KB (request body 전체, 결정 잠금 2)

export const options = {
  scenarios: {
    lp_1_baseline: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.RPS) || 10,
      timeUnit: '1s',
      duration: __ENV.DURATION || '5m',
      preAllocatedVUs: 5,
      maxVUs: 10,
      tags: { lp_id: 'LP-1', stage: __ENV.STAGE || 'load' },
    },
  },
  // k6 자체 메트릭(http_req_*)은 Prometheus remote write 로 누적
  // (docker-compose.yml k6.environment.K6_PROMETHEUS_RW_SERVER_URL +
  // PLAN 08-cross-cutting.md §3 "k6 메트릭의 별도 job label 분리" 정합).
};

export function setup() {
  if (!BEARER_TOKEN) {
    throw new Error('K6_API_BEARER_TOKEN env required (set via docker-compose.yml k6.environment)');
  }
}

export default function () {
  // 결정성 idempotencyKey — 매 요청 고유 + 재현 가능.
  // __VU + __ITER 가 k6 의 결정성 인덱스. stage 포함으로 warmup/load 간 충돌 회피
  // (BullMQ 의 jobId 중복 흡수가 같은 측정 사이클 내 stage 사이에서 발동되지 않도록).
  // 형식: lp1-<stage>-<vu>-<iter>. 8~128 chars + [A-Za-z0-9_-]+ 정합
  // (packages/demo/src/domain/idempotency-key.ts).
  const stage = __ENV.STAGE || 'load';
  const idempotencyKey = `lp1-${stage}-${__VU}-${__ITER}`;

  // 결정성 패딩 — request body 전체가 TARGET_BODY_BYTES 가 되도록 _pad 길이를
  // 동적 계산 (단계 1 결정 잠금 2).
  const skeleton = JSON.stringify({
    url: RECEIVER_URL,
    payload: { event: 'lp-1', _pad: '' },
    idempotencyKey,
  });
  const padLen = TARGET_BODY_BYTES - skeleton.length;
  if (padLen < 0) {
    // url / idempotencyKey 가 길어져 skeleton 이 이미 target 초과한 경우.
    // 현재 default 값에서는 skeleton ~80 bytes 라 항상 양수. 환경변수로
    // url / receiver 가 크게 길어지면 본 가드가 측정 의미 보존.
    throw new Error(`Cannot pad to ${TARGET_BODY_BYTES} bytes — skeleton already ${skeleton.length}`);
  }
  const body = JSON.stringify({
    url: RECEIVER_URL,
    payload: { event: 'lp-1', _pad: 'x'.repeat(padLen) },
    idempotencyKey,
  });

  http.post(TARGET_URL, body, {
    headers: {
      'Authorization': `Bearer ${BEARER_TOKEN}`,
      'Content-Type': 'application/json',
    },
    // 등록 응답 타임아웃. POST /webhooks 정상 응답은 100ms 이하 — 5s 는 보수적 가드.
    timeout: '5s',
    tags: { endpoint: 'webhooks_post' },
  });
}
