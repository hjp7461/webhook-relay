# ADR-001 — BullMQ vs Raw Redis Streams vs Kafka

- **Status:** Accepted
- **Date:** 2026-05-26
- **Deciders:** PM, Tech Lead, 사람 검토(저장소 소유자)
- **Scope:** 1~2단계 메인 트랙 전체

---

## 컨텍스트

본 저장소의 목적은 "프로덕션급 작업 큐가 갖춰야 할 보장(전달 보장 · 멱등성 · 재시도 · DLQ · 그레이스풀 셧다운 · 관측성)을 검증된 라이브러리 위에서 **올바르게 조립하는 판단력**"을 보여주는 것이다(CLAUDE.md §1).

따라서 **무엇으로 큐를 만들 것인가**가 첫 번째 설계 결정이다. 후보는 세 가지였다.

1. **Raw Redis Streams** — `XREADGROUP` / `XACK` / `XAUTOCLAIM`을 직접 사용
2. **BullMQ** — Node 진영에서 가장 성숙한 작업 큐 라이브러리(내부적으로 Redis Streams 위에 구현됨)
3. **Apache Kafka** — 이벤트 스트리밍 플랫폼

---

## 결정

**BullMQ를 메인 트랙 전체에 채택한다.**

- 큐/워커 추상화: `bullmq`의 `Queue` / `Worker` / `QueueEvents`
- 재시도: BullMQ Job 옵션 `attempts` + `backoff: { type: 'exponential', delay }`
- DLQ: 별도 `Queue` 인스턴스 + Worker `'failed'` 이벤트 훅으로 적재 (BullMQ 내장 DLQ는 없음 — F2.4)
- 멱등성: BullMQ의 동일 `jobId` 중복 흡수 시맨틱(F2.1, ADR-002 참조)
- Stalled 회수: BullMQ Worker의 `stalledInterval` / `maxStalledCount` 옵션 (F2.5, 자체 구현 금지)
- 그레이스풀 셧다운: Worker `.close({ force: false })`의 진행 작업 대기 시맨틱

---

## 근거

### vs Raw Redis Streams (직접 구현)

BullMQ를 선택한 이유는 "더 빠르거나 더 단순해서"가 아니다. **이미 검증된 추상화를 재현하는 데 시간을 쓰지 않기 위해서**다.

직접 Streams로 구현하면 다음을 모두 작성해야 한다.
- Consumer Group 관리 (`XGROUP CREATE`)
- ACK/NACK 시맨틱 (`XACK`)
- pending entries 모니터링 (`XPENDING`)
- stalled-consumer 회수 (`XAUTOCLAIM`)
- 지수 백오프 스케줄링 (`ZADD` + `ZRANGEBYSCORE` 또는 별도 키 디자인)
- 재시도 카운터 + DLQ 라우팅
- 락/lease 만료 처리

이들은 모두 "올바르게 만들기 어려운 분산 시스템 원리의 정수"다. **본 PRD의 어필 포인트는 그 원리를 "직접 짤 수 있다"가 아니라 "보장이 무엇이고 어떻게 검증하는지를 안다"이다**(CLAUDE.md §1). BullMQ는 위 항목들의 표준 구현을 제공하며, 우리는 그 위에 도메인(웹훅 전송 + 멱등성 + 분류 + DLQ 이동)을 얹는다.

> **그러나 "추상화의 비용"은 별도 부록 트랙에서 측정한다.**
> `packages/streams-internals/`에 Raw Streams로 동일 보장을 직접 구현하고 BullMQ와 처리량/지연을 정량 비교하는 것이 부록 트랙의 산출물이다. 본 ADR은 메인 트랙의 선택만 정의한다.

### vs Apache Kafka

작업 큐(개별 작업의 신뢰성 있는 실행)와 이벤트 스트리밍(durable, replayable 로그)은 **다른 문제를 푸는 도구다.**

- 작업 큐의 시맨틱은 "한 작업을 한 번 처리한다(at-least-once + 멱등성으로 보강)". Kafka의 시맨틱은 "이벤트 로그를 N개의 컨슈머 그룹이 각자의 오프셋으로 재생한다".
- 웹훅 재시도 워크로드는 전형적 작업 큐 영역이다. Kafka로 동일 동작을 만들면:
  - 파티션 키 ↔ 멱등성 키 매핑을 직접 설계
  - 재시도 큐를 별도 토픽으로 운영(원 토픽으로 재발행)
  - DLQ도 별도 토픽
  - 컨슈머 그룹 리밸런싱 시 진행 중 메시지 처리 정책
- 위 항목은 모두 운영 복잡성이 BullMQ의 **수십 배** 들고, 본 저장소가 다루는 규모에서 그 비용을 정당화하지 못한다.

Kafka가 적합한 워크로드(이벤트 소싱, 멀티-컨슈머 fan-out, 장기 보존 + replay)는 본 PRD의 비목표다.

---

## 트레이드오프 / 한계

1. **BullMQ의 동작 시맨틱이 추상화에 묶인다.**
   - 예: `removeOnFail: { count: 0 }`로 원 큐에서 즉시 제거하는 것이 BullMQ 시맨틱에 의존. 다른 큐 라이브러리로 갈아끼우려면 동작 재검증 필요.
   - 완화: `core/` 패키지에서 BullMQ 타입을 캡슐화. `demo/`는 BullMQ를 직접 import하지 않는다(현재는 일부 노출되어 있음 — 향후 인터페이스 정리 가능).

2. **BullMQ 내부 시맨틱 변경에 노출.**
   - BullMQ 메이저 버전 업데이트 시 `attemptsMade` 계산식, `stalledInterval` 동작 등이 달라질 수 있다.
   - 완화: 7개 IT 시나리오가 회귀를 즉시 잡는다. 본 PRD가 검증한 BullMQ 버전은 lockfile에 잠겨 있다.

3. **`failed` 이벤트의 `job === undefined` 케이스 미처리.**
   - stalled-limit 초과 시 BullMQ가 `failed` 이벤트를 `job === undefined`로 발화하는 경우가 있다. 현 `core/src/worker.ts:113`은 silent return으로 처리.
   - **이 케이스에서 페이로드 손실 가능성**이 잔존. 후속 결정 + DLQ 이동 정책 필요.

4. **추상화 비용은 정량화되지 않음.**
   - "BullMQ가 raw Streams 대비 얼마나 느린가?"는 현재 미측정.
   - 부록 트랙에서 동일 워크로드로 처리량/지연을 비교할 예정. 본 ADR의 결정은 그 결과와 무관하게 "메인 트랙에서는 검증된 추상화를 쓴다"는 원칙에 기반.

---

## 향후 작업

- **부록 트랙(`packages/streams-internals/`)** — Raw Redis Streams로 동일 보장(at-least-once + 멱등성 + 분류 + 재시도 + DLQ + stalled 회수)을 직접 구현. BullMQ와 처리량/지연 정량 비교.
- **stalled-limit 초과 정책** — `failed(job===undefined)` 케이스에 대한 명시적 DLQ 이동 또는 운영 알람 정책 결정.
- **`core` 인터페이스 정리** — `demo`가 BullMQ 타입을 직접 import하지 않도록 `core`에서 thin-wrap 보강.

---

## 관련 문서

- **CLAUDE.md §1** — 프로젝트 목적과 트랙 구분
- **CLAUDE.md §2** — 기술 스택 고정(BullMQ + ioredis)
- **PRD `02-resilience.md` §F2.0~F2.6** — BullMQ 위에 만드는 보장 항목
- **PRD `07-out-of-scope-and-future.md` §1.3** — 부록 트랙 범위
- **PLAN `00-decisions-needed.md` Q-ARCH-1** — HTTP 클라이언트 결정(Node 내장 fetch — 새 의존성 금지 정책과 일관)
- **README §D4** — 본 ADR의 요약 인용
- **`docs/architecture.md` §5** — 보장 / 비보장 항목
