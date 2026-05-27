import type { FastifyInstance } from "fastify";
import { ROUTE_DEMO_RECEIVER } from "../constants.js";
import { receiverReceivedTotal } from "../metrics.js";
import type { ReceiverStore } from "../receiver/store.js";

// demo/api/receiver.ts — POST /_demo/receiver
//
// 데모용 수신 엔드포인트. PRD `01` F1.3. 본문을 메모리(최근 50건)에 보관하고 200.
// 인증 없음(데모 정책).
//
// M-OBS-3 W4 — `webhook_relay_receiver_received_total` 카운터를 본 핸들러
// 진입점에서 +1 한다(PRD `prd-phase3/02` §4.3). 메트릭 갱신은 동기(I3.5).
//
// M-LOAD-3 단계 2 — query param `?variant=normal|s3|s4|s5` 으로 stub 응답 모드
// 분기. PLAN docs/plan-phase4/04-m-load-3-lp2-nominal.md §4 단계 2 + PRD
// docs/prd-phase4/01 §6 IT-S 매핑표 정합.
//
//   variant=normal (기본) → 항상 200 (1~2단계 IT-S1 회귀 가드).
//   variant=s3           → 작업 식별자별 카운터 K=2 회 503 후 200 (IT-S3 부하 변형).
//   variant=s4           → 항상 503                              (IT-S4 부하 변형).
//   variant=s5           → 항상 400                              (IT-S5 부하 변형).
//
// s3 카운터 키 (2026-05-27 LP-2 측정에서 fix):
// 1) req.body.idempotencyKey 가 있으면 우선 사용 — k6 시나리오의 결정성
//    패딩으로 (VU, ITER) 가 다른 작업이 동일 HMAC 를 만드는 충돌 회피.
// 2) HMAC 서명값 (`sha256=<hex>`) fallback — 1~2단계 IT-S3 같은 직접 호출
//    호환 (worker 송신 시 payload 에 idempotencyKey 없는 경우).
//
// 초기 디자인 (HMAC 단일 키) 는 결정성 패딩 + idempotencyKey 가 외부 송신
// 본문에 없는 조합으로 인해 같은 카운터 슬롯에 multiple unique 작업이 hash
// 되었음. 측정 결과 W3 attempts ≈ 1 (의도 3) 으로 발현. 본 fix 후 W3 ≈ 3.
//
// W4 메트릭(receiverReceivedTotal) 과 store.add 는 variant 와 무관하게 모든
// 도착 요청에 대해 호출 — "도착 자체" 카운트 + 데모 수신자의 최근 N건 보존
// 의미를 변형 사이 일관되게 유지.

const VARIANT_S3 = "s3";
const VARIANT_S4 = "s4";
const VARIANT_S5 = "s5";

// PLAN §4 단계 2 — s3 변형은 K=2 회 5xx 후 200. attemptsMade 의 의미와
// 정합(1차 시도 + 2회 5xx 재시도 = 총 3 attempts 의 마지막에 200).
const S3_RETRY_COUNT = 2;

const HMAC_PREFIX = "sha256=";

export interface ReceiverRouteDeps {
  readonly store: ReceiverStore;
}

export async function registerReceiverRoute(
  app: FastifyInstance,
  deps: ReceiverRouteDeps,
): Promise<void> {
  // s3 변형 카운터. key = 작업 식별자 (idempotencyKey 우선 / HMAC fallback).
  // value = 지금까지 본 요청 수. 측정 종료 후 컨테이너 재시작으로 초기화 —
  // 별도 영속화 0 (PLAN §4 단계 2 "금지: 별도 영속화 0건").
  const s3Counters = new Map<string, number>();

  app.post(ROUTE_DEMO_RECEIVER, async (req, reply) => {
    // W4 — 도착 직후 카운터 +1. store.add 의 성공/실패와 무관(도착 자체 카운트).
    // variant 와 무관하게 모든 도착 요청 카운트.
    receiverReceivedTotal.inc();
    // 헤더는 단순 문자열 매핑으로 보존(시크릿 마스킹은 정책상 본 PRD 범위 외).
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === "string") headers[k] = v;
      else if (Array.isArray(v)) headers[k] = v.join(",");
    }
    deps.store.add({
      receivedAt: Date.now(),
      headers,
      body: req.body,
    });

    // variant 분기 — query param 미지정 또는 'normal' 이면 1~2단계 기본 동작.
    const variant = extractVariant(req.query);

    if (variant === VARIANT_S4) {
      return reply.code(503).send({ ok: false, variant: VARIANT_S4 });
    }
    if (variant === VARIANT_S5) {
      return reply.code(400).send({ ok: false, variant: VARIANT_S5 });
    }
    if (variant === VARIANT_S3) {
      // 카운터 키 우선순위: body.idempotencyKey > HMAC 서명값.
      // 결정성 패딩 환경에서 multiple unique 작업이 동일 HMAC 를 만드는
      // 충돌 회피 — k6 시나리오는 payload 안에 idempotencyKey 부착 권장.
      const counterKey =
        extractBodyIdempotencyKey(req.body) ?? extractHmacSignature(headers);
      if (counterKey === undefined) {
        // 작업 식별자 부재 — 워커 정상 송신에서는 HMAC 항상 부착되므로 정상
        // 경로에서 도달 불가. 외부에서 직접 호출한 진단 케이스. 보수적 503.
        return reply.code(503).send({
          ok: false,
          variant: VARIANT_S3,
          reason: "no_idempotency_key",
        });
      }
      const seen = s3Counters.get(counterKey) ?? 0;
      const next = seen + 1;
      s3Counters.set(counterKey, next);
      if (next <= S3_RETRY_COUNT) {
        return reply
          .code(503)
          .send({ ok: false, variant: VARIANT_S3, attempt: next });
      }
      return reply
        .code(200)
        .send({ ok: true, variant: VARIANT_S3, attempt: next });
    }

    // variant 미지정 또는 'normal' — 1~2단계 IT-S1/S3/S4/S5 회귀 가드.
    return reply.code(200).send({ ok: true });
  });
}

function extractVariant(query: unknown): string | undefined {
  if (query !== null && typeof query === "object" && "variant" in query) {
    const v = (query as { variant: unknown }).variant;
    if (typeof v === "string") return v;
  }
  return undefined;
}

function extractHmacSignature(
  headers: Record<string, string>,
): string | undefined {
  for (const v of Object.values(headers)) {
    if (v.startsWith(HMAC_PREFIX)) return v;
  }
  return undefined;
}

function extractBodyIdempotencyKey(body: unknown): string | undefined {
  if (body !== null && typeof body === "object" && "idempotencyKey" in body) {
    const v = (body as { idempotencyKey: unknown }).idempotencyKey;
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}
