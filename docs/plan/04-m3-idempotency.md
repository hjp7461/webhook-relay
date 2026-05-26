# 04. M3 — Idempotency: IT-S2를 통과시키는 멱등성 구현

> **PLAN 진입 조건:** M2 완료 + `00-decisions-needed.md` M3 행 Q가 모두 Resolved.
>
> **AI 협업 5원칙 적용:**
> - (1) 불변식 I2.2(동일 idempotencyKey의 큐 적재/실행 횟수가 정확히 1)는 사람이 §3 테스트로 먼저 못 박는다.
> - (2) 테스트가 구현보다 먼저.
> - (3) 본 PRD §F2.1의 "BullMQ jobId 활용. 자체 키 저장소 금지"를 침범하지 않는다.
> - (4) 멱등성 재요청 응답 코드는 Q-API-2 결정에 따른다. 권장은 (a).
> - (5) 위반 코드 발견 시 보고.

## 1. 목표 한 줄

**`IT-S2-idempotency`를 그린으로 만든다.** 동일 `idempotencyKey`로 N회 등록해도 핸들러 호출은 정확히 1회, 동일 jobId 반환, 수신자에 1건만 도착.

## 2. 선행 의존

- **마일스톤:** M2.
- **결정 필요 항목:**
  - Q-API-2 — 멱등성 재요청 응답 코드 (권장 (a) `202` + 동일 jobId)

## 3. 테스트 우선 시퀀스

### 3.1 단위 테스트
1. **`UT-5` — 멱등성 키 정합성 검증 함수**
   - 파일: `packages/demo/test/idempotency-key.unit.test.ts`
   - 케이스:
     - 길이 8~128자 외 → 거부
     - 허용 문자 외 → 거부(권장: `[A-Za-z0-9_\-]`)
     - 정상 입력 → 통과
   - 분리 정책: 키 검증 함수는 `demo/domain/idempotency-key.ts`에 두되, **`Zod` 스키마와 별개의 순수 함수**로도 제공(테스트 용이성).

### 3.2 통합 테스트
2. **`IT-S2-idempotency`**
   - 파일: `packages/demo/test/it-s2-idempotency.integration.test.ts`
   - 흐름:
     1. Testcontainers Redis + 고유 큐 이름.
     2. 데모 수신자가 호출 횟수를 카운트.
     3. 동일 `idempotencyKey`로 동시 3회(`Promise.all`로 병렬) `POST /webhooks`.
     4. 각 응답의 `jobId`가 모두 동일 (Q-API-2 (a) — `202` 동일 jobId).
     5. 폴링(최대 5초): BullMQ `completed` 카운트 == 1. 수신자 호출 카운트 == 1.
   - 격리: 큐 이름 + idempotencyKey 모두 테스트별 고유.

### 3.3 추가 회귀 단언
3. `IT-S2`에서 **재시도 가능 에러가 발생해도 동일 키는 한 번만 적재되어야** 한다. 본 마일스톤에서는 분류/재시도 동작이 활성화되지 않았으므로 본 케이스는 **M4 회귀 점검에서 추가 검증**. 본 마일스톤에서는 다루지 않는다(범위 통제).

> 위 2개가 처음에 실패해야 한다(M2의 등록 API는 `jobId`를 항상 새로 만든다).

## 4. 구현 단계 (커밋 단위)

1. **`test: add UT-5 and IT-S2 (failing)`**
   - 단위/통합 테스트 작성. 실행 시 실패 확인.

2. **`feat(demo): require idempotencyKey in request schema (m3 promotion)`**
   - `WebhookCreateRequestSchema`의 `idempotencyKey`를 **필수**로 격상(2단계 정책, PRD `02` §F2.1).
   - 누락 요청에 `400` + 명확한 메시지(`AC2.2` 사전 충족).

3. **`feat(core): support deterministic jobId on add`**
   - `core/producer.ts` (M1에 빈 파일로 예약. 본 마일스톤에서 처음 채움):
     - `add<TData>(queue, name, data, options: { jobId: string })` — BullMQ의 `Queue.add(name, data, { jobId })`를 위임.
     - BullMQ는 동일 `jobId`로 add 시 기존 작업을 그대로 두고 새 추가를 무시한다(중복 방지). **이 동작에 의존**한다. 자체 키 저장소를 만들지 않는다(F2.1 준수).
     - 핸들러 시그니처 또는 옵션의 도메인 식별자 금지(I2.7).

4. **`feat(demo): idempotency key validation helper`**
   - `packages/demo/src/domain/idempotency-key.ts`:
     - 순수 함수 `assertIdempotencyKey(input: unknown): string` — UT-5 통과용.
     - 또는 Zod 리파이너로 통합 가능. PLAN 권장: 함수 + Zod에서 호출.

5. **`feat(demo): use idempotency key as bullmq jobId`**
   - `packages/demo/src/api/webhooks.ts`:
     - 요청 파싱 후 `core.producer.add(queue, 'deliver', data, { jobId: idempotencyKey })`.
     - BullMQ 동작상 중복은 자동으로 흡수된다. 응답은 **항상 `202` + `{ jobId: idempotencyKey }`** (Q-API-2 (a)).
     - 동일 키 재요청 시 BullMQ가 새 작업을 만들지 않으므로 핸들러 호출은 1회만 발생.

6. **`feat(demo): log idempotencyKey in handler context`**
   - 워커 핸들러의 구조화 로그에 `idempotencyKey` 추가(PRD `05` §9 — 2단계 필수).

7. **`test: ensure UT-5 and IT-S2 are green`**

8. **회귀 점검:** `IT-S1` + `IT-R1` 그린.

## 5. 생성/수정할 파일 목록 (절대경로)

### 새 파일
- `/Users/connor/biz/webhook-relay/packages/core/src/producer.ts` (실 구현)
- `/Users/connor/biz/webhook-relay/packages/demo/src/domain/idempotency-key.ts`
- `/Users/connor/biz/webhook-relay/packages/demo/test/idempotency-key.unit.test.ts` (UT-5)
- `/Users/connor/biz/webhook-relay/packages/demo/test/it-s2-idempotency.integration.test.ts` (IT-S2)

### 수정 파일
- `/Users/connor/biz/webhook-relay/packages/demo/src/domain/schemas.ts` — `idempotencyKey` 필수화
- `/Users/connor/biz/webhook-relay/packages/demo/src/api/webhooks.ts` — `jobId`로 `idempotencyKey` 사용
- `/Users/connor/biz/webhook-relay/packages/demo/src/handlers/webhook-delivery.ts` — 로그 컨텍스트에 `idempotencyKey` 추가

### 본 마일스톤에서 절대 만들지 않는 것
- 자체 멱등성 키 저장소 (Redis SET 사용 등) — F2.1 위반
- 재시도/DLQ 동작 변경 — M4/M5

## 6. 수용 기준 / Done 정의

- **AC-M3-1** `UT-5` 그린.
- **AC-M3-2** `IT-S2-idempotency` 그린: 동시 3회 등록 시 핸들러 호출 == 1, 수신자 수신 == 1, 응답 jobId 동일.
- **AC-M3-3** `idempotencyKey` 누락 요청에 `400` (`AC2.2`).
- **AC-M3-4** `core/producer.ts`에 도메인 식별자 0개(grep).
- **AC-M3-5** `IT-S1`, `IT-R1` 회귀 없음.

## 7. PRD 역참조

- PRD `02-resilience.md` §F2.1 — 멱등성 정책.
- PRD `02-resilience.md` §I2.2 — 불변식.
- PRD `02-resilience.md` §AC2.2 — `idempotencyKey` 누락 응답.
- PRD `03-test-strategy.md` §3 `IT-S2-idempotency`.
- PRD `05-api-and-contracts.md` §4.3 — idempotency 재요청 응답 코드.
- PRD `05-api-and-contracts.md` §9 — `idempotencyKey` 로깅 필수화.

## 8. 오픈 퀘스천 의존

- Q-API-2 — 권장 (a) `202` + 동일 jobId. 본 PLAN은 이를 가정. (b)로 결정되면 `IT-S2`의 단언과 `webhooks.ts`의 응답 분기를 변경.

## 9. PRD 변경 제안

- (없음) — PRD가 멱등성 동작과 응답 코드 후보 모두를 명확히 정의함.

## 10. 회귀 점검 (Done 직전)

- `IT-S1` + `IT-S2` + `IT-R1` 모두 그린.
- 모든 단위 테스트 그린(UT-3/4/5).
- README `curl` 명령에 `idempotencyKey` 필드를 추가해 다시 시도. 동일 키로 두 번 시도해도 수신자에 한 번만 도착하는지 사람이 눈으로 확인.

## 11. 본 마일스톤 후 데모 상태

- 데모는 해피패스 + 멱등성 보장 동작.
- 4xx/5xx 처리, 재시도, DLQ, stalled 회수, 그레이스풀 셧다운은 여전히 미구현(다음 마일스톤들).
