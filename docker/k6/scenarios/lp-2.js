// docker/k6/scenarios/lp-2.js — LP-2 nominal sustained 측정 시나리오
//
// 단일 출처:
// - PRD docs/prd-phase4/01-load-profiles.md §3.1 (LP-2 잠금) + §4.1 (페이로드 분포)
//   + §4.3 (결정성 패딩)
// - PLAN docs/plan-phase4/04-m-load-3-lp2-nominal.md §4 단계 1 (본 시나리오 명세)
// - PLAN docs/plan-phase4/08-cross-cutting.md §4 (결정성 패딩 + 횡단 정책)
//
// LP-2 부하 패턴 (PRD §3.1):
//   R = 100 RPS         (Q-LOAD-6 (b) 중도 셋 잠금)
//   P = small 1KB 80% + medium 16KB 15% + large 64KB 5%
//                       (Q-LOAD-7 (a) 운영 평균 가정)
//   T = steady          (constant-arrival-rate)
//   W = 60s warmup + 30m load + 60s cooldown ≈ 32분
//                       (Q-LOAD-8 (b) sustained 측정)
//
// 4 변형 (PLAN §3.1, PRD `prd-phase4/01` §6 IT-S 매핑표):
//   VARIANT=normal → /_demo/receiver 가 항상 200            (IT-S1 happy path)
//   VARIANT=s3     → /_demo/receiver 가 K=2 회 5xx 후 200   (IT-S3 재시도+백오프)
//   VARIANT=s4     → /_demo/receiver 가 항상 5xx            (IT-S4 max attempts → DLQ)
//   VARIANT=s5     → /_demo/receiver 가 항상 4xx            (IT-S5 non_retriable → DLQ)
//
// 단계 1 결정 잠금 정합 (LP-1 과 동일):
//   1) HMAC 헤더 부착 없음. POST /webhooks 는 Bearer 만 검증하며 HMAC 는
//      워커 → 외부 수신자 송신 시 부착(packages/demo/src/handlers/deliver.ts +
//      domain/hmac.ts). k6 가 HMAC 부착할 필요 0.
//   2) 페이로드 N bytes 기준은 POST /webhooks request body 전체.
//      D3 api_request_body_bytes 메트릭 + PRD §2.2 "P = 요청 본문 바이트 분포"
//      정합. _pad 길이는 매 요청 skeleton.length 로부터 동적 계산.
//
// 결정성 잠정 (PLAN §4 단계 1 결정 의존 주의, 2026-05-27 사용자 선택):
//   페이로드 크기 가중치 선택은 K6_SEED env 로 시드된 자체 PRNG (mulberry32) 사용.
//   k6 의 Math.random() 은 시드 불가능 → 자체 PRNG 도입. K6_SEED default = 0.
//   매 측정 같은 시드 → 같은 (VU, ITER) → 같은 페이로드 크기 → 매 측정 같은
//   분포 패턴 (PLAN README §4.1 결정성 효과 정합).
//   사후 잠금: 단계 4 측정 후 분산 ±5% 안에서 안정적이면 사용자 확인 + commit.

import http from 'k6/http';

const TARGET_URL = __ENV.K6_TARGET_URL || 'http://api:3000/webhooks';
const BEARER_TOKEN = __ENV.K6_API_BEARER_TOKEN;
// 워커 송신 대상. 같은 컨테이너 네트워크 안의 _demo/receiver
// + variant query param 으로 stub 응답 모드 분기 (단계 2 책임).
const RECEIVER_BASE = __ENV.K6_RECEIVER_URL || 'http://api:3000/_demo/receiver';
const VARIANT = __ENV.VARIANT || 'normal';
const RECEIVER_URL = `${RECEIVER_BASE}?variant=${VARIANT}`;

// 페이로드 크기 분포 (PRD §4.1 + Q-LOAD-7 (a) 운영 평균 가정).
// bytes = POST /webhooks request body 전체 (단계 1 결정 잠금 2).
const SIZES = [
  { bytes: 1024, weight: 80 },   // small 1KB
  { bytes: 16384, weight: 15 },  // medium 16KB
  { bytes: 65536, weight: 5 },   // large 64KB
];
const TOTAL_WEIGHT = SIZES.reduce((acc, s) => acc + s.weight, 0); // = 100

// 결정성 PRNG — mulberry32. K6_SEED env 로 시드.
// 매 (VU, ITER) 마다 selectSize() 가 같은 결과 → 매 측정 같은 분포 패턴.
const SEED = Number(__ENV.K6_SEED) || 0;
let prngState = SEED;
function nextRandom() {
  let t = (prngState += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function selectSize() {
  const r = Math.floor(nextRandom() * TOTAL_WEIGHT);
  let acc = 0;
  for (const s of SIZES) {
    acc += s.weight;
    if (r < acc) return s.bytes;
  }
  return SIZES[0].bytes;
}

export const options = {
  scenarios: {
    lp_2_nominal: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.RPS) || 100,
      timeUnit: '1s',
      duration: __ENV.DURATION || '30m',
      preAllocatedVUs: 50,
      maxVUs: 100,
      tags: {
        lp_id: 'LP-2',
        stage: __ENV.STAGE || 'load',
        variant: VARIANT,
      },
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
  // idempotencyKey 형식: lp2-<variant>-<stage>-<vu>-<iter>.
  // 8~128 chars + [A-Za-z0-9_-]+ 정합 (packages/demo/src/domain/idempotency-key.ts).
  // variant 분리로 4 변형 사이 jobId 충돌 회피 (BullMQ 의 동일 jobId 중복 흡수가
  // 변형 사이에서 발동되지 않도록).
  const idempotencyKey = `lp2-${VARIANT}-${stage}-${__VU}-${__ITER}`;

  const targetBytes = selectSize();

  // 결정성 패딩 — request body 전체가 targetBytes 가 되도록 _pad 길이를
  // 동적 계산 (단계 1 결정 잠금 2 + PLAN 08-cross-cutting §4).
  const skeleton = JSON.stringify({
    url: RECEIVER_URL,
    payload: { event: 'lp-2', _pad: '' },
    idempotencyKey,
  });
  const padLen = targetBytes - skeleton.length;
  if (padLen < 0) {
    // url / idempotencyKey 가 길어져 skeleton 이 이미 target 초과한 경우.
    // 현재 default 값에서는 skeleton ~140 bytes 라 small 1024 에서도 양수.
    // variant / VU / ITER 길이가 극단적으로 커지면 본 가드가 측정 의미 보존.
    throw new Error(`Cannot pad to ${targetBytes} bytes — skeleton already ${skeleton.length}`);
  }
  const body = JSON.stringify({
    url: RECEIVER_URL,
    payload: { event: 'lp-2', _pad: 'x'.repeat(padLen) },
    idempotencyKey,
  });

  http.post(TARGET_URL, body, {
    headers: {
      'Authorization': `Bearer ${BEARER_TOKEN}`,
      'Content-Type': 'application/json',
    },
    // 등록 응답 타임아웃. POST /webhooks 정상 응답은 100ms 이하 — 5s 보수적 가드.
    timeout: '5s',
    tags: { endpoint: 'webhooks_post', size_bytes: String(targetBytes) },
  });
}
