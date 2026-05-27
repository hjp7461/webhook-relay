// docker/k6/scenarios/lp-3.js — LP-3 stress sustained 측정 시나리오
//
// 단일 출처:
// - PRD docs/prd-phase4/01-load-profiles.md §3.1 (LP-3 잠금) + §4.3 (결정성 패딩)
// - PRD docs/prd-phase4/04-scaling-and-knees.md §5 (knee point 1차 탐색 절차)
// - PLAN docs/plan-phase4/05-m-load-4-lp3-lp4.md §3.1 + §4 단계 1 (본 시나리오 명세)
// - PLAN docs/plan-phase4/08-cross-cutting.md §4 (결정성 패딩 + 횡단 정책)
//
// LP-3 부하 패턴 (PRD §3.1):
//   R = 500 RPS  (Q-LOAD-6 (b) 중도 셋 잠금 — stress 영역)
//   P = large 64KB **고정** (request body 전체, knee point 탐색 시
//                            payload size variance 를 변수에서 제거)
//   T = steady   (constant-arrival-rate)
//   W = 60s warmup + 30m load + 60s cooldown ≈ 32분 (Q-LOAD-8 (b) sustained)
//
// 단계 1 결정 잠금 정합 (LP-1/LP-2 와 동일):
//   1) HMAC 헤더 부착 없음. POST /webhooks 는 Bearer 만 검증하며 HMAC 는
//      워커 → 외부 수신자 송신 시 부착(packages/demo/src/handlers/deliver.ts +
//      domain/hmac.ts). k6 가 HMAC 부착할 필요 0.
//   2) 페이로드 65536 bytes 기준은 POST /webhooks request body 전체.
//      D3 api_request_body_bytes 메트릭 + PRD §2.2 "P = 요청 본문 바이트 분포"
//      정합. _pad 길이는 매 요청 skeleton.length 로부터 동적 계산
//      (LP-1 패턴 mirror — variant / stage / VU / ITER 길이 변화에도 정확한
//      64KB body 보존).
//
// payload.idempotencyKey 부착 (M-LOAD-3 fix ec1da6d cross-link):
//   LP-2 의 결정성 패딩 환경에서 워커 송신 본문 = payload 만이라는 점이
//   multiple unique 작업의 동일 HMAC 충돌을 유발하여 receiver 카운터 키를
//   교란한 사례가 있다. LP-3 는 variant 미지정 (= normal) 이라 receiver 가
//   해당 카운터를 사용하지 않으나, 표준 패턴 일관성을 위해 동일 부착.
//
// LP-3 의 variant 정합:
//   LP-3 는 stress 영역 측정으로 stub 응답은 항상 200 (happy path). variant
//   query param 미부착 → /_demo/receiver 의 normal 모드 default
//   (packages/demo/src/api/receiver.ts).

import http from 'k6/http';

const TARGET_URL = __ENV.K6_TARGET_URL || 'http://api:3000/webhooks';
const BEARER_TOKEN = __ENV.K6_API_BEARER_TOKEN;
// 워커 송신 대상. 같은 컨테이너 네트워크 안의 _demo/receiver
// (variant 미지정 = normal default, PRD prd-phase4/01 §6 IT-S1 happy-path stub).
const RECEIVER_URL = __ENV.K6_RECEIVER_URL || 'http://api:3000/_demo/receiver';

const TARGET_BODY_BYTES = 65536; // large = 64KB (request body 전체, 결정 잠금 2)

export const options = {
  scenarios: {
    lp_3_stress: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.RPS) || 500,
      timeUnit: '1s',
      duration: __ENV.DURATION || '30m',
      preAllocatedVUs: 200,
      maxVUs: 500,
      tags: { lp_id: 'LP-3', stage: __ENV.STAGE || 'load' },
    },
  },
  // k6 자체 메트릭(http_req_*)은 Prometheus remote write 로 누적
  // (docker-compose.yml k6.environment.K6_PROMETHEUS_RW_SERVER_URL +
  // PLAN 08-cross-cutting.md §3 정합).
};

export function setup() {
  if (!BEARER_TOKEN) {
    throw new Error('K6_API_BEARER_TOKEN env required (set via docker-compose.yml k6.environment)');
  }
}

export default function () {
  const stage = __ENV.STAGE || 'load';
  // 결정성 idempotencyKey — 매 요청 고유 + 재현 가능.
  // 형식: lp3-<stage>-<vu>-<iter>. 8~128 chars + [A-Za-z0-9_-]+ 정합
  // (packages/demo/src/domain/idempotency-key.ts).
  const idempotencyKey = `lp3-${stage}-${__VU}-${__ITER}`;

  // 결정성 패딩 — request body 전체가 TARGET_BODY_BYTES 가 되도록 _pad 길이를
  // 동적 계산 (단계 1 결정 잠금 2). payload.idempotencyKey 부착 (M-LOAD-3 fix).
  const skeleton = JSON.stringify({
    url: RECEIVER_URL,
    payload: { event: 'lp-3', _pad: '', idempotencyKey },
    idempotencyKey,
  });
  const padLen = TARGET_BODY_BYTES - skeleton.length;
  if (padLen < 0) {
    throw new Error(`Cannot pad to ${TARGET_BODY_BYTES} bytes — skeleton already ${skeleton.length}`);
  }
  const body = JSON.stringify({
    url: RECEIVER_URL,
    payload: { event: 'lp-3', _pad: 'x'.repeat(padLen), idempotencyKey },
    idempotencyKey,
  });

  http.post(TARGET_URL, body, {
    headers: {
      'Authorization': `Bearer ${BEARER_TOKEN}`,
      'Content-Type': 'application/json',
    },
    // 등록 응답 타임아웃. POST /webhooks 정상 응답은 100ms 이하 — stress 영역에서
    // 등록 지연 자체가 증가할 가능성이 있어 5s 보수적 가드 (LP-1/LP-2 동일).
    timeout: '5s',
    tags: { endpoint: 'webhooks_post', size_bytes: String(TARGET_BODY_BYTES) },
  });
}
