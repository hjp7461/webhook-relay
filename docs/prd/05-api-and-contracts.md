# 05. API & Contracts — 작업 등록 API, 페이로드 스키마, 환경변수, 로깅 컨텍스트

> 담당 페르소나: **API Designer** + **PM**
> 본 문서는 외부 경계의 계약(contract)을 정의한다. **모든 외부 입력은 Zod로 파싱**된 뒤 도메인에서 신뢰된다.
> 구현 코드는 본 PRD가 승인된 뒤 **후속 PLAN 단계**에서 작성한다.
>
> **AI 협업 5원칙(CLAUDE.md §7) 적용:** 계약 변경은 사람이 먼저 결정한다(원칙 1). 새 필드/엔드포인트 추가는 범위 통제(원칙 3) — 본 PRD 범위에 없는 항목은 `07`의 오픈 퀘스천으로 보낸다.

## 1. 컨텍스트 / 배경

CLAUDE.md §4 코딩 컨벤션은 "외부 입력(HTTP body, 환경변수, Redis에서 읽은 payload)은 경계에서
Zod로 파싱한 뒤 내부에서는 타입을 신뢰한다"고 못 박는다. 본 문서는 그 "경계"에 해당하는
모든 계약을 명세한다.

본 문서가 정의하는 계약:

- 작업 등록 API(`POST /webhooks`)의 요청/응답/에러 스키마
- 작업 페이로드 내부 스키마(워커가 Redis에서 꺼내 읽을 때 적용)
- 데모 수신 엔드포인트의 계약
- 대시보드 데이터 인터페이스(읽기 전용 카운터)
- 환경변수 목록과 기본값
- 구조화 로깅의 필수 컨텍스트 필드

## 2. 목표 (Goals)

- **G5.1** 모든 외부 입력에 Zod 스키마가 존재한다.
- **G5.2** 에러 응답 형식이 단일하다 (필드별 에러 메시지가 일관됨).
- **G5.3** 환경변수는 단일 모듈(`demo/config.ts`)에서 파싱·검증된다. `core`는 환경변수를 직접 읽지 않는다.
- **G5.4** 로깅 컨텍스트의 필수 필드가 명문화된다.

## 3. 비목표 (Non-Goals)

- **N5.1** OpenAPI 스펙 생성 자동화 (필요 시 후속 PRD).
- **N5.2** API 버저닝(`/v1`). 본 PRD는 단일 버전만.
- **N5.3** 다국어 에러 메시지.

## 4. 작업 등록 API

### 4.1 요청
- **메서드/경로:** `POST /webhooks`
- **Content-Type:** `application/json`
- **요청 헤더:**
  - `Content-Type: application/json` (필수)
  - `Authorization: Bearer <API_BEARER_TOKEN>` (필수) — 환경변수 `API_BEARER_TOKEN`(최소 32 bytes, Zod fail-fast)과 일치해야 함. 누락/불일치 시 `401 Unauthorized`. 키 회수/롤테이션은 본 PRD 범위 밖. _(결정 잠금: PLAN `Q-API-1`)_

### 4.2 요청 본문 스키마 (Zod)

```ts
// 본 코드는 PRD 예시이며 PLAN 단계에서 정식 구현된다.
WebhookCreateRequestSchema = z.object({
  url: z.string().url(),                                  // 외부 수신자 URL
  payload: z.record(z.unknown()),                         // 임의 JSON 객체
  idempotencyKey: z.string().min(8).max(128),             // 2단계부터 필수
  headers: z.record(z.string()).optional(),               // 수신자에게 함께 보낼 헤더(인증 제외)
})
```

| 필드 | 1단계 | 2단계 | 비고 |
|------|--------|--------|------|
| `url` | 필수 | 필수 | http/https만 허용. private CIDR 차단 정책은 `07` 오픈 퀘스천 |
| `payload` | 필수 | 필수 | 크기 상한 env `WEBHOOK_MAX_PAYLOAD_BYTES` (기본 64 KB) |
| `idempotencyKey` | 선택 | **필수** | 1단계는 수신만, 활용은 2단계 |
| `headers` | 선택 | 선택 | 화이트리스트 정책은 보안상 `06` 참조 |

### 4.3 성공 응답
- **상태:** `202 Accepted`
- **본문:**
  ```json
  { "jobId": "string" }
  ```
- **idempotency 재요청:** 동일 키에 대해 동일 `jobId`를 반환. HTTP 상태는 동일하게 `202`. _(결정 잠금: PLAN `Q-API-2`)_

### 4.4 에러 응답 (공통 형식)
모든 4xx/5xx 응답은 다음 형식을 따른다.

```json
{
  "error": {
    "code": "ERR_VALIDATION" | "ERR_PAYLOAD_TOO_LARGE" | "ERR_INTERNAL" | "...",
    "message": "사람이 읽을 수 있는 요약",
    "details": [
      { "path": "url", "message": "Invalid URL" }
    ]
  }
}
```

- **400 Bad Request** — Zod 검증 실패. `details`에 필드별 메시지.
- **401 Unauthorized** — `Authorization` 헤더 누락/형식 오류/토큰 불일치. 응답 본문 `details`는 비워 정보 누출 최소화.
- **413 Payload Too Large** — `WEBHOOK_MAX_PAYLOAD_BYTES` 초과.
- **500 Internal Server Error** — Redis 연결 실패 등 인프라 오류 (요청 데이터에는 책임 없음).
- **503 Service Unavailable** — 셧다운 진행 중에 들어온 신규 요청.

## 5. 데모 수신 엔드포인트

- **메서드/경로:** `POST /_demo/receiver`
- **Content-Type:** `application/json`
- 동작: 본문을 메모리(최근 N건)에 보관하고 `200 OK` 응답.
- **목적은 데모/테스트 전용이며 실제 워커가 보낸 페이로드를 눈으로 확인하는 용도**.
- 본 PRD는 이 엔드포인트의 인증을 요구하지 않는다. 단, 외부 노출 시 위험을 README에 명시.

## 6. 대시보드 데이터 인터페이스

- **메서드/경로:** `GET /dashboard` (HTML)
- **메서드/경로:** `GET /api/queue/stats` (JSON, 대시보드가 폴링용으로 사용)
  ```json
  {
    "waiting": 0,
    "active": 0,
    "completed": 0,
    "failed": 0,
    "delayed": 0,
    "dlq": 0
  }
  ```
- 대시보드는 위 JSON을 일정 간격(예: 2~5초)으로 폴링한다. SSE/WebSocket은 본 PRD 범위 밖.

## 7. 작업 페이로드 (Redis 내부 표현)

워커가 Redis에서 작업을 꺼내 읽을 때, 페이로드를 Zod로 재검증한다.

```ts
WebhookJobDataSchema = z.object({
  url: z.string().url(),
  payload: z.record(z.unknown()),
  headers: z.record(z.string()).optional(),
  idempotencyKey: z.string(),
  // 서명은 워커에서 송신 직전에 생성. 큐 페이로드에 저장하지 않는다(시크릿 분리).
})
```

> **참고:** HMAC 서명을 큐 페이로드에 저장하지 않는다. 시크릿은 워커가 환경변수에서 직접
> 읽고 송신 직전에 서명을 만든다. (`06` §2 참조)

## 8. 환경변수 목록

모든 환경변수는 `demo/config.ts`에서 Zod로 파싱한다. `core`는 환경변수를 직접 읽지 않으며,
필요한 값은 함수 인자/옵션으로 주입받는다.

| 키 | 타입 | 기본값 | 적용 단계 | 설명 |
|----|------|--------|-----------|------|
| `REDIS_URL` | string (URL) | `redis://localhost:6379` | 1 | Redis 연결 URL |
| `PORT` | number | `3000` | 1 | Fastify 포트 |
| `LOG_LEVEL` | enum | `info` | 1 | `debug`/`info`/`warn`/`error` |
| `WEBHOOK_MAX_PAYLOAD_BYTES` | number | `65536` (64 KB) | 1 | 페이로드 상한 |
| `WEBHOOK_DELIVERY_TIMEOUT_MS` | number | `5000` | 1 | 외부 송신 타임아웃 |
| `WEBHOOK_MAX_ATTEMPTS` | number | `5` | 2 | 최대 재시도 횟수 (BullMQ `attempts`) |
| `WEBHOOK_BACKOFF_BASE_MS` | number | `1000` | 2 | 지수 백오프의 base delay |
| `WEBHOOK_HMAC_SECRET` | string | (없음, 미설정 시 시작 거부) | 2 | HMAC 서명 시크릿. 필수 |
| `WEBHOOK_HMAC_HEADER` | string | `X-Webhook-Signature` | 2 | 서명을 담을 헤더 이름 |
| `QUEUE_NAME` | string | `webhook-delivery` | 1 | 메인 큐 이름 (`constants.ts`와 동기화) |
| `DLQ_NAME` | string | `webhook-delivery-dlq` | 2 | DLQ 이름 |
| `STALLED_INTERVAL_MS` | number | `30000` | 2 | BullMQ stalled 체크 주기 |
| `MAX_STALLED_COUNT` | number | `1` | 2 | stalled로 마킹되는 최대 횟수 |
| `SHUTDOWN_TIMEOUT_MS` | number | `30000` | 2 | 그레이스풀 셧다운 최대 대기 |
| `REDIS_RECONNECT_BASE_MS` | number | `200` | 1 | Redis 재연결 백오프 base |
| `REDIS_RECONNECT_MAX_MS` | number | `10000` | 1 | Redis 재연결 백오프 상한 |
| `WORKER_CONCURRENCY` | number | `5` | 1 | 워커 동시 처리 수 |

> 필수 시크릿(`WEBHOOK_HMAC_SECRET`)이 누락되면 부트스트랩에서 **즉시 종료**(fail-fast).

## 9. 로깅 컨텍스트 (필수 필드)

CLAUDE.md §4의 "구조화 로깅" 정책을 본 PRD 수준으로 구체화한다.

| 필드 | 1단계 | 2단계 | 비고 |
|------|--------|--------|------|
| `requestId` | ✅ | ✅ | API 요청 단위 |
| `jobId` | ✅ | ✅ | 작업 단위 |
| `idempotencyKey` | (수집만) | ✅ | 2단계부터 필수 사용 |
| `attempt` | — | ✅ | 워커 시도 번호 |
| `errorClass` | — | ✅ | `RetriableError` / `NonRetriableError` / `WebhookDeliveryError` |
| `httpStatus` | — | ✅ | 수신자 응답 상태 (전송 결과 로그) |
| `queueName` | ✅ | ✅ | 큐 이름 |
| `durationMs` | (선택) | (선택) | 처리 소요 |

### 금지 사항
- `WEBHOOK_HMAC_SECRET` 값, `headers.Authorization`, 요청 본문 전체를 로그에 남기지 않는다.
- 페이로드 전체 덤프를 기본 로그 레벨에서 출력하지 않는다 (`debug`에서만 허용, 그것도 마스킹 가능).

## 10. 수용 기준 (Acceptance Criteria)

- **AC5.1** Zod 스키마는 `demo/domain/**`(요청·페이로드)과 `demo/config.ts`(환경변수)에 단일 출처로 존재한다.
- **AC5.2** 잘못된 요청은 §4.4 에러 응답 형식으로 응답한다.
- **AC5.3** 환경변수 누락(필수 시크릿)이면 부트스트랩이 실패하고 명확한 메시지를 로그로 남긴다.
- **AC5.4** 로그 출력에 시크릿/Authorization 헤더 값이 나타나지 않는다 (로그 스냅샷 단위 테스트로 검증 권장).
- **AC5.5** 큐/DLQ 이름이 `constants.ts`와 환경변수 사이에 어긋나지 않는다 (불일치 시 부트스트랩에서 검증 실패).

## 11. 불변식 / 원칙

- **I5.1** 외부 입력은 Zod 파싱 전엔 `unknown`이다.
- **I5.2** `core`는 환경변수를 직접 읽지 않는다.
- **I5.3** 로깅에 시크릿이 들어가지 않는다 (자동 마스킹은 향후 — `07` 오픈 퀘스천).

## 12. 리스크 / 오픈 퀘스천 (2026-05-26 일괄 잠금)

> 본 PRD 작성 시점에 보류였던 결정들은 PLAN(`docs/plan/00-decisions-needed.md`)에서 잠겼다.
> 모든 Q-ID는 `Resolved`이며, 본 섹션은 추적 목적으로 남겨 둔다.

- **R5.1** 멱등성 재요청 응답 코드 → **PLAN `Q-API-2` Resolved**: `202` + 동일 `jobId`.
- **R5.2** 수신자 URL의 private CIDR 차단 → **PLAN `Q-SEC-1` Resolved**: 환경변수 토글 `ALLOW_PRIVATE_TARGETS`(기본 `true`).
- **R5.3** 작업 등록 API 인증 → **PLAN `Q-API-1` Resolved**: 공유 시크릿 Bearer(`API_BEARER_TOKEN`).
- **R5.4** 로깅 시크릿 자동 마스킹 → **PLAN `Q-SEC-6` Resolved**: 본 PRD에서는 정책만, 자동 마스킹 유틸은 후속 PRD.
- **R5.5** `headers` 필드 화이트리스트 → **PLAN `Q-API-3` Resolved**: 블랙리스트(`Authorization`/`Cookie`/`Host`/`Content-Length`/`Transfer-Encoding`) 적용.
