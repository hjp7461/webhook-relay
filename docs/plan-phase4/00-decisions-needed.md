# 00. Decisions Needed — 4단계 PLAN 실행 중 발생할 수 있는 결정 자리 (Open Questions Register)

> 본 문서는 4단계 PLAN(`docs/plan-phase4/`) 실행 단계에서 **새로 발생할 수 있는
> 결정** 의 자리다. PRD 단계의 결정(Q-LOAD-1~13) 은 모두 [`prd-phase4/00-decisions-needed.md`](../prd-phase4/00-decisions-needed.md)
> 에서 잠금되어 있으므로 본 문서가 추적하지 않는다.

> **운영 규칙:** PLAN 실행 중 PRD 가 잠그지 않은 모호 영역이 발견되면 작업을 멈추고
> 본 문서에 `Q-LOAD-N-PLAN-M` 형식으로 추가한다. 자율 일탈 사전 승인 규칙 정합.

---

## 본 PLAN 진입 시점의 결정 대기 (2026-05-27)

**0 건.** PRD 단계가 잠근 13건이 본 PLAN 의 모든 측정 입력값 / 도구 / 환경 / SLO
재조정 규칙 / 수평 확장 SLO 형태 / 결과 보존 / 회귀 가드 도입 여부를 단일 출처로
결정했다. 본 PLAN 은 이 결정 위에서 실행 시퀀스 + 마일스톤별 절차를 작성한다.

---

## PRD 단계의 잠금 결정 cross-link

본 PLAN 이 의존하는 PRD 단계 결정 (변경 시 PRD 본문 갱신이 단일 출처):

| Q-ID | 결정 | 본 PLAN 의존 마일스톤 |
|------|------|------------------------|
| Q-LOAD-1 | k6 (Grafana Labs) | **M-LOAD-1** (Bootstrap) |
| Q-LOAD-2 | 로컬 + cgroup 격리 | **M-LOAD-1**, 모든 측정 마일스톤 |
| Q-LOAD-3 | PRD 묶음만 (3단계 패턴) | 본 PLAN 묶음 작성 자체 |
| Q-LOAD-4 | Redis 단일 인스턴스 한계 식별 | **M-LOAD-6** (Redis knee point) |
| Q-LOAD-5 | 정적 부하만 (카오스 제외) | 모든 측정 마일스톤 |
| Q-LOAD-6 | RPS 중도 셋 (10 / 100 / 500 / 100→1000) | **M-LOAD-2~5** |
| Q-LOAD-7 | 페이로드 운영 평균 (80% / 15% / 5%) | **M-LOAD-3** (LP-2) |
| Q-LOAD-8 | LP-1/4 짧은, LP-2/3 sustained | **M-LOAD-2~4** |
| Q-LOAD-9 | p99 × 1.5 | **M-LOAD-6** (SLO 재조정 PR 트리거) |
| Q-LOAD-10 | α = 0.8 | **M-LOAD-5** (수평 확장) |
| Q-LOAD-11 | β = 1.2 | **M-LOAD-5** |
| Q-LOAD-12 | Markdown 표 (`docs/prd-phase4/results/`) | **M-LOAD-2~6** |
| Q-LOAD-13 | IT-LOAD-N 없음 | 본 PLAN 의 회귀 가드 도입 0건 |

---

## PLAN 실행 중 발생할 수 있는 모호 영역 (사전 가이드, 본 문서에 채워질 자리)

본 §3 은 PLAN 실행 도중 모호 영역을 만났을 때 사용자에게 제시할 선택지 후보를
**사전 가이드** 로만 정리한다. 실제 발생 시 본 문서에 `Q-LOAD-N-PLAN-M` 으로
추가하고 사용자 잠금을 기다린다.

### 후보 모호 영역 (현 시점에서 예상되는 항목)

| 후보 ID | 모호 영역 | 발생 가능 마일스톤 | 사전 가이드 |
|---------|-----------|----------------------|-------------|
| (후보) | 측정 분산 ±5% 초과 시 처리 절차 (재측정 / 측정 환경 점검 / 결과 폐기) | M-LOAD-2~5 | PRD `02` §7.2 가 허용 분산을 정의. 초과 시 첫 단계: 측정 호스트 노이즈 / cgroup 한정값 / k6 스크립트 분산 점검. 그 다음 사용자 결정. |
| (후보) | Redis OOM / 워커 OOM 발생 시 PLAN 중단 vs 측정 변수로 기록 | M-LOAD-4, M-LOAD-6 | PRD `04` §5 가 knee point 식별 절차를 정의. OOM 자체가 식별의 결과 — 측정 변수로 기록 후 사용자 결정. PLAN 중단 결정은 사용자. |
| (후보) | `prd-phase3/04` §3.1 SLO 임계 재조정 PR 의 본문 형식 | M-LOAD-6 | PRD `03` §6 가 인계 절차를 정의. PR 본문 형식의 세부(예: 비교 표 형식)는 발생 시 결정. |
| (후보) | `--scale worker=N` 의 N 값 추가 필요 (예: 20, 50) | M-LOAD-5 | PRD `04` §2 가 N ∈ {1, 2, 5, 10} 을 기본 잠금. 측정 결과 추가 N 이 필요해지면 사용자 결정. |
| (후보) | docker-compose.yml 의 k6 서비스 spec 의 사소한 결정 (이미지 버전 핀, network 명 등) | M-LOAD-1 | PRD `02` §3 가 잠정 형태만 명시. 정확한 YAML 은 PLAN 단계 결정. 발생 시 사용자 검토. |

> 위 표는 **사전 가이드** 이며 본 문서가 잠그는 결정이 아니다. 실제 발생 시
> `Q-LOAD-N-PLAN-M` 으로 새 항목을 추가하고 사용자 잠금을 받는다.

---

## 출처 / 참조

- PRD 결정 잠금: [`docs/prd-phase4/00-decisions-needed.md`](../prd-phase4/00-decisions-needed.md) (Q-LOAD-1~13 전건 Resolved)
- 1~2단계 결정 잠금: [`docs/plan/00-decisions-needed.md`](../plan/00-decisions-needed.md) (21건 Resolved)
- 3단계 결정 잠금: [`docs/plan-phase3/00-decisions-needed.md`](../plan-phase3/00-decisions-needed.md) (15건 Resolved)
