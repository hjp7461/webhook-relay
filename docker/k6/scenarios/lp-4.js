// docker/k6/scenarios/lp-4.js — LP-4 spike (base 100 → spike 1000 → base 100)
//
// 단일 출처:
// - PRD docs/prd-phase4/01-load-profiles.md §3.1 (LP-4 잠금) + §4.3 (결정성 패딩)
// - PRD docs/prd-phase4/04-scaling-and-knees.md §4.3 (spike 회복 시간 측정 의도)
// - PLAN docs/plan-phase4/05-m-load-4-lp3-lp4.md §3.2 + §4 단계 2 (본 시나리오 명세)
// - PLAN docs/plan-phase4/08-cross-cutting.md §4 (결정성 패딩 + 횡단 정책)
//
// LP-4 부하 패턴 (PRD §3.1, PLAN §4 단계 2):
//   R_base  = 100 RPS  (Q-LOAD-6 (b) 중도 셋 — LP-2 와 동일 nominal 영역)
//   R_spike = 1000 RPS (Q-LOAD-6 (b) 중도 셋 — spike 영역)
//   T_spike = 30s sustained (PLAN §4 단계 2 잠금)
//   P = small 1KB 고정 (request body 전체)
//   stages (PLAN §4 단계 2 명세 — 본 commit 이 시간 배분 잠금):
//     5m @ 100   (W_base_1, base 정상 분포 확보)
//     10s ramp 100 → 1000 (W_warmup_to_spike)
//     30s @ 1000 (T_spike sustained)
//     10s ramp 1000 → 100 (W_recovery_to_base)
//     5m @ 100   (W_base_2, 회복 시간 측정 + base 복귀 검증)
//   total stages = 10m 50s + cooldown 60s (run-lp-4.sh 책임) ≈ 12분
//
// 단계 2 결정 잠금 정합 (LP-1/LP-2/LP-3 와 동일):
//   1) HMAC 헤더 부착 없음. POST /webhooks 는 Bearer 만 검증.
//   2) 페이로드 1024 bytes 기준은 POST /webhooks request body 전체. _pad 길이는
//      매 요청 skeleton.length 로부터 동적 계산 (LP-1 패턴 mirror).
//
// payload.idempotencyKey 부착 (M-LOAD-3 fix ec1da6d cross-link):
//   LP-4 는 variant 미지정 (= normal) 이라 receiver 의 s3 카운터 충돌은
//   발현되지 않으나, 표준 패턴 일관성을 위해 동일 부착.
//
// LP-4 의 variant 정합:
//   stub 응답은 항상 200 (happy path). variant query param 미부착 →
//   /_demo/receiver 의 normal 모드 default.
//
// spike RPS 도달 검증 (PLAN §4 단계 2 회귀 가드):
//   spike 구간 30s 동안 R_spike 가 정확히 1000 RPS 에 도달하는지 k6 의
//   iterations 카운터로 확인 (측정 후 run-lp-4.sh + 보고서 단계 6 책임).

import http from 'k6/http';

const TARGET_URL = __ENV.K6_TARGET_URL || 'http://api:3000/webhooks';
const BEARER_TOKEN = __ENV.K6_API_BEARER_TOKEN;
const RECEIVER_URL = __ENV.K6_RECEIVER_URL || 'http://api:3000/_demo/receiver';

const TARGET_BODY_BYTES = 1024; // small = 1KB (request body 전체, 결정 잠금 2)

export const options = {
  scenarios: {
    lp_4_spike: {
      executor: 'ramping-arrival-rate',
      // ramping-arrival-rate 의 startRate 는 stages 첫 ramp 시작값.
      // 첫 stage 가 5m @ 100 으로 정의되어 있으므로 startRate=100 으로 즉시
      // base 상태 진입 (= W_base_1 의 의미 보존).
      startRate: 100,
      timeUnit: '1s',
      stages: [
        { duration: '5m', target: 100 },   // W_base_1 (base 정상 분포)
        { duration: '10s', target: 1000 }, // ramp up 100 → 1000
        { duration: '30s', target: 1000 }, // T_spike sustained
        { duration: '10s', target: 100 },  // ramp down 1000 → 100
        { duration: '5m', target: 100 },   // W_base_2 (회복 시간 측정 + base 복귀)
      ],
      preAllocatedVUs: 100,
      maxVUs: 1000,
      tags: { lp_id: 'LP-4', stage: __ENV.STAGE || 'load' },
    },
  },
};

export function setup() {
  if (!BEARER_TOKEN) {
    throw new Error('K6_API_BEARER_TOKEN env required (set via docker-compose.yml k6.environment)');
  }
}

export default function () {
  const stage = __ENV.STAGE || 'load';
  // 결정성 idempotencyKey — 매 요청 고유 + 재현 가능.
  // 형식: lp4-<stage>-<vu>-<iter>. 8~128 chars + [A-Za-z0-9_-]+ 정합.
  const idempotencyKey = `lp4-${stage}-${__VU}-${__ITER}`;

  // 결정성 패딩 — request body 전체가 TARGET_BODY_BYTES 가 되도록 _pad 길이를
  // 동적 계산. payload.idempotencyKey 부착 (M-LOAD-3 fix cross-link).
  const skeleton = JSON.stringify({
    url: RECEIVER_URL,
    payload: { event: 'lp-4', _pad: '', idempotencyKey },
    idempotencyKey,
  });
  const padLen = TARGET_BODY_BYTES - skeleton.length;
  if (padLen < 0) {
    throw new Error(`Cannot pad to ${TARGET_BODY_BYTES} bytes — skeleton already ${skeleton.length}`);
  }
  const body = JSON.stringify({
    url: RECEIVER_URL,
    payload: { event: 'lp-4', _pad: 'x'.repeat(padLen), idempotencyKey },
    idempotencyKey,
  });

  http.post(TARGET_URL, body, {
    headers: {
      'Authorization': `Bearer ${BEARER_TOKEN}`,
      'Content-Type': 'application/json',
    },
    // 등록 응답 타임아웃. spike 구간에서 등록 지연 자체가 증가할 가능성이 있어
    // 5s 보수적 가드 (LP-1/LP-2/LP-3 동일).
    timeout: '5s',
    tags: { endpoint: 'webhooks_post', size_bytes: String(TARGET_BODY_BYTES) },
  });
}
