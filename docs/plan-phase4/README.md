# PLAN Index — Phase 4 (Load · Measurement · Horizontal Scaling)

이 디렉터리는 본 저장소의 **4단계 범위 — 부하 테스트 · p50/p99 실측 · 수평 확장
SLO 검증** 에 대한 **실행 가능한 구현 계획(PLAN)** 묶음이다. PLAN 문서는 PRD
(`docs/prd-phase4/`)를 마일스톤 · 측정 프로토콜 · 결과 보고서 형식으로 번역한다.

> **단일 소스 오브 트루스 우선순위:**
> 1. [`CLAUDE.md`](../../CLAUDE.md) — 최우선
> 2. [`docs/plan/00-decisions-needed.md`](../plan/00-decisions-needed.md) — 1~2단계 Resolved 21건 (본 PLAN 이 침범하지 않음)
> 3. [`docs/plan-phase3/00-decisions-needed.md`](../plan-phase3/00-decisions-needed.md) — 3단계 Resolved 15건 (본 PLAN 이 침범하지 않음)
> 4. [`docs/prd-phase4/`](../prd-phase4/) — 본 PLAN 이 충실히 이행 (Q-LOAD-1~13 전건 Resolved)
> 5. [`docs/plan-phase4/00-decisions-needed.md`](./00-decisions-needed.md) — 본 PLAN 진입 후 발생할 수 있는 결정 자리
> 6. 1~3단계 PLAN(`docs/plan/`, `docs/plan-phase3/`) — 형식 일관성 참조
>
> PLAN 이 PRD/CLAUDE.md 와 충돌하면 PRD/CLAUDE.md 가 우선한다. 본 PLAN 은 그 규칙
> 안에서만 실행 시퀀스를 정한다.

> **구현 착수 조건:** **(a)** 본 PLAN 묶음이 사람에게 승인되고 **(b)** PRD
> Q-LOAD-1~13 이 모두 Resolved — **이미 2026-05-27 일괄 잠금 완료** (`prd-phase4/00-decisions-needed.md`).
> PLAN 문서 단계에서는 `packages/**`, `docker/**` (단 `docker/k6/` 자리 잠금 메모는 허용),
> `docker-compose.yml`, `.github/`, `CLAUDE.md`, `README.md`, `docs/prd/`, `docs/prd-phase3/`,
> `docs/prd-phase4/00~05.md`, `docs/plan/`, `docs/plan-phase3/`, `docs/adr/`,
> `docs/architecture.md` 어디에도 코드를 작성하지 않는다.

---

## 본 PLAN 의 범위 한 줄 요약

> **4단계 PRD(`docs/prd-phase4/`)가 정의한 부하 프로필(LP-1~LP-4) · 측정 도구(k6) ·
> 측정 환경(로컬 + cgroup) · SLO 재조정 규칙(p99 × 1.5) · 수평 확장 SLO(α=0.8, β=1.2)
> 을 6개 마일스톤(M-LOAD-1~6) 으로 분해해, **각 마일스톤이 끝나는 시점마다 1~3단계
> 회귀 가드(IT-S1~S7, IT-R1, IT-OBS-1~12) 가 그린** 이고 측정 결과가
> `docs/prd-phase4/results/` 에 commit 되도록 한다. 부록 트랙(Streams Internals)
> 과 운영 PRD(Alertmanager / Redis HA / 카오스) 는 본 PLAN 어디에서도 다루지 않는다.**

---

## 읽는 순서

| # | 파일 | 한 줄 설명 |
|---|------|------------|
| 00 | [`00-decisions-needed.md`](./00-decisions-needed.md) | **PRD Q-LOAD-1~13 전건 Resolved**. PLAN 진입 후 발생할 수 있는 결정 자리 (현재 0건). |
| 01 | [`01-milestones.md`](./01-milestones.md) | M-LOAD-1~6 한 줄 요약, Exit Criteria, ASCII 의존 그래프, 3단계 M-OBS-1~6 과의 격리 확인. |
| 02 | `02-m-load-1-bootstrap.md` *(예정)* | M-LOAD-1: `docker-compose.yml` 에 k6 서비스 추가 + `docker/k6/` 골격 + cgroup 한정값 명세 + 측정 호스트 메타데이터 헬퍼 + (회귀 가드) 기존 5 서비스 무영향. |
| 03 | `03-m-load-2-lp1-baseline.md` *(예정)* | M-LOAD-2: LP-1 baseline (R=10, P=small, W=~6.5분) 시나리오 + happy-path stub + 첫 결과 보고서. |
| 04 | `04-m-load-3-lp2-nominal.md` *(예정)* | M-LOAD-3: LP-2 nominal sustained (R=100, P=80/15/5, W=~32분) + IT-S3/S4/S5 부하 변형(stub 5xx/4xx) + SLO 잠정값 검증 분포. |
| 05 | `05-m-load-4-lp3-lp4.md` *(예정)* | M-LOAD-4: LP-3 stress (R=500, P=large) + LP-4 spike (base→spike→base) + knee point 1차 탐색. |
| 06 | `06-m-load-5-horizontal-scaling.md` *(예정)* | M-LOAD-5: N ∈ {1, 2, 5, 10} 변동 (`--scale worker=N`) + 처리량/p99/큐 길이 함수 형태 측정 + SLO-H-1/H-2 검증. |
| 07 | `07-m-load-6-redis-knee-and-final-report.md` *(예정)* | M-LOAD-6: Redis CPU/메모리/네트워크 한계 식별 + HA/Cluster 트리거 조건 명문화 + 전체 LP × N 결과 종합 보고서 + `prd-phase3/04` §3.1 SLO 임계 재조정 PR 트리거. |
| 08 | `08-cross-cutting.md` *(예정)* | 횡단 관심사: 측정 호스트 메타데이터 강제, 결과 보고서 commit 정책, Prometheus time range 분리, k6 시나리오의 결정성 패딩, redis flush 시점. |
| 09 | `09-acceptance-gates.md` *(예정)* | 마일스톤별 Exit Gate 체크리스트(공통 / 마일스톤별 / 최종 PLAN exit). |
| 10 | `10-risks-and-rollback.md` *(예정)* | 측정 분산 ±5% 초과, k6 시나리오의 RPS 분산, Redis OOM, 워커 OOM, 결과 보고서 비결정성, 1~3단계 회귀 위험 등 깨지기 쉬운 지점과 롤백. |

본 outline 단계에서는 §00 / §01 만 작성한다. §02~§10 은 본 README 의 jaket 정합을
잠근 뒤 별도 commit 시리즈 또는 서브에이전트 위임으로 작성(사용자 결정).

---

## 마일스톤 한 줄 요약

| ID | 이름 | 핵심 산출물 |
|----|------|--------------|
| **M-LOAD-1** | Bootstrap | k6 서비스 + `docker/k6/` + cgroup + 메타데이터 헬퍼 |
| **M-LOAD-2** | LP-1 baseline | 첫 결과 보고서 commit |
| **M-LOAD-3** | LP-2 nominal sustained | SLO 잠정값 검증 분포 확보 |
| **M-LOAD-4** | LP-3 stress + LP-4 spike | knee point 1차 탐색 |
| **M-LOAD-5** | 수평 확장 측정 | SLO-H-1/H-2 검증 |
| **M-LOAD-6** | Redis knee + 최종 보고서 | SLO 재조정 PR 트리거 |

상세 의존 그래프 + Exit Criteria 는 [`01-milestones.md`](./01-milestones.md).

---

## 1~3단계 PLAN 과의 관계

본 PLAN 은 1~3단계 PLAN 의 어떤 산출물도 변경하지 않는다. 각 마일스톤 종료
시점에 다음 회귀 가드가 **모두 그린** 이어야 다음 마일스톤 진입 가능:

- **단위 (UT):** UT-1~6 + 보강(`metrics-c-catalog`, `metrics-d-w-catalog` 등).
- **1~2단계 IT:** IT-S1~S7 + 보강(IT-S1b, IT-S2b, IT-S6b).
- **3단계 IT:** IT-OBS-1~12 + IT-R1(보강).

본 PLAN 의 부하 측정은 **회귀 가드를 추가하지 않는다** (Q-LOAD-13 (a) IT-LOAD-N 없음).
대신 측정 결과를 `docs/prd-phase4/results/` 에 commit 으로 잠금한다.

---

## 본 PLAN 의 명시적 비목표

본 PLAN 이 다루지 않는 항목 (PRD §3 N4.1~N4.7 정합):

- Alertmanager 라우팅 / 온콜 / 인시던트 런북.
- Redis HA / Cluster / Sentinel 도입 (knee point 식별만, 도입은 별도 PRD).
- 카오스 / 실패 시뮬레이션 (Q-LOAD-5).
- 부록 트랙 (Streams Internals).
- 운영 배포 자동화 (Terraform / Helm / ArgoCD).
- 새 메트릭 / 라벨 / SLI / SLO 도입 (G4.3 정합 — 본 PRD 가 도입한 SLO-H-1/H-2 는
  3단계 카탈로그 메트릭을 그대로 사용).
- 부하 회귀 가드 IT-LOAD-N (Q-LOAD-13).

---

## 결정 자리 (`00-decisions-needed.md`)

본 PLAN 진입 시점에는 **결정 대기 0건**이다 (PRD Q-LOAD-1~13 전건 Resolved). 다만
실제 측정 단계에서 새 결정이 필요해질 가능성이 있다(예: 측정 분산 ±5% 초과 시
처리 절차, Redis OOM 시 PLAN 중단 절차 등). 본 PLAN 의 `00-decisions-needed.md`
는 그런 결정 자리를 잠금해 두며, 발생 시 Q-LOAD-N-PLAN-M 형식으로 추적한다.
