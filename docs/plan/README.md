# PLAN Index — Reliable Webhook Queue

이 디렉터리는 본 저장소의 **1~2단계 범위**(MVP + 장애 복구)에 대한 **실행 가능한 구현 계획(PLAN)** 묶음이다.
PLAN 문서는 PRD(`docs/prd/`)를 마일스톤·테스트 우선 시퀀스·수용 기준으로 번역한다.

> **단일 소스 오브 트루스 우선순위:** `CLAUDE.md` > PRD(`docs/prd/`) > PLAN(`docs/plan/`).
> PLAN이 PRD/CLAUDE.md와 충돌하면 PRD/CLAUDE.md가 우선한다. 본 PLAN은 그 규칙 안에서만 실행 시퀀스를 정한다.

> **구현 착수 조건:** **(a)** 본 PLAN 묶음이 사람에게 승인되고 **(b)** [`00-decisions-needed.md`](./00-decisions-needed.md)의 21개 오픈 퀘스천이 잠긴 뒤에만 코드(테스트·구현)를 작성한다. PLAN 단계에서는 `packages/**`에 어떤 코드도 만들지 않는다.

---

## 읽는 순서

| # | 파일 | 한 줄 설명 |
|---|------|------------|
| 00 | [`00-decisions-needed.md`](./00-decisions-needed.md) | **PRD의 모든 오픈 퀘스천 21건을 한 곳에 모은 결정 필요 목록.** 마일스톤별 의존 매트릭스 포함. 사람이 가장 먼저 닫아야 하는 문서. |
| 01 | [`01-milestones.md`](./01-milestones.md) | M1~M7 한 줄 요약, Exit Criteria, 의존 그래프(ASCII) |
| 02 | [`02-m1-bootstrap.md`](./02-m1-bootstrap.md) | M1: 모노레포 부트스트랩 + 도메인 경계 회귀 테스트(`IT-R1`) 도입. 구현 코드 없음 |
| 03 | [`03-m2-mvp-test-first.md`](./03-m2-mvp-test-first.md) | M2: `IT-S1` 실패 테스트 → 통과시키는 최소 구현 (Fastify·BullMQ·수신자·대시보드) |
| 04 | [`04-m3-idempotency.md`](./04-m3-idempotency.md) | M3: `IT-S2` 실패 테스트 → BullMQ `jobId` 기반 멱등성 |
| 05 | [`05-m4-retry-and-classification.md`](./05-m4-retry-and-classification.md) | M4: `IT-S3`+`IT-S5` 실패 테스트 → 에러 분류 + 지수 백오프 + HMAC |
| 06 | [`06-m5-dlq.md`](./06-m5-dlq.md) | M5: `IT-S4` 실패 테스트 → DLQ 큐 + 이동 + `IT-S5` 강화 |
| 07 | [`07-m6-stalled-recovery.md`](./07-m6-stalled-recovery.md) | M6: `IT-S6` 실패 테스트 → BullMQ stalled 메커니즘 활용 |
| 08 | [`08-m7-graceful-shutdown.md`](./08-m7-graceful-shutdown.md) | M7: `IT-S7` 실패 테스트 → SIGTERM 핸들러 + 셧다운 시퀀스 |
| 09 | [`09-cross-cutting.md`](./09-cross-cutting.md) | 구조화 로깅·Zod 경계·HMAC·시크릿·Redis 재연결·도메인 경계 — 어느 마일스톤에서 도입되는지 표 |
| 10 | [`10-acceptance-gates.md`](./10-acceptance-gates.md) | 마일스톤별 Exit Gate 체크리스트(공통/마일스톤별/최종) |
| 11 | [`11-risks-and-rollback.md`](./11-risks-and-rollback.md) | 가장 깨지기 쉬운 부분(fake timer×BullMQ, 자식 프로세스 SIGTERM 등)과 롤백 전략 |

---

## 구현 착수 전 결정 필요 항목 (한 줄 안내)

- 총 **21건**(PRD `07` §2 그대로). 분포: API/인증 4, 재시도 분류 3, DLQ/회수 2, 보안/SSRF/시크릿 6, 아키텍처/의존성 4, 운영/테스트 2.
- **가장 시급한 5건** (M2 착수 전 반드시 잠금):
  1. **Q-ARCH-1** — HTTP 클라이언트(내장 `fetch` vs `undici`)
  2. **Q-ARCH-2** — 의존 방향 검증 수단(eslint vs grep vs 통합 테스트)
  3. **Q-API-1** — 작업 등록 API 인증 방식(없음 vs 공유 시크릿 vs HMAC 서명)
  4. **Q-SEC-1** — SSRF 방어 정책(차단 안 함 vs 환경변수 토글 vs 차단 ON 기본)
  5. **Q-API-2** — 멱등성 재요청 응답 코드(`202` 동일 jobId vs `409`)

> 자세한 마일스톤별 의존 매트릭스는 [`00-decisions-needed.md`](./00-decisions-needed.md) §3 참조.

---

## 마일스톤 한 줄 시퀀스

```
M1 Bootstrap → M2 MVP(IT-S1) → M3 Idempotency(IT-S2) → M4 Retry+Class(IT-S3,S5) → M5 DLQ(IT-S4) → M6 Stalled(IT-S6) → M7 Shutdown(IT-S7)
```

각 마일스톤은 끝나는 시점에 **데모가 동작 가능한 상태**(CLAUDE.md §6).
M1만 예외 — 코드가 없으므로 "타입체크/빈 테스트 그린"이 동작 가능 상태에 해당.

---

## AI 협업 5원칙 (CLAUDE.md §7) 본 PLAN 적용 요약

| 원칙 | 본 PLAN의 적용 |
|------|----------------|
| (1) 설계는 사람이 먼저 | 각 마일스톤의 "테스트 우선 시퀀스"가 불변식(I*)을 코드 전에 못 박는다 |
| (2) 테스트 우선 | M2~M7의 1단계는 "실패하는 테스트 작성". 구현은 그 테스트를 통과시키는 방향으로만 좁아진다 |
| (3) 범위 통제 | 3단계, 4단계, 부록 트랙은 어떤 PLAN 문서에서도 다루지 않는다 |
| (4) 불확실하면 묻기 | `00-decisions-needed.md`에 21건 결정 보류. 임의 결정 금지 |
| (5) 위반 코드 발견 시 보고 | `11-risks-and-rollback.md` §4에 보고 절차 명시 |

---

## 본 PLAN의 범위 밖 (명시적 거부)

- 3단계 — 관측성(Prometheus, Grafana). PRD `07` §1.1과 동일.
- 4단계 — 부하/측정/수평 확장. PRD `07` §1.2와 동일.
- 부록 트랙 — `packages/streams-internals/`. PRD `07` §1.3과 동일.
- PRD/CLAUDE.md/README.md 수정. PLAN은 PRD를 변역할 뿐, PRD를 갱신하지 않는다(필요 시 별도 PR).

---

## PLAN 자체에 변경이 필요할 때

- 모순/누락 발견 시: [`11-risks-and-rollback.md`](./11-risks-and-rollback.md) §5 절차에 따른다.
- PRD 변경 제안: 각 마일스톤 문서의 "PRD 변경 제안" 절에 기록(현재 비어 있거나 1~2건). PRD 직접 수정은 별도 PR.

---

## 다음 단계 (사람의 액션 아이템)

1. [`00-decisions-needed.md`](./00-decisions-needed.md)를 읽고 21건 결정 잠금.
2. [`01-milestones.md`](./01-milestones.md) 의존 그래프 검토.
3. M1부터 순차 실행. 각 마일스톤은 [`10-acceptance-gates.md`](./10-acceptance-gates.md)의 Exit Gate를 통과한 뒤에만 다음으로 진행.
4. 모든 마일스톤 통과 후 §10 §9 "PLAN 전체의 최종 게이트"를 사람이 검증.
