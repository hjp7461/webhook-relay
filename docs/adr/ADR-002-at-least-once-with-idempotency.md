# ADR-002 — at-least-once + 멱등성 키 강제

- **Status:** Accepted
- **Date:** 2026-05-26
- **Deciders:** PM, Tech Lead, 사람 검토(저장소 소유자)
- **Scope:** 1~2단계 메인 트랙 전체

---

## 컨텍스트

작업 큐의 전달 보장(delivery guarantee)은 분산 시스템에서 가장 자주 오해되는 항목이다.

웹훅 전송 시나리오의 가장 위험한 케이스:
> 워커가 외부 수신자에게 HTTP 요청을 **이미 전송**했지만, 응답을 받기 전에 (또는 받은 직후 ACK 직전에) **프로세스가 강제 종료**된다.

이 경우 큐는 작업을 완료로 표시하지 못했으므로 **재시도**한다. 그러나 수신자 입장에서는 **이미 한 번 받은 요청을 또 받게 된다**(중복 전송).

선택지는 세 가지였다.

1. **at-most-once** — 큐가 작업을 빼고 즉시 완료 처리. 워커가 죽으면 작업 유실. **수용 불가**(PRD `02` §I2.1: 작업 유실 금지).
2. **at-least-once + application-level idempotency** — 워커는 ACK 이전에 죽을 수 있고 그 경우 다른 워커가 재시도한다. 중복은 멱등성으로 흡수.
3. **exactly-once 시도** — Two-Phase Commit 또는 distributed transaction. 분산 시스템에서 비용이 크며, 외부 HTTP 수신자가 트랜잭션에 참여하지 않으므로 본질적으로 달성 불가.

---

## 결정

**at-least-once + `idempotencyKey` 필수화 + BullMQ `jobId` 시맨틱에 의존.**

구체적으로:

1. **`POST /webhooks`의 요청 본문에 `idempotencyKey: string` (8~128자, `[A-Za-z0-9_\-]`) 필수.** 누락 시 `400`.
2. **`idempotencyKey`를 BullMQ `Queue.add(name, data, { jobId })`의 `jobId`로 그대로 사용.**
3. **BullMQ는 동일 `jobId`로 add를 받으면 기존 작업이 있는 경우 새 작업을 만들지 않는다.** 이 표준 동작에 의존한다.
4. **자체 멱등성 키 저장소(Redis SET 등)를 만들지 않는다** (PRD `02` §F2.1).
5. **응답은 항상 `202 Accepted` + `{ "jobId": <idempotencyKey> }`** (Q-API-2 (a)). 중복 등록도 동일 응답 — 클라이언트는 결과를 구분할 수 없으며, 이것이 idempotent re-submit의 정의.
6. **워커 측 보장:** 핸들러는 같은 `jobId`로 정확히 1회 호출된다(IT-S2가 동시 3회 등록 시 핸들러 호출 == 1, 수신자 도착 == 1로 검증).

---

## 근거

### 왜 exactly-once를 시도하지 않는가

- 외부 HTTP 수신자는 우리 트랜잭션에 참여할 수 없다. 수신자가 200을 반환하기 직전에 네트워크가 끊기면, 우리는 "수신자가 받았는지" 알 수 없다.
- 분산 시스템 이론(Two Generals' Problem)이 말하는 바: 신뢰성 있는 통신로가 없다면 양측의 상태가 영원히 일치하지 않는다.
- 따라서 **"우리 측에서 exactly-once를 약속"하는 것은 환상이며, 의미 있는 보장은 "수신자가 멱등성을 흡수할 수 있도록 키를 강제로 같이 보내준다"이다.**

### 왜 자체 키 저장소를 만들지 않는가

- "BullMQ jobId만으로 충분한가, 별도 Redis SET이 더 안전한가"는 흔한 함정이다.
- 별도 키 저장소를 두면:
  - **두 저장소의 일관성 보장이 새 문제로 추가됨** (jobId가 적재됐는데 키 SET이 누락된 케이스 등)
  - 키 만료 정책, GC, 충돌 처리, 조회 비용이 추가됨
  - BullMQ의 jobId 시맨틱과 이중 동작
- BullMQ가 이미 동일 jobId 중복 흡수를 제공한다. **검증된 메커니즘 위에 추상화를 쌓지 말고, 그대로 쓴다.**
- 본 결정은 CLAUDE.md §7-3("범위 통제: 있으면 좋을 것 같은 코드 금지")과 정합.

### 왜 `idempotencyKey`를 클라이언트가 보내게 하는가

- 서버가 생성해 응답으로 돌려주는 방식은 **클라이언트가 키를 보존하지 않는 한 무용하다**. 클라이언트가 재시도하면 새 키를 받아 또 등록한다.
- 따라서 **멱등성 책임은 작업 정의자(클라이언트)에게 있다.**
- 본 PRD는 클라이언트가 다음 중 하나를 따르도록 안내:
  - 비즈니스 이벤트 ID(예: `order:abc-123:created`)를 그대로 사용
  - UUIDv4를 한 번 생성해 retry 시 동일 값 재사용

### Provisional `(a)` → 결정 `(b)`의 불일치 (Q-API-1)

- PRD 작성 시점에는 인증을 "데모/로컬 전용 미적용"으로 가정했다.
- 사람 검토에서 "운영 노출 전제로도 PRD를 갱신하자"는 결정으로 Q-API-1을 **Bearer 공유 시크릿(`API_BEARER_TOKEN`)** 으로 잠갔다.
- 본 ADR-002의 멱등성 결정은 인증 방식과 직교한다. Bearer 도입은 인증 계층만 추가하며, 멱등성 동작은 변하지 않는다.

---

## 트레이드오프 / 한계

1. **멱등성 키 관리 책임이 클라이언트에게 있다.**
   - 잘못된 클라이언트가 매번 새 키를 생성하면 중복 전송을 막을 수 없다.
   - 완화: README/문서에서 키 생성 패턴 안내(비즈니스 이벤트 ID 권장).
   - 완화: 수신자 측에서도 자체 멱등성 흡수를 권장(이중 안전망).

2. **키 보존 기간이 정의되지 않음.**
   - BullMQ는 같은 `jobId`의 완료된 작업이 Redis에 남아 있는 동안에만 중복 흡수가 동작한다.
   - `removeOnComplete` 정책(M5+ removeOnFail, 본 PR에서 removeOnComplete도 추가)이 작업을 제거하면 그 이후 동일 키로 등록 시 새 작업이 생성된다.
   - 본 PRD 범위에서는 "보존 기간 = `removeOnComplete` 정책에 따름"으로 정의. 후속 PRD에서 명시적 키 보존 정책이 필요할 수 있음.

3. **동시 등록 race condition의 BullMQ 의존성.**
   - 동일 `jobId`로 거의 동시에 add 시, BullMQ가 이를 원자적으로 처리한다는 가정에 의존.
   - IT-S2가 `Promise.all`로 3회 병렬 등록을 검증. BullMQ가 깨지면 즉시 알 수 있음.

4. **`WebhookJobDataSchema.idempotencyKey`가 여전히 `optional()`.**
   - 요청 스키마(`WebhookCreateRequestSchema`)는 필수로 격상됐지만, 큐 페이로드 재파싱 스키마는 호환성 위해 optional 유지.
   - M3 이후 항상 채워지므로 후속 정리 가능(범위 외).

5. **at-least-once의 "정확히 1회처럼 보이는" 동작은 수신자의 멱등성 흡수에 의존.**
   - 우리 측에서는 1회 호출만 보장(IT-S2). 수신자 측 멱등성은 통제 불가.

---

## 향후 작업

- `WebhookJobDataSchema.idempotencyKey`를 필수로 격상(M3 보강).
- 멱등성 키 보존 기간 정책의 명시적 문서화(PRD `02` 또는 후속 PRD).
- 수신자 측 멱등성 흡수 패턴 가이드(예: HTTP 헤더 `Idempotency-Key` 표준화 — RFC 9110 영향).

---

## 관련 문서

- **CLAUDE.md §7-3** — 범위 통제 원칙(자체 키 저장소 금지의 근거)
- **PRD `02-resilience.md` §F2.1** — 멱등성 정책
- **PRD `02-resilience.md` §I2.2** — 동일 키 1회 실행 불변식
- **PRD `02-resilience.md` §AC2.2** — `idempotencyKey` 누락 응답 정의
- **PRD `05-api-and-contracts.md` §4.3** — idempotency 재요청 응답 코드
- **PLAN `00-decisions-needed.md` Q-API-2** — `202` + 동일 jobId 결정
- **PLAN `00-decisions-needed.md` Q-DLQ-1** — 자체 키 저장소 금지와 같은 정신
- **README §D1** — 본 ADR의 요약 인용
- **`docs/architecture.md` §3.1, §5** — 해피패스 흐름과 보장 항목
