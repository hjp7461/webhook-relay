# 03. M2 — MVP (해피패스): IT-S1을 통과시키는 최소 구현

> **PLAN 진입 조건:** M1 완료 + `00-decisions-needed.md` §3 매트릭스의 M2 행 Q가 모두 Resolved.
>
> **AI 협업 5원칙 적용:**
> - (1) 워커가 외부 fetch 실패 시 어떻게 throw하는지의 불변식은 사람이 §4 단계 1의 테스트로 먼저 못 박는다.
> - (2) §3의 실패 테스트가 §4의 구현보다 먼저 작성된다(테스트 우선).
> - (3) 1단계 비목표(N1.1~N1.6)는 침범하지 않는다. 멱등성·재시도·DLQ·HMAC은 M3~M5에서 다룬다.
> - (4) 불확실하면 §9 오픈 퀘스천 의존을 통해 잠금 확인.
> - (5) 위반 코드 발견 시 보고.

## 1. 목표 한 줄

**`IT-S1-happy-path`를 그린으로 만든다.** 즉, `POST /webhooks` 한 번에 워커가 데모 수신자로 페이로드를 전달하고, BullMQ 상태가 `completed`로 끝나며, 대시보드가 카운터를 표시한다.

## 2. 선행 의존

- **마일스톤:** M1.
- **결정 필요 항목:**
  - Q-API-1 — API 인증 방식 (권장 (a) 인증 없음)
  - Q-API-3 — 요청 본문 `headers` 화이트리스트 (권장 (a) 블랙리스트)
  - Q-API-4 — 응답 필드 범위 (권장 (a) `jobId`만)
  - Q-ARCH-1 — HTTP 클라이언트 (권장 (a) 내장 `fetch`)
  - Q-ARCH-4 — 핸들러 시그니처 제네릭 (권장 (a) `<TData>`)
  - Q-SEC-1 — SSRF 방어 토글 (권장 (b) `ALLOW_PRIVATE_TARGETS`)
  - Q-SEC-3 — 시크릿 최소 길이 (권장 (a) 32 bytes) — M2에서는 HMAC 미적용이지만 fail-fast 정책은 동일 시점에 도입. **단**, M2에서 HMAC 검증 자체는 안 한다(N1.3). 환경변수의 존재만 시작 시 확인.
  - Q-SEC-5 — `/healthz` degraded 표현 (권장 (a) `503`)

## 3. 테스트 우선 시퀀스

본 마일스톤의 **가장 먼저** 작성하는 코드는 다음 테스트들이다. 모두 처음에는 **실패**해야 한다.

### 3.1 단위 테스트
1. **`UT-3` — 작업 등록 요청 Zod 스키마**
   - 파일: `packages/demo/test/webhook-create-request-schema.unit.test.ts`
   - 케이스: `url` 누락 → 거부 / 잘못된 URL → 거부 / `payload`가 객체가 아님 → 거부 / 정상 입력 → 통과 / 페이로드 크기 한도 초과 → 거부.
   - 1단계 정책: `idempotencyKey`는 **선택**(M3에서 필수로 격상).

2. **`UT-4` — 환경변수 Zod 스키마**
   - 파일: `packages/demo/test/config.unit.test.ts`
   - 케이스: 기본값 적용 / 잘못된 타입(`PORT`=문자열) → 거부 / `REDIS_URL` 누락 → 기본값 적용.
   - 1단계 범위: PRD `05` §8 표의 "적용 단계 1" 키만 검증. 2단계 키(`WEBHOOK_MAX_ATTEMPTS` 등)는 본 마일스톤에선 스키마에 포함하되 검증은 M4가 보강.
   - 시크릿(`WEBHOOK_HMAC_SECRET`) 미설정 시 거부 — Q-SEC-3 권장 (a) 32 bytes 최소 길이 검증.

### 3.2 통합 테스트
3. **`IT-S1-happy-path`**
   - 파일: `packages/demo/test/it-s1-happy-path.integration.test.ts`
   - 흐름:
     1. Testcontainers로 Redis 컨테이너 기동.
     2. 본 테스트가 고유한 큐 이름(prefix 포함)으로 Fastify 앱 + 워커 1개를 in-process로 부팅.
     3. 데모 수신자(Fastify in-process 또는 동일 앱의 `/_demo/receiver`)가 수신을 기록.
     4. `POST /webhooks` 호출 (현실적인 페이로드 1건).
     5. 단언: 응답 `202` + `jobId` 존재. 폴링(최대 5초): BullMQ 상태가 `completed`이며, 데모 수신자가 동일 페이로드를 받았다.
   - 결정성: fake timer 없이 짧은 polling(50ms 간격, 최대 5초)로 처리.
   - 격리: 큐 이름에 `randomUUID()` prefix 포함.

> 위 3개 테스트가 **처음 작성된 시점에는 모두 실패**해야 한다. 그래야 §4 구현이 "테스트를 통과시키는 방향"으로 좁아진다.

## 4. 구현 단계 (커밋 단위)

### 단계 0 — 새 의존성 도입 (정당성 명시 커밋)

1. **`chore: add bullmq, ioredis, fastify, zod`**
   - `bullmq` (1차 도메인 인터페이스 — 큐/워커)
   - `ioredis` (BullMQ 권장 클라이언트, CLAUDE.md §2)
   - `fastify` (HTTP 서버, CLAUDE.md §2)
   - `zod` (입력 검증, CLAUDE.md §2)
   - 커밋 메시지에 "CLAUDE.md §2의 고정 스택을 처음 사용. M2의 라우트·큐·워커 구현에 필요" 명시.

2. **`chore: add testcontainers and integration test deps`**
   - `testcontainers` 또는 `@testcontainers/redis`. PLAN 단계 결정: PRD `03`은 "Testcontainers"만 언급하므로 일반 패키지(`testcontainers`)로 시작하고 Redis 모듈을 직접 띄운다.
   - 커밋 메시지에 "통합 테스트 전용. CLAUDE.md §2의 Testcontainers 스택" 명시.

### 단계 1 — 실패 테스트 작성 (먼저)

3. **`test: add UT-3 webhook create request schema`** — §3.1 항목 1.
4. **`test: add UT-4 config env schema`** — §3.1 항목 2.
5. **`test: add IT-S1 happy path (failing)`** — §3.2 항목 3. 이 시점에 실행하면 모듈이 없거나 라우트가 없어서 **실패**한다.

### 단계 2 — `core` 패키지: 도메인 비의존 큐/워커 래퍼

6. **`feat(core): define connection options and queue factory`**
   - `packages/core/src/queue.ts`:
     - `createConnection(options)` — ioredis 연결 옵션 객체를 인자로 받아 BullMQ가 쓸 수 있는 IORedis 인스턴스 생성. 환경변수를 직접 읽지 않는다(I5.2).
     - `createQueue(name, connectionOpts, queueOpts)` — BullMQ `Queue` 반환.
   - 외부 인터페이스에 `Webhook`/`http`/`Fastify` 등 도메인 식별자 등장 금지.

7. **`feat(core): define worker factory with injected handler`**
   - `packages/core/src/worker.ts`:
     - `createWorker<TData>(name, handler, connectionOpts, workerOpts)` — BullMQ `Worker` 반환. 핸들러는 외부 주입(Q-ARCH-4 (a)).
     - 핸들러는 `(job: { id: string; data: TData; attemptsMade: number }) => Promise<void>` 시그니처.
   - 본 단계에서 재시도/DLQ는 옵션으로만 노출하고 동작은 M4/M5에서 채운다.

8. **`feat(core): define error classes`**
   - `packages/core/src/errors.ts`:
     - `class RetriableError extends Error` / `class NonRetriableError extends Error`.
     - 본 단계에서는 정의만. 분류 함수는 M4의 `demo` 측에서 작성.

### 단계 3 — `demo` 패키지: 도메인 + Fastify + 워커 부트스트랩

9. **`feat(demo): define constants for queue/route names`**
   - `packages/demo/src/constants.ts`:
     - `QUEUE_NAME = 'webhook-delivery'`
     - `ROUTE_WEBHOOKS = '/webhooks'`
     - `ROUTE_DEMO_RECEIVER = '/_demo/receiver'`
     - `ROUTE_DASHBOARD = '/dashboard'`
     - `ROUTE_HEALTHZ = '/healthz'`
     - `ROUTE_QUEUE_STATS = '/api/queue/stats'`
   - 매직 스트링 금지(CLAUDE.md §4 네이밍).

10. **`feat(demo): define config schema with zod`**
    - `packages/demo/src/config.ts`:
      - Zod 스키마로 PRD `05` §8 환경변수 전체 정의. 1단계 키는 기본값 적용, 2단계 키는 스키마에 정의는 두되 미사용.
      - `WEBHOOK_HMAC_SECRET`은 `min(32)` (Q-SEC-3 (a)).
      - 부트스트랩 시 파싱 실패 → 명확한 에러 메시지로 즉시 종료. 시크릿 값은 에러에 등장하지 않는다(AC6.2 사전 준비).

11. **`feat(demo): define request/payload schemas`**
    - `packages/demo/src/domain/schemas.ts`:
      - `WebhookCreateRequestSchema` — PRD `05` §4.2 그대로. `idempotencyKey`는 본 단계 선택.
      - `WebhookJobDataSchema` — Redis에서 꺼낸 페이로드 재검증용 (PRD `05` §7).
    - 도메인 식별자는 `demo`에만 존재 — 위치상 OK.

12. **`feat(demo): receiver in-memory store`**
    - `packages/demo/src/receiver/store.ts`:
      - 최근 N건(예: 50) 보관, FIFO 트리밍.
      - 본 데모 전용. 인증 없음(Q-API-1 (a)).

13. **`feat(demo): outgoing http delivery with timeout and SSRF guard`**
    - `packages/demo/src/handlers/deliver.ts`:
      - 내장 `fetch` + `AbortController`로 `WEBHOOK_DELIVERY_TIMEOUT_MS` 타임아웃 적용(AC6.1).
      - `ALLOW_PRIVATE_TARGETS` (Q-SEC-1 (b))가 `false`면 hostname을 검사해 private IP/localhost 거부(`NonRetriableError`로 throw — 본 단계는 분류 정의만 활용, 재시도/DLQ 동작은 M4에서).
      - HMAC 적용은 본 단계에서 하지 않는다(N1.3 — M4).
      - 본 마일스톤에서는 응답 분류 함수가 없어 모든 비-2xx를 일단 `Error`로 throw. **상세 분류는 M4가 추가**.
      - 헤더 화이트리스트(Q-API-3 (a)): `Authorization`, `Cookie`, `Host` 등은 outgoing에서 제외.

14. **`feat(demo): webhook delivery handler`**
    - `packages/demo/src/handlers/webhook-delivery.ts`:
      - `core.createWorker`에 주입되는 핸들러.
      - Redis에서 꺼낸 `job.data`를 `WebhookJobDataSchema`로 재파싱(경계 검증).
      - `deliver.ts` 호출, 결과를 throw 또는 정상 반환.
      - 구조화 로그(`jobId`, `attempt`, `idempotencyKey`(있으면), `queueName`)를 컨텍스트로 출력.

15. **`feat(demo): fastify api routes`**
    - `packages/demo/src/api/webhooks.ts` — `POST /webhooks`. Zod 파싱 → 큐 add → `202` + `jobId` 응답. 본 단계에서 멱등성 처리 없음.
    - `packages/demo/src/api/receiver.ts` — `POST /_demo/receiver`. 본문 저장 후 `200`.
    - `packages/demo/src/api/dashboard.ts` — `GET /dashboard` (정적 HTML 인라인 + 폴링 스크립트), `GET /api/queue/stats` (JSON 카운터).
    - `packages/demo/src/api/healthz.ts` — Redis ping. 끊김 시 `503` (Q-SEC-5 (a)).
    - 새 프론트엔드 의존성 도입 금지 — HTML은 Fastify 핸들러 안에 문자열 리터럴로.

16. **`feat(demo): server bootstrap (api + worker in same process)`**
    - `packages/demo/src/server.ts`:
      - `config.parse()` → `createConnection` → `createQueue` → `createWorker` (핸들러 주입) → Fastify 앱 등록 → `listen`.
      - 단일 프로세스에서 API와 워커가 함께 떠도 본 PRD `01` MVP에 부합(다중 인스턴스/스케일 측정은 4단계).
      - 셧다운 핸들러는 본 단계에서 **최소한**으로만 도입(SIGINT/SIGTERM 수신 시 close 호출). 시퀀스 보장은 M7.

17. **`chore: add demo dockerfile and compose services`**
    - `packages/demo/Dockerfile` — Node 20-alpine 베이스, `tsx` 또는 build 산출물 실행 — 본 PLAN은 단순화 위해 `tsx`로 직접 실행 권장. (커밋 메시지에 정당성 명시)
    - `docker-compose.yml`에 `api` 서비스 추가(redis에 의존). `worker`는 본 PRD MVP에서는 단일 프로세스이므로 별도 분리 없음. (분리는 추후 결정.)

### 단계 3 — 테스트 통과 확인

18. **`test: ensure UT-3, UT-4, IT-S1 are green`**
    - 단계 1의 테스트가 모두 그린이 되어야 한다.
    - 회귀 점검: `IT-R1-domain-boundary` 그린 유지.

## 5. 생성/수정할 파일 목록 (절대경로)

### 새 파일
- `/Users/connor/biz/webhook-relay/packages/core/src/queue.ts` (실 구현)
- `/Users/connor/biz/webhook-relay/packages/core/src/worker.ts` (실 구현)
- `/Users/connor/biz/webhook-relay/packages/core/src/errors.ts` (RetriableError/NonRetriableError 정의)
- `/Users/connor/biz/webhook-relay/packages/demo/src/constants.ts` (큐/라우트 상수)
- `/Users/connor/biz/webhook-relay/packages/demo/src/config.ts` (환경변수 Zod)
- `/Users/connor/biz/webhook-relay/packages/demo/src/domain/schemas.ts` (요청·페이로드 Zod)
- `/Users/connor/biz/webhook-relay/packages/demo/src/receiver/store.ts`
- `/Users/connor/biz/webhook-relay/packages/demo/src/handlers/deliver.ts`
- `/Users/connor/biz/webhook-relay/packages/demo/src/handlers/webhook-delivery.ts`
- `/Users/connor/biz/webhook-relay/packages/demo/src/api/webhooks.ts`
- `/Users/connor/biz/webhook-relay/packages/demo/src/api/receiver.ts`
- `/Users/connor/biz/webhook-relay/packages/demo/src/api/dashboard.ts`
- `/Users/connor/biz/webhook-relay/packages/demo/src/api/healthz.ts`
- `/Users/connor/biz/webhook-relay/packages/demo/src/server.ts`
- `/Users/connor/biz/webhook-relay/packages/demo/Dockerfile`
- `/Users/connor/biz/webhook-relay/packages/demo/test/webhook-create-request-schema.unit.test.ts` (UT-3)
- `/Users/connor/biz/webhook-relay/packages/demo/test/config.unit.test.ts` (UT-4)
- `/Users/connor/biz/webhook-relay/packages/demo/test/it-s1-happy-path.integration.test.ts` (IT-S1)
- `/Users/connor/biz/webhook-relay/packages/demo/test/helpers/redis-container.ts` (Testcontainers 래퍼 — 모든 IT가 재사용)
- `/Users/connor/biz/webhook-relay/packages/demo/test/helpers/app-fixture.ts` (Fastify 앱 + 워커 in-process 부팅 헬퍼)

### 수정 파일
- `/Users/connor/biz/webhook-relay/package.json` (의존성 추가)
- `/Users/connor/biz/webhook-relay/docker-compose.yml` (`api` 서비스 추가)

### 본 마일스톤에서 절대 만들지 않는 것
- DLQ 큐 정의(M5)
- 멱등성 키 BullMQ `jobId` 처리(M3)
- HMAC 서명 모듈(M4)
- 에러 분류 함수의 도메인 매핑(M4)
- 백오프/`attempts` 옵션의 실제 활용(M4)
- 셧다운 전체 시퀀스(M7)

## 6. 수용 기준 / Done 정의

- **AC-M2-1** `UT-3` (요청 Zod), `UT-4` (환경변수 Zod), `IT-S1-happy-path` 모두 그린.
- **AC-M2-2** `pnpm install && docker compose up` 후 README의 `curl` 명령이 `202` + `{ "jobId": "..." }`를 반환.
- **AC-M2-3** 1초 이내 `_demo/receiver`에 페이로드 흔적 남음(`GET /_demo/receiver`가 없어도 로그/메모리로 확인 가능. **단순화를 위해 `GET /_demo/receiver/recent` 같은 조회 라우트는 본 마일스톤 범위 외**. 본 PRD `01` AC1.2의 "흔적이 남는다"는 로그로 충분).
- **AC-M2-4** `GET /dashboard`가 `waiting/active/completed/failed/delayed` 카운터 표시(`dlq`는 M5에서 추가).
- **AC-M2-5** `IT-R1-domain-boundary` 그린 유지(M1 회귀 방지).
- **AC-M2-6** 잘못된 본문에 `400` + PRD `05` §4.4 형식의 에러 응답.
- **AC-M2-7** `core` 패키지에 도메인 식별자가 등장하지 않음(grep).
- **AC-M2-8** 외부 송신에 `AbortController` 타임아웃이 적용됨(AC6.1 사전 충족).
- **AC-M2-9** 시크릿 미설정 또는 32 bytes 미만이면 부트스트랩 실패. 에러 메시지에 시크릿 값이 등장하지 않음(AC6.2 사전 충족 — 단, HMAC 사용처는 M4).

## 7. PRD 역참조

- PRD `01-mvp.md` §5 F1.1~F1.5 — 본 마일스톤이 모두 충족.
- PRD `01-mvp.md` §7 AC1.1~AC1.7 — §6 AC-M2-*가 동일 사항을 더 구체화.
- PRD `04-architecture-boundaries.md` §6.1 데이터 흐름 — 본 마일스톤이 1단계 해피패스 흐름을 구현.
- PRD `05-api-and-contracts.md` §4 — 요청/응답 계약 그대로.
- PRD `05-api-and-contracts.md` §6, §8 — 대시보드/환경변수.
- PRD `06-security-and-ops.md` §3 — 타임아웃(M2에서 도입).
- PRD `06-security-and-ops.md` §4 — 시크릿 fail-fast(M2에서 도입).

## 8. 핸들러 / 데이터 흐름 메모

```
client --POST /webhooks (JSON)--> demo/api/webhooks
   |                                    |
   |     Zod parse → core.queue.add     |
   |     (jobId 생성은 본 단계에서 무작위 — M3에서 idempotencyKey로 격상)
   v
   202 { jobId }

(같은 프로세스 / 다른 인스턴스 OK)
core.worker pickup → demo/handlers/webhook-delivery
   |
   |  WebhookJobDataSchema로 재파싱 (경계 검증)
   |  deliver(url, payload, headers) — fetch + AbortController + SSRF 가드
   |
   v
완료 시: BullMQ 상태 completed (M2 범위 종료)
실패 시: 일반 Error throw → BullMQ 기본 동작 (M2에서는 attempts=1로 설정해 즉시 failed로)
        ※ 본 마일스톤에서는 재시도/DLQ 동작을 활성화하지 않음.
```

> **주의:** BullMQ는 기본적으로 `attempts: 1`이라 재시도가 일어나지 않는다. M2에서 명시적으로 `attempts: 1`을 설정해 IT-S1이 안정되게 만든다. M4에서 환경변수로 격상.

## 9. 오픈 퀘스천 의존

다음이 잠겨야 본 마일스톤을 시작할 수 있다.

- Q-API-1 (인증 방식) — 권장 (a)
- Q-API-3 (헤더 화이트리스트) — 권장 (a)
- Q-API-4 (응답 필드) — 권장 (a)
- Q-ARCH-1 (HTTP 클라이언트) — 권장 (a)
- Q-ARCH-4 (핸들러 제네릭) — 권장 (a)
- Q-SEC-1 (SSRF 토글) — 권장 (b)
- Q-SEC-3 (시크릿 최소 길이) — 권장 (a)
- Q-SEC-5 (`/healthz` degraded) — 권장 (a)

> 8건 모두 PRD `07` §2의 Provisional과 일치. 사람이 다른 옵션으로 결정하면 본 PLAN의 §4 해당 단계를 재작성한다.

## 10. PRD 변경 제안

- **(잠재)** PRD `01-mvp.md` AC1.4는 "위 작업 직후 `completed: 1`"이라고 단언하지만, 데모는 동기 처리가 아니다. **PLAN의 IT-S1은 폴링으로 결과를 확인한다.** PRD를 손대지 않되, 본 PLAN의 §3.2가 폴링을 명시함으로써 모호함을 해소한다.
- **(잠재)** PRD `01-mvp.md` F1.3 데모 수신자가 "최근 N건" 보관을 요구하지만 조회 API는 명시되지 않았다. 본 PLAN은 **AC-M2-3에서 로그로 충분**하다고 해석한다. 조회 API가 필요하면 후속 PRD에서 추가.

## 11. 회귀 점검 (Done 직전)

- `pnpm test:unit && pnpm test:integration` 양쪽 그린.
- `IT-R1-domain-boundary` 그린.
- M1 이후 변경에 의해 `pnpm typecheck`가 깨지지 않음.
- `docker compose up`이 정상 기동(헬스 체크가 `200`).
- 30분 안에 사람이 README의 `curl` 명령을 실행하고 결과를 눈으로 확인(데모 동작 검증).

## 12. 본 마일스톤 후 데모 상태

- 데모는 **해피패스를 동작**시킨다. (장애 복구는 다음 마일스톤들.)
- 워커가 강제 종료되거나, 4xx/5xx가 오거나, 동일 키 중복 등록이 들어오는 경우의 보장은 **아직 없음**. 그것이 M3~M7의 책임이다.
