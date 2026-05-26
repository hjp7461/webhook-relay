# 05. M4 — Retry & Classification (+ HMAC): IT-S3, IT-S5 통과

> **PLAN 진입 조건:** M3 완료 + `00-decisions-needed.md` M4 행 Q가 모두 Resolved.
>
> **AI 협업 5원칙 적용:**
> - (1) 불변식 I2.3(분류 결정성), I2.1(at-least-once), I6.2(타임아웃 강제)를 사람이 §3 테스트로 먼저 못 박는다.
> - (2) 테스트가 먼저.
> - (3) DLQ 이동은 본 마일스톤에서 **재시도 불가 분류 시점**에는 들어가지만, **재시도 초과 시 DLQ 이동은 M5**로 미룬다 — IT-S5는 본 마일스톤, IT-S4는 다음 마일스톤.
> - (4) 분류 모호 케이스(3xx, 408/425/429)는 §9 Q-RETRY-1/2 결정에 종속.
> - (5) 위반 코드 발견 시 보고.

## 1. 목표 한 줄

**`IT-S3-retriable-backoff`와 `IT-S5-non-retriable-immediate-dlq`를 그린으로 만든다.** 워커가 HTTP 응답에 따라 재시도 가능/불가를 명시적으로 분류하고, 가능 에러는 지수 백오프로 N회 재시도한다. 불가 에러(4xx)는 즉시 격리한다. HMAC 서명도 본 마일스톤에서 활성화한다.

> **주의:** "즉시 DLQ"의 **이동 메커니즘 자체**는 M5에서 완성한다. 본 마일스톤에서는 **분류 결과로 즉시 throw 후 BullMQ의 `discard()`/0 attempts 처리로 격리**까지 다루고, DLQ 큐로의 **물리적 이동**은 M5의 책임이다.
>
> 본 PLAN의 절충: **IT-S5의 "DLQ에 있는지" 단언은 M5에서 완성**한다. 본 마일스톤에서는 `IT-S5`의 검증 포인트를 다음과 같이 좁힌다:
> - 4xx 응답에서 `attemptsMade == 1`로 종료(BullMQ 상태 `failed`).
> - 같은 시간 동안 추가 재시도 호출이 없음(스텁이 호출 카운트 == 1).
>
> M5에서 IT-S5는 추가로 "DLQ 큐에 항목 존재" 단언을 받아들여 강화된다. 본 PLAN은 이 사실을 **명시적으로** 기록한다 — IT-S5는 M4에서 통과하지만, M5에서 더 강화된 형태로 다시 통과해야 한다(회귀 점검).

## 2. 선행 의존

- **마일스톤:** M3.
- **결정 필요 항목:**
  - Q-RETRY-1 — 3xx 분류 (권장 (a) `NonRetriableError`)
  - Q-RETRY-2 — 408/425/429 (권장 (a) 모두 `RetriableError`)
  - Q-RETRY-3 — jitter (권장 (a) 없음)
  - Q-SEC-2 — HMAC timestamp/nonce (권장 (a) 미적용)

## 3. 테스트 우선 시퀀스

### 3.1 단위 테스트
1. **`UT-1` — 백오프 지연 계산 함수**
   - 파일: `packages/core/test/backoff.unit.test.ts`
   - `delayForAttempt(attempt, baseMs)` — 지수 공식 `baseMs * 2^(attempt-1)` (jitter 없음, Q-RETRY-3 (a)).
   - 케이스: attempt=1 → base, attempt=2 → base*2, ... 경계값(attempt=0 거부 or 1로 정규화 — PLAN 결정: 거부).
   - 본 함수는 BullMQ가 내부적으로 같은 공식을 쓰지만, **`UT-1`은 "테스트 가능한 명시적 함수"가 존재함을 검증**한다(`IT-S3`의 단언과 일치 여부 검증 기반).

2. **`UT-2` — 에러 분류 함수**
   - 파일: `packages/demo/test/classify-error.unit.test.ts`
   - `classifyDeliveryFailure(input: { httpStatus?: number; cause?: unknown }): RetriableError | NonRetriableError`.
   - 케이스 (Q-RETRY-1/2 권장 가정):
     - 4xx (4xx 일반) → `NonRetriableError`
     - 5xx → `RetriableError`
     - 408/425/429 → `RetriableError` (Q-RETRY-2 (a))
     - 3xx → `NonRetriableError` (Q-RETRY-1 (a))
     - `AbortError`(타임아웃) → `RetriableError`
     - DNS/ECONNREFUSED → `RetriableError`
     - 알 수 없는 cause → `RetriableError`(보수적). 단, 결정성을 위해 명시적 사례만 retriable로 분류하고 나머지 unknown은 `RetriableError`로 통합. 본 PLAN 권장은 명세상의 단순성.

3. **`UT-6` — HMAC 서명 결정성**
   - 파일: `packages/demo/test/hmac.unit.test.ts`
   - `signHmacSha256(secret, body): string` — 같은 입력 → 같은 출력. 형식 `sha256=<hex>`. 시크릿이 비어 있으면 throw.

### 3.2 통합 테스트
4. **`IT-S3-retriable-backoff`**
   - 파일: `packages/demo/test/it-s3-retriable-backoff.integration.test.ts`
   - 흐름:
     1. Testcontainers Redis + 고유 큐.
     2. 데모 수신자는 처음 K번(예: K=3)은 `503`, K+1번째에 `200`을 반환하는 스텁.
     3. `WEBHOOK_MAX_ATTEMPTS=5`, `WEBHOOK_BACKOFF_BASE_MS=200`으로 부팅(테스트 전용 짧은 값).
     4. 작업 1건 등록.
     5. Vitest fake timer로 백오프 시각을 점프. (주의: BullMQ는 내부적으로 setTimeout/setImmediate에 의존하므로 fake timer가 모든 지연을 흡수하는지 확인 필요. 흡수가 어려우면 짧은 base + 짧은 polling으로 대체.)
     6. 단언:
        - 최종 BullMQ 상태 `completed`.
        - `attemptsMade == K+1`.
        - 각 시도 사이 지연이 단계적으로 증가(허용 오차 ±20% — wall-clock 의존).
   - 결정성 가드: 가능한 모든 지연을 `delayForAttempt`로 계산해 단언. 측정은 BullMQ `events`(`failed`, `completed`) 타임스탬프로.

5. **`IT-S5-non-retriable-immediate-dlq` (M4 버전)**
   - 파일: `packages/demo/test/it-s5-non-retriable-immediate-dlq.integration.test.ts`
   - 흐름:
     1. 수신자가 첫 시도에서 `400`.
     2. 작업 1건 등록.
     3. 폴링: BullMQ 상태가 `failed`, `attemptsMade == 1`. 수신자 호출 카운트 == 1.
   - **본 마일스톤에서는 DLQ 큐 단언 없음**(M5에서 추가). `IT-S5`의 `describe` 이름은 그대로 유지하되, 단언이 M5에서 강화됨을 PLAN에 명시.

### 3.3 회귀 단언
- `IT-S1`, `IT-S2`, `IT-R1` 그린 유지.

## 4. 구현 단계 (커밋 단위)

### 단계 1 — 실패 테스트 작성

1. **`test: add UT-1, UT-2, UT-6, IT-S3, IT-S5 (failing)`**
   - 모두 처음에는 실패.

### 단계 2 — `core` 패키지: 분류 추상 + 백오프 표현

2. **`feat(core): retriable/non-retriable error contracts`**
   - `core/src/errors.ts`에 정의된 두 클래스에 **메타 컨텍스트**(예: `httpStatus?`, `cause?`)를 받을 수 있는 옵션 필드를 추가. 도메인 식별자 금지.

3. **`feat(core): expose retry policy options`**
   - `core/src/retry.ts`:
     - `RetryPolicy = { maxAttempts: number; backoffBaseMs: number }` 타입만 정의.
     - `delayForAttempt(attempt, baseMs): number` — `UT-1` 대상 함수.
     - BullMQ Worker에 주입할 옵션을 빌드하는 헬퍼(`buildWorkerRetryOptions(policy): WorkerOptions['..']`).
   - 도메인 식별자 금지.

4. **`feat(core): worker rethrows classify-aware errors`**
   - `core/src/worker.ts`:
     - 핸들러가 `NonRetriableError`를 throw하면 BullMQ에 `discard()` 또는 옵션으로 즉시 격리(BullMQ는 `attempts`를 초과한 것처럼 다루도록 처리). 정확한 API는 BullMQ 버전에 따라: `UnrecoverableError`(BullMQ 제공)를 thin-wrap.
     - `core`가 `bullmq` 외 도메인 식별자를 노출하지 않는지 검수.

### 단계 3 — `demo` 패키지: 분류 + HMAC + 송신 강화

5. **`feat(demo): classify-error mapping function`**
   - `packages/demo/src/handlers/classify-error.ts`:
     - `UT-2` 통과 함수. Q-RETRY-1/2 결정에 종속.
     - `core.RetriableError` / `core.NonRetriableError`를 반환.

6. **`feat(demo): hmac signing module`**
   - `packages/demo/src/domain/hmac.ts`:
     - `signHmacSha256(secret: string, body: Buffer | string): string` — Node 내장 `crypto.createHmac` 사용.
     - 시크릿 누락/짧음 거부.
     - 결과 형식: `sha256=<hex>`.
     - 큐 페이로드에 서명을 저장하지 않는다(PRD `05` §7). 워커가 송신 직전에 생성.

7. **`feat(demo): worker delivery wires classify + hmac + timeout`**
   - `packages/demo/src/handlers/deliver.ts` 강화:
     - HTTP 응답 → `classifyDeliveryFailure(...)` → 적절한 에러 throw.
     - 송신 직전에 HMAC 헤더 부착(헤더 이름 `WEBHOOK_HMAC_HEADER`).
     - 헤더 화이트리스트(Q-API-3 (a)) 유지.
   - `packages/demo/src/handlers/webhook-delivery.ts` 강화:
     - 분류 결과 로깅(`errorClass`, `httpStatus`, `attempt`) — PRD `05` §9 2단계 필드.

### 단계 4 — 환경변수 활성화

8. **`feat(demo): wire WEBHOOK_MAX_ATTEMPTS / BACKOFF_BASE_MS into worker options`**
   - `demo/src/config.ts`에서 두 값 파싱(이미 스키마에 정의됨).
   - `demo/src/server.ts`에서 `core.createWorker(...)`에 옵션 전달:
     - `attempts: WEBHOOK_MAX_ATTEMPTS`
     - `backoff: { type: 'exponential', delay: WEBHOOK_BACKOFF_BASE_MS }`
   - BullMQ의 표준 옵션 사용. 자체 구현 금지(F2.3).

### 단계 5 — 테스트 통과 + 회귀

9. **`test: UT-1/2/6 green, IT-S3 green, IT-S5 (m4-scope) green`**
10. **회귀 점검:** `IT-S1`, `IT-S2`, `IT-R1` 그린.

## 5. 생성/수정할 파일 목록 (절대경로)

### 새 파일
- `/Users/connor/biz/webhook-relay/packages/core/src/retry.ts` (실 구현 — RetryPolicy, delayForAttempt, buildWorkerRetryOptions)
- `/Users/connor/biz/webhook-relay/packages/core/test/backoff.unit.test.ts` (UT-1)
- `/Users/connor/biz/webhook-relay/packages/demo/src/handlers/classify-error.ts`
- `/Users/connor/biz/webhook-relay/packages/demo/src/domain/hmac.ts`
- `/Users/connor/biz/webhook-relay/packages/demo/test/classify-error.unit.test.ts` (UT-2)
- `/Users/connor/biz/webhook-relay/packages/demo/test/hmac.unit.test.ts` (UT-6)
- `/Users/connor/biz/webhook-relay/packages/demo/test/it-s3-retriable-backoff.integration.test.ts` (IT-S3)
- `/Users/connor/biz/webhook-relay/packages/demo/test/it-s5-non-retriable-immediate-dlq.integration.test.ts` (IT-S5)

### 수정 파일
- `/Users/connor/biz/webhook-relay/packages/core/src/errors.ts` — 메타 컨텍스트 옵션 추가
- `/Users/connor/biz/webhook-relay/packages/core/src/worker.ts` — NonRetriableError → UnrecoverableError 변환
- `/Users/connor/biz/webhook-relay/packages/demo/src/handlers/deliver.ts` — 분류 함수 호출 + HMAC 헤더
- `/Users/connor/biz/webhook-relay/packages/demo/src/handlers/webhook-delivery.ts` — 로그 컨텍스트
- `/Users/connor/biz/webhook-relay/packages/demo/src/server.ts` — Worker 옵션에 attempts/backoff 주입

### 본 마일스톤에서 절대 만들지 않는 것
- DLQ 큐 정의(M5)
- DLQ로의 물리적 이동 로직(M5)
- Stalled-job 회수(M6)
- 셧다운 시퀀스(M7)

## 6. 수용 기준 / Done 정의

- **AC-M4-1** `UT-1`, `UT-2`, `UT-6` 단위 테스트 그린.
- **AC-M4-2** `IT-S3` 그린: 5xx → 백오프 후 재시도 → 최종 `completed`. 백오프 지연이 `delayForAttempt`와 일치(허용 오차 포함).
- **AC-M4-3** `IT-S5` 그린(M4 버전): 4xx → `attemptsMade == 1`로 `failed`. 추가 호출 없음.
- **AC-M4-4** HMAC 서명이 outgoing 헤더로 부착됨(테스트의 수신자에서 검증 — 단순 형식 단언 권장).
- **AC-M4-5** 외부 송신에 `AbortController` 타임아웃이 적용됨(AC6.1 충족).
- **AC-M4-6** `core/retry.ts`에 도메인 식별자 0개(grep, AC2.4).
- **AC-M4-7** `IT-S1`, `IT-S2`, `IT-R1` 회귀 없음.

## 7. PRD 역참조

- PRD `02-resilience.md` §F2.2 — 에러 분류.
- PRD `02-resilience.md` §F2.3 — 지수 백오프.
- PRD `02-resilience.md` §I2.1, I2.3 — 불변식.
- PRD `02-resilience.md` §AC2.5 — 분류 함수 단위 테스트.
- PRD `03-test-strategy.md` §3 IT-S3, IT-S5.
- PRD `03-test-strategy.md` §5 UT-1, UT-2, UT-6.
- PRD `06-security-and-ops.md` §2 — HMAC.
- PRD `06-security-and-ops.md` §3 — 타임아웃.
- PRD `06-security-and-ops.md` §AC6.5 — HMAC 결정성 단위 테스트.

## 8. 백오프 + fake timer 상호작용 메모

- BullMQ는 백오프 지연에 Redis의 `delayed` 큐와 `setTimeout`을 함께 쓴다.
- Vitest fake timer가 BullMQ 내부 setTimeout을 가로채는지 검증 필요. 만약 가로채지 못하면:
  - **대안 A:** 매우 짧은 `WEBHOOK_BACKOFF_BASE_MS`(예: 100ms)로 wall-clock 진행.
  - **대안 B:** 테스트 전용 `useRealTimers()` + 임계값 단언만 수행.
- 본 PLAN의 권장: **대안 A로 시작**, fake timer를 시도하되 부작용이 크면 짧은 base + polling으로 안정화. `11-risks-and-rollback.md`에서도 동일 리스크 명시.

## 9. 오픈 퀘스천 의존

- Q-RETRY-1 — 권장 (a).
- Q-RETRY-2 — 권장 (a).
- Q-RETRY-3 — 권장 (a). (b)로 결정되면 `delayForAttempt`에 jitter 추가, IT-S3 단언 약화.
- Q-SEC-2 — 권장 (a). (b)로 결정되면 `hmac.ts`의 입력 시그니처에 `timestamp`/`nonce`가 추가되고 결정성 단위 테스트가 재시도 동일성으로 약화됨.

## 10. PRD 변경 제안

- **(잠재)** PRD `03` §3의 `IT-S3` 검증 포인트는 "각 시도 간 지연이 지수 백오프 공식과 일치(허용 오차 포함)"인데, **허용 오차의 수치 범위가 명시되어 있지 않다**. 본 PLAN은 ±20%로 가정. 사람이 더 엄격한 값을 원하면 PRD에 반영.

## 11. 회귀 점검 (Done 직전)

- `pnpm test:unit && pnpm test:integration` 그린.
- `IT-S1`, `IT-S2`, `IT-S3`(신규), `IT-S5`(M4 버전), `IT-R1` 그린.
- 사람이 5xx 스텁/4xx 스텁으로 1회 수동 검증.

## 12. 본 마일스톤 후 데모 상태

- 데모는 해피패스 + 멱등성 + 재시도/즉시 격리(분류 기반) 동작.
- DLQ 큐로의 물리적 이동, stalled 회수, 셧다운은 다음 마일스톤들.
