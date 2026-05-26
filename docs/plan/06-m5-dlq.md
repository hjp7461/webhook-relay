# 06. M5 — DLQ: IT-S4 통과 + IT-S5 강화

> **PLAN 진입 조건:** M4 완료 + `00-decisions-needed.md` M5 행 Q가 모두 Resolved.
>
> **AI 협업 5원칙 적용:**
> - (1) 불변식 I2.4(DLQ 단방향), I2.1, I2.5의 일부를 사람이 §3 테스트로 먼저 못 박는다.
> - (2) 테스트 먼저.
> - (3) DLQ 자동 재투입은 본 PRD 비목표(N2.1). 본 마일스톤에서 인터페이스 스텁도 두지 않는다(Q-DLQ-1 (a)).
> - (4) 모호 사항은 §9.
> - (5) 위반 코드 발견 시 보고.

## 1. 목표 한 줄

**`IT-S4-max-attempts-dlq`를 그린으로 만들고, `IT-S5`를 DLQ 단언으로 강화한다.** 재시도 가능 에러가 `WEBHOOK_MAX_ATTEMPTS`를 초과하면 별도의 DLQ 큐로 이동하고, 4xx 즉시 격리도 동일하게 DLQ에 들어간다. 페이로드와 마지막 에러 컨텍스트(분류, HTTP 상태, 시도 횟수)가 DLQ에 보존된다.

## 2. 선행 의존

- **마일스톤:** M4.
- **결정 필요 항목:**
  - Q-DLQ-1 — 재투입 인터페이스 스텁 (권장 (a) 두지 않음)

## 3. 테스트 우선 시퀀스

### 3.1 통합 테스트
1. **`IT-S4-max-attempts-dlq`**
   - 파일: `packages/demo/test/it-s4-max-attempts-dlq.integration.test.ts`
   - 흐름:
     1. 수신자가 항상 `503` 반환.
     2. `WEBHOOK_MAX_ATTEMPTS=3`, `WEBHOOK_BACKOFF_BASE_MS=100`(테스트 단축).
     3. 작업 등록.
     4. 폴링(최대 5초): 원 큐(`QUEUE_NAME`)에 작업 없음, **DLQ 큐(`DLQ_NAME`)에 1건 존재**.
     5. DLQ에서 꺼낸 작업의 데이터에 다음이 보존됨:
        - 원본 페이로드(`url`, `payload`, `headers`, `idempotencyKey`)
        - 마지막 에러 컨텍스트: `errorClass = 'RetriableError'`, `httpStatus = 503`, `attemptsMade = 3`
   - 격리: 원 큐 + DLQ 큐 모두 테스트별 고유 이름.

2. **`IT-S5-non-retriable-immediate-dlq` (강화)**
   - M4 버전의 단언에 다음을 **추가**한다:
     - 원 큐에 작업 없음.
     - DLQ 큐에 1건 존재.
     - 마지막 에러 컨텍스트: `errorClass = 'NonRetriableError'`, `httpStatus = 400`, `attemptsMade = 1`.

### 3.2 회귀 단언
- `IT-S1`, `IT-S2`, `IT-S3`, `IT-R1`, 모든 UT 그린 유지.

## 4. 구현 단계 (커밋 단위)

### 단계 1 — 실패 테스트 작성

1. **`test: extend IT-S5 with DLQ assertions (failing)`** — 강화된 단언으로 변경(이 시점에 실패).
2. **`test: add IT-S4 max attempts dlq (failing)`**.

### 단계 2 — `core` 패키지: DLQ 추상

3. **`feat(core): define dlq queue and move helper`**
   - `packages/core/src/retry.ts` 또는 새 `core/src/dlq.ts`(PLAN 권장: `dlq.ts` 분리):
     - `createDlqQueue(name, connectionOpts): Queue` — BullMQ Queue (별도 큐 — F2.4).
     - `buildDlqEntry<TData>(input: { data: TData; lastError: { class: 'Retriable' | 'NonRetriable'; httpStatus?: number; attemptsMade: number; message?: string } }): DlqJobData<TData>` — 페이로드 + 에러 컨텍스트를 보존하는 데이터 빌더.
     - 도메인 식별자 금지. `webhook`/`http` 미등장(grep 통과 — AC2.4).

4. **`feat(core): worker on-failed hook moves to dlq`**
   - `packages/core/src/worker.ts`:
     - BullMQ Worker의 `failed` 이벤트 또는 핸들러 wrapping을 통해, 다음 조건일 때 DLQ로 이동:
       - 에러가 `NonRetriableError`이거나
       - `attemptsMade >= attempts` (최대 재시도 초과)
     - 이동은 별도 Queue.add 호출로(원본 작업을 옮기는 게 아니라 새 항목을 DLQ에 적재).
     - 원본 작업의 BullMQ 상태는 `failed`로 유지(BullMQ는 작업을 자동으로 삭제하지 않으나, 본 마일스톤에서 `removeOnFail`를 `true`로 설정해 원 큐의 카운트와 깔끔하게 맞추는 것이 권장 — PLAN 결정: `removeOnFail: { count: 0 }`로 즉시 제거. 단언 "원 큐에 없음"을 안정화).
     - DLQ로의 이동 함수는 핸들러 시그니처에 도메인 식별자를 노출하지 않는다.

### 단계 3 — `demo` 패키지: DLQ 이름·환경변수 연결

5. **`feat(demo): wire dlq name constant and env`**
   - `packages/demo/src/constants.ts`에 `DLQ_NAME = 'webhook-delivery-dlq'` 추가. `QUEUE_NAME`과 어긋남 방지 검증(부트스트랩에서 `constants` vs `config` 일치 확인 — AC5.5).
   - `demo/src/config.ts`에서 `DLQ_NAME` 환경변수 파싱.
   - `demo/src/server.ts`에서 `core.createDlqQueue(...)` 호출 + Worker에 DLQ Queue 핸들 주입.

6. **`feat(demo): dashboard counts dlq`**
   - `GET /api/queue/stats` 응답에 `dlq` 카운터 추가(PRD `05` §6).
   - `GET /dashboard` HTML에도 표시.

### 단계 4 — 테스트 통과 + 회귀

7. **`test: ensure IT-S4 and IT-S5 (strengthened) are green`**
8. **회귀 점검:** `IT-S1`, `IT-S2`, `IT-S3`, `IT-R1`, 모든 UT 그린.

## 5. 생성/수정할 파일 목록 (절대경로)

### 새 파일
- `/Users/connor/biz/webhook-relay/packages/core/src/dlq.ts` (DLQ 큐 팩토리 + 엔트리 빌더)
- `/Users/connor/biz/webhook-relay/packages/demo/test/it-s4-max-attempts-dlq.integration.test.ts` (IT-S4)

### 수정 파일
- `/Users/connor/biz/webhook-relay/packages/core/src/worker.ts` — failed hook으로 DLQ 이동
- `/Users/connor/biz/webhook-relay/packages/demo/src/constants.ts` — `DLQ_NAME` 추가
- `/Users/connor/biz/webhook-relay/packages/demo/src/config.ts` — DLQ 환경변수
- `/Users/connor/biz/webhook-relay/packages/demo/src/server.ts` — DLQ Queue 생성 + Worker에 주입
- `/Users/connor/biz/webhook-relay/packages/demo/src/api/dashboard.ts` — `dlq` 카운터 표시
- `/Users/connor/biz/webhook-relay/packages/demo/test/it-s5-non-retriable-immediate-dlq.integration.test.ts` — DLQ 단언 추가
- `/Users/connor/biz/webhook-relay/packages/demo/test/helpers/app-fixture.ts` — DLQ Queue 핸들 노출

### 본 마일스톤에서 절대 만들지 않는 것
- DLQ 자동 재투입(N2.1)
- 재투입 스텁 함수(Q-DLQ-1 (a))
- Poison message 패턴 분석(N2.2)
- Stalled-job 회수(M6)
- 셧다운 시퀀스(M7)

## 6. 수용 기준 / Done 정의

- **AC-M5-1** `IT-S4` 그린: max attempts 초과 → DLQ 큐에 1건 존재, 원 큐에 없음. 페이로드 + 에러 컨텍스트 보존.
- **AC-M5-2** `IT-S5` 강화 그린: 4xx → DLQ 큐에 1건. 페이로드 + 에러 컨텍스트 보존.
- **AC-M5-3** `GET /api/queue/stats` 응답에 `dlq` 카운터 정확.
- **AC-M5-4** `core/dlq.ts`, `core/worker.ts`에 도메인 식별자 0개(grep — AC2.4, AC4.1).
- **AC-M5-5** `IT-S1`, `IT-S2`, `IT-S3`, `IT-R1` 회귀 없음.
- **AC-M5-6** AC2.3 (DLQ 작업은 원 큐 조회 불가, DLQ 큐 조회 가능) 충족.

## 7. PRD 역참조

- PRD `02-resilience.md` §F2.4 — DLQ 정의.
- PRD `02-resilience.md` §I2.4 — DLQ 단방향 불변식.
- PRD `02-resilience.md` §AC2.3 — DLQ 조회.
- PRD `03-test-strategy.md` §3 IT-S4, IT-S5.
- PRD `04-architecture-boundaries.md` §7 — DLQ는 `core` 책임(이름은 `demo` 상수).
- PRD `05-api-and-contracts.md` §6 — `dlq` 카운터.

## 8. 오픈 퀘스천 의존

- Q-DLQ-1 — 권장 (a). (b)로 결정되면 `core/dlq.ts`에 `requeue()` 스텁 함수 추가(미구현 throw).

## 9. PRD 변경 제안

- (없음) — PRD가 DLQ 보존 컨텍스트와 단방향 정책을 충분히 정의함.

## 10. 회귀 점검 (Done 직전)

- 모든 단위 테스트 그린.
- `IT-S1`, `IT-S2`, `IT-S3`, `IT-S4`, `IT-S5`(강화), `IT-R1` 그린.
- 사람이 5xx 무한 스텁으로 1회 수동 검증: DLQ에 적재 확인.

## 11. 본 마일스톤 후 데모 상태

- 데모는 해피패스 + 멱등성 + 재시도 + DLQ 격리 동작.
- Stalled 회수와 그레이스풀 셧다운은 다음 두 마일스톤.
