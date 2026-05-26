# 01. Milestones — M1~M7 Overview

> 본 문서는 PRD(`docs/prd/`)를 실행 가능한 마일스톤 시퀀스로 번역한다.
> 각 마일스톤의 상세는 같은 디렉터리의 별도 파일(M1=`02-m1-bootstrap.md`, M2=`03-m2-mvp-test-first.md`, ...)에서 다룬다.
>
> **CLAUDE.md §6 규칙:** 각 마일스톤이 끝나는 시점에 **데모는 항상 동작 가능한 상태**여야 한다(M1 예외: 코드가 없으므로 "타입체크/빈 테스트 통과"가 동작 가능 상태에 해당).
>
> **AI 협업 5원칙 적용:** 마일스톤 진입은 **(a)** PLAN 묶음 전체가 승인되고 **(b)** 해당 마일스톤이 의존하는 결정 필요 항목이 잠긴(`00-decisions-needed.md` Status: Resolved) 뒤에만 가능하다.

---

## 1. 마일스톤 한 줄 요약

| # | 이름 | 목표 한 줄 | 대응 PRD 단계 | 대응 IT 시나리오 |
|---|------|------------|----------------|------------------|
| **M1** | Bootstrap | 모노레포·도구 체인·도커 컴포즈 골격, 빈 테스트 그린 | 1단계 사전 작업 | (없음, 단 `IT-R1-domain-boundary` 도입 권장) |
| **M2** | MVP (해피패스) | `IT-S1` 실패 테스트 → 통과시키는 최소 구현(라우트·큐·워커·수신자·대시보드) | 1단계 MVP | `IT-S1-happy-path` |
| **M3** | Idempotency | `IT-S2` 실패 테스트 → BullMQ `jobId` 기반 멱등성 | 2단계 §F2.1 | `IT-S2-idempotency` |
| **M4** | Retry & Classification | `IT-S3`+`IT-S5` 실패 테스트 → 에러 분류 + 지수 백오프 + HMAC | 2단계 §F2.2 §F2.3 + 6단계 §2 | `IT-S3-retriable-backoff`, `IT-S5-non-retriable-immediate-dlq` |
| **M5** | DLQ | `IT-S4` 실패 테스트 → DLQ 큐와 이동 로직 | 2단계 §F2.4 | `IT-S4-max-attempts-dlq` |
| **M6** | Stalled Recovery | `IT-S6` 실패 테스트 → BullMQ stalled-job 회수 활용 | 2단계 §F2.5 | `IT-S6-stalled-recovery` |
| **M7** | Graceful Shutdown | `IT-S7` 실패 테스트 → SIGTERM 핸들러 + 셧다운 시퀀스 | 2단계 §F2.6 + 6단계 §6 | `IT-S7-graceful-shutdown` |

> **PLAN 범위 외(명시적 거부):** 3단계(관측성/Prometheus/Grafana), 4단계(부하/측정/수평 확장),
> 부록 트랙(`packages/streams-internals/`). PRD `07` §1 그대로 유지.

---

## 2. 의존 그래프 (ASCII)

```
                       ┌──────────────────────────┐
                       │  결정 필요 항목 잠금      │
                       │  (docs/plan/00-...md)    │
                       └──────────────┬───────────┘
                                      ▼
                            ┌──────────────────┐
                            │  M1: Bootstrap   │
                            │  (도구 체인)     │
                            └──────────┬───────┘
                                       │
                                       ▼
                            ┌──────────────────┐
                            │  M2: MVP         │ ← IT-S1
                            │  (해피패스)      │
                            └──────────┬───────┘
                                       │
                          ┌────────────┼─────────────┐
                          ▼            ▼             ▼
                  ┌─────────────┐ ┌──────────┐ ┌─────────────┐
                  │ M3: Idem.   │ │ M4:Retry │ │ M7: Shutdown│
                  │   (IT-S2)   │ │  +Class  │ │   (IT-S7)   │
                  └──────┬──────┘ │+HMAC     │ └──────┬──────┘
                         │        │(IT-S3,5) │        │
                         │        └────┬─────┘        │
                         │             ▼              │
                         │      ┌─────────────┐       │
                         │      │ M5: DLQ     │       │
                         │      │  (IT-S4)    │       │
                         │      └──────┬──────┘       │
                         │             ▼              │
                         │      ┌─────────────┐       │
                         │      │ M6: Stalled │       │
                         │      │  (IT-S6)    │       │
                         │      └──────┬──────┘       │
                         │             │              │
                         └─────────────┴──────────────┘
                                       │
                                       ▼
                            ┌──────────────────┐
                            │ All 7 IT scenarios│
                            │ green. PLAN done. │
                            └──────────────────┘
```

### 의존 규칙
- **M1 → M2 → M3** 는 직선 의존(M2가 멱등성 없는 라우트를 만들고, M3가 그 라우트를 멱등성 강제로 격상).
- **M2 → M4** 는 직선 의존(M2의 핸들러 골격 위에 분류/재시도/HMAC을 얹는다).
- **M4 → M5** 는 직선 의존(분류 결과가 DLQ 이동 트리거).
- **M5 → M6** 는 직선 의존(stalled 회수가 끝나 다시 재시도 → 최종적으로 DLQ까지 한 사이클 검증).
- **M7(셧다운)**은 M2 이후 어디든 끼워 넣을 수 있으나, 시그널 핸들러를 부트스트랩과 통합하는 비용이 크고 다른 마일스톤의 부수 효과(워커 close 시점)에 영향을 주므로 **마지막 단계**로 둔다.
- M3와 M4는 병렬화 가능하지만, **본 PLAN의 권장은 순차 진행**(M3 → M4)이다. AI 협업에서 동시 변경은 회귀 추적을 어렵게 한다.

---

## 3. 마일스톤별 Exit Criteria 요약

각 마일스톤 상세 파일에 같은 항목이 더 자세히 들어 있다. 본 표는 한눈 보기용.

### M1 — Bootstrap
- `pnpm install` 성공
- `pnpm typecheck` 성공 (모든 패키지)
- `pnpm test` 성공 (테스트가 0개여도 OK, 단 vitest 실행은 통과)
- `docker compose config`가 유효
- `IT-R1-domain-boundary` 회귀 테스트 도입(빈 패키지여도 의미 있음. Q-ARCH-2 선택지 (c)와 정합)

### M2 — MVP
- `IT-S1-happy-path` 그린
- `UT-3` (요청 Zod 스키마) 그린
- `UT-4` (환경변수 Zod 스키마) 그린
- `pnpm install && docker compose up` 이후 README의 `curl` 명령이 `202` + `jobId` 반환
- 데모 수신 엔드포인트가 페이로드를 받는다
- `GET /dashboard`가 카운터 표시
- AC1.5(도메인 경계) grep 검수 통과 = `IT-R1-domain-boundary` 그린

### M3 — Idempotency
- `IT-S2-idempotency` 그린
- `UT-5` (멱등성 키 정합성) 그린
- 등록 API가 `idempotencyKey` 누락에 `400` 응답 (`AC2.2`)
- M2의 모든 그린이 회귀하지 않음

### M4 — Retry & Classification (+ HMAC)
- `IT-S3-retriable-backoff` 그린 (fake timer 기반)
- `IT-S5-non-retriable-immediate-dlq` 그린
- `UT-1` (백오프 계산) 그린
- `UT-2` (에러 분류) 그린
- `UT-6` (HMAC 결정성) 그린
- 워커 송신에 타임아웃 적용됨(`AC6.1`)
- 시크릿 미설정 시 부트스트랩 실패(`AC6.2`)
- M1~M3의 모든 그린이 회귀하지 않음

### M5 — DLQ
- `IT-S4-max-attempts-dlq` 그린
- DLQ 큐 이름이 `constants.ts`에 등장
- DLQ 작업에서 페이로드 + 마지막 에러 컨텍스트(분류, 응답 상태, 시도 횟수) 조회 가능 (`AC2.3`)
- 원 큐에서 사라짐
- M1~M4의 모든 그린이 회귀하지 않음

### M6 — Stalled Recovery
- `IT-S6-stalled-recovery` 그린
- `STALLED_INTERVAL_MS`가 환경변수로 노출됨
- BullMQ stalled 메커니즘에 의존 — 자체 stalled 매니저 없음
- M1~M5의 모든 그린이 회귀하지 않음

### M7 — Graceful Shutdown
- `IT-S7-graceful-shutdown` 그린 (자식 프로세스 + 실제 SIGTERM, Q-OPS-2 (b))
- 셧다운 진행 중 `POST /webhooks`는 `503` (`AC6.4`)
- 셧다운 진행 중 `GET /healthz`는 `503`
- 셧다운 타임아웃 도달 시 잔여 작업 ID 로그 + exit code (Q-SEC-4 결정에 따름)
- M1~M6의 모든 그린이 회귀하지 않음

---

## 4. 마일스톤 간 회귀 방지 약속

- 각 마일스톤 종료 시점에 **이전 모든 마일스톤의 테스트가 그린**이어야 PR을 닫을 수 있다.
- 이를 위해 각 마일스톤 PLAN은 "회귀 점검" 단계를 마지막에 둔다.
- CI 분리(Q-OPS-1)는 본 PLAN 범위 외지만, 로컬에서는 `pnpm test:unit && pnpm test:integration`을 매번 실행한다는 약속을 모든 마일스톤 PLAN의 Done 정의에 포함한다.

---

## 5. 본 PLAN의 자체 가드

- **범위 통제(CLAUDE.md §7-3):** 3·4단계, 부록 트랙은 어떤 마일스톤 PLAN에서도 다루지 않는다. 위반 발견 시 PR 거절.
- **테스트 우선(CLAUDE.md §7-2):** M2~M7 각 마일스톤의 1단계는 "실패하는 테스트 작성". 구현 단계가 그 테스트를 통과시키는 방향으로만 좁아진다.
- **불확실하면 묻기(CLAUDE.md §7-4):** 마일스톤 진입 전, 해당 마일스톤의 "오픈 퀘스천 의존" 섹션의 모든 Q가 잠겨야 한다.
- **PRD 변경 제안:** PLAN 작성 중 PRD 보강이 필요해 보이면 마일스톤 문서의 "PRD 변경 제안" 절에만 기록한다. PRD를 직접 수정하지 않는다.

---

## 6. 다음 단계

1. 본 문서와 `00-decisions-needed.md`를 사람이 검토.
2. `00-decisions-needed.md`의 21건 결정 잠금.
3. M1부터 순차 진행. M2 이후 각 마일스톤은 본 문서의 의존 그래프를 따른다.
