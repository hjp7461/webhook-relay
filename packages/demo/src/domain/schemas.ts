import { z } from "zod";

// demo/domain/schemas.ts
//
// 외부 입력의 단일 출처. PRD `05` §4.2(요청), §7(작업 페이로드).
//
// CLAUDE.md §4: 외부 입력은 경계에서 Zod 로 파싱한 뒤 내부에서는 타입을 신뢰.

// 기본 페이로드 상한 64 KiB (PRD `05` §8 의 WEBHOOK_MAX_PAYLOAD_BYTES 기본).
export const WEBHOOK_DEFAULT_MAX_PAYLOAD_BYTES = 65536;

// 직렬화한 JSON 의 UTF-8 바이트 길이.
function jsonBytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value) ?? "", "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

// 헤더 값은 string-string 매핑만 허용(블랙리스트 적용은 송신 직전).
const HeadersSchema = z.record(z.string(), z.string());

// 멱등성 키 정합성(PLAN `04` §3.1, PRD `02` §F2.1).
// 길이 8~128, 허용 문자 `[A-Za-z0-9_\-]`. 단계 4 에서 동일 규칙의 순수 함수
// (`assertIdempotencyKey`)를 별도로 둔다(테스트 용이성). 본 스키마와의 정합은
// 단계 4 에서 헬퍼로 통합한다.
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_\-]+$/;

/**
 * POST /webhooks 요청 본문 스키마. PRD `05` §4.2.
 *
 * M3 단계 정책:
 * - `idempotencyKey` 는 필수(M2 의 선택에서 격상, PRD `02` §F2.1).
 *   누락 시 Zod 가 400 + 필드 메시지로 거부(AC2.2).
 * - 페이로드는 임의 JSON 객체. 직렬화 바이트가 기본 상한을 넘으면 거부
 *   (런타임 설정값은 부트스트랩 시 결정되지만, 본 스키마는 보수적 기본을 강제).
 */
export const WebhookCreateRequestSchema = z.object({
  url: z.url(),
  payload: z
    .record(z.string(), z.unknown())
    .refine((p) => jsonBytes(p) <= WEBHOOK_DEFAULT_MAX_PAYLOAD_BYTES, {
      message: `payload exceeds default size limit (${WEBHOOK_DEFAULT_MAX_PAYLOAD_BYTES} bytes)`,
    }),
  idempotencyKey: z
    .string()
    .min(8)
    .max(128)
    .regex(IDEMPOTENCY_KEY_PATTERN, {
      message: "idempotencyKey must match [A-Za-z0-9_-] only",
    }),
  headers: HeadersSchema.optional(),
});

export type WebhookCreateRequest = z.infer<typeof WebhookCreateRequestSchema>;

/**
 * 워커가 Redis 에서 꺼낸 작업 페이로드를 재검증하는 스키마(PRD `05` §7).
 *
 * 시크릿(HMAC) 은 큐 페이로드에 저장하지 않는다 — 워커가 송신 직전에 env 에서 읽는다.
 */
export const WebhookJobDataSchema = z.object({
  url: z.url(),
  payload: z.record(z.string(), z.unknown()),
  headers: HeadersSchema.optional(),
  idempotencyKey: z.string().optional(),
});

export type WebhookJobData = z.infer<typeof WebhookJobDataSchema>;
