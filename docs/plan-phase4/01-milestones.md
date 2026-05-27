# 01. Milestones — M-LOAD-1 ~ M-LOAD-6 Overview

> 본 문서는 PRD(`docs/prd-phase4/`)를 실행 가능한 마일스톤 시퀀스로 번역한다.
> 각 마일스톤의 상세는 같은 디렉터리의 별도 파일(`02-m-load-1-bootstrap.md` ~
> `07-m-load-6-redis-knee-and-final-report.md`)에서 다룬다.
>
> **CLAUDE.md §6 규칙:** 각 마일스톤이 끝나는 시점에 **회귀 가드(1~3단계 IT + UT)
> 가 그린** + `docker compose up` 데모가 동작 상태를 유지한다.
>
> **AI 협업 5원칙 적용:** 마일스톤 진입은 **(a)** 본 PLAN 묶음 전체가 승인되고
> **(b)** PRD Q-LOAD-1~13 이 모두 Resolved (이미 2026-05-27 잠금 완료) + 직전
> 마일스톤의 Exit Gate (§3) 가 통과된 뒤에만 가능하다.

---

## 1. 마일스톤 한 줄 요약

| # | 이름 | 목표 한 줄 | 대응 PRD 단계 | 대응 LP / 측정 |
|---|------|------------|----------------|-------------------|
| **M-LOAD-1** | Bootstrap | `docker-compose.yml` 에 `k6` 서비스 추가(Q-LOAD-1) + `docker/k6/` 디렉터리 + cgroup 한정값(Q-LOAD-2) + 측정 호스트 메타데이터 헬퍼 | PRD `02` §3, §4, §5 | (측정 미실행) |
| **M-LOAD-2** | LP-1 baseline 측정 | LP-1 (R=10 RPS, P=small 고정, W=~6.5분) k6 시나리오 + happy-path stub 수신자 + 첫 결과 보고서 commit | PRD `01` §3.1 LP-1 + `03` §3 | LP-1 |
| **M-LOAD-3** | LP-2 nominal sustained | LP-2 (R=100, P=80/15/5, W=~32분) + IT-S3/S4/S5 부하 변형(stub 5xx/4xx) + SLO 잠정값(99.5% / 0.5s / 5s / 1%) 의 검증 분포 확보 | PRD `01` §3.1 LP-2 + `03` §4 | LP-2 |
| **M-LOAD-4** | LP-3 stress + LP-4 spike | LP-3 (R=500, P=large 고정) + LP-4 (base→spike→base 100→1000→100) + knee point 1차 탐색 | PRD `01` §3.1 LP-3/4 + `04` §3 | LP-3, LP-4 |
| **M-LOAD-5** | 수평 확장 측정 | N ∈ {1, 2, 5, 10} 변동 (`docker compose up --scale worker=N`) + 처리량/p99/큐 길이의 함수 형태 측정 + SLO-H-1 (α=0.8) / SLO-H-2 (β=1.2) 검증 | PRD `04` §2, §4 | LP-2 × N (4종) |
| **M-LOAD-6** | Redis knee + 최종 종합 보고서 | Redis CPU/메모리/네트워크 한계 식별 (Q-LOAD-4 정합) + HA/Cluster 트리거 조건 명문화 + 전체 LP × N 결과 종합 보고서 + `prd-phase3/04` §3.1 SLO 임계 재조정 PR 트리거 (p99 × 1.5, Q-LOAD-9) | PRD `04` §5, §6 + `03` §6 | (종합) |

> **PLAN 범위 외 (명시적 거부):** Alertmanager / Redis HA 도입 / 카오스 / 부록
> 트랙 / 운영 배포 자동화 / 새 메트릭 / IT-LOAD-N. PRD `00-overview` §3 N4.1~N4.7
> 와 README 비목표 그대로.

---

## 2. 의존 그래프 (ASCII)

```
        ┌─────────────────────────────────────┐
        │ PRD Q-LOAD-1~13 전건 Resolved        │
        │ (2026-05-27 잠금 완료)               │
        └────────────────┬──────────────────────┘
                         ▼
            ┌────────────────────────┐
            │  M-LOAD-1: Bootstrap   │
            │  k6 서비스 + cgroup +  │
            │  메타데이터 헬퍼       │
            └────────────┬───────────┘
                         ▼
            ┌────────────────────────┐
            │  M-LOAD-2: LP-1        │ ← 첫 결과 보고서
            │  baseline 측정         │
            └────────────┬───────────┘
                         ▼
            ┌────────────────────────┐
            │  M-LOAD-3: LP-2        │ ← SLO 잠정값 검증
            │  nominal sustained     │   분포 확보
            └────────────┬───────────┘
                         ▼
            ┌────────────────────────┐
            │  M-LOAD-4: LP-3 stress │ ← knee point
            │  + LP-4 spike          │   1차 탐색
            └────────────┬───────────┘
                         ▼
            ┌────────────────────────┐
            │  M-LOAD-5: 수평 확장   │ ← SLO-H-1/H-2
            │  N ∈ {1,2,5,10}        │   검증
            └────────────┬───────────┘
                         ▼
            ┌────────────────────────┐
            │  M-LOAD-6: Redis knee  │ ← 최종 종합 보고서
            │  + 최종 종합 보고서    │   + SLO 재조정 PR
            └────────────┬───────────┘
                         ▼
            ┌────────────────────────┐
            │ All LP × N 측정 완료 + │
            │ `prd-phase3/04` §3.1   │
            │ SLO 임계 갱신 PR 인계  │
            │ PLAN done.             │
            └────────────────────────┘
```

### 의존 규칙

- **M-LOAD-1 → M-LOAD-2** 직선 의존 — Bootstrap 이 측정 인프라(k6 + cgroup +
  메타데이터)를 제공해야 측정 가능.
- **M-LOAD-2 → M-LOAD-3** 직선 의존 — baseline 측정으로 측정 분산 / 도구 신뢰성
  검증 후 sustained 측정 진입.
- **M-LOAD-3 → M-LOAD-4** 직선 의존 — nominal 영역의 SLO 분포 확보 후 stress/spike
  영역으로 확장. knee point 탐색의 기준값 확보.
- **M-LOAD-4 → M-LOAD-5** 직선 의존 — N=1 의 함수 형태가 잠긴 뒤 N 변동 측정.
- **M-LOAD-5 → M-LOAD-6** 직선 의존 — 수평 확장 측정의 결과로 Redis 가 knee
  point 에 도달하는지 식별 + 최종 종합 보고서로 닫기.

### 1~3단계 PLAN 과의 격리 확인

본 PLAN 의 모든 마일스톤은 1~3단계 PLAN(`docs/plan/`, `docs/plan-phase3/`)의 산출물을
**변경하지 않는다**. 본 PLAN 은 다음만 추가/변경한다:

- **추가:** `docker/k6/` (k6 시나리오), `docs/prd-phase4/results/` (측정 결과 commit).
- **변경:** `docker-compose.yml` 에 `k6` 서비스 1건 추가 (기존 5 서비스는 변경 없음).
- **변경 (M-LOAD-6 인계):** `docs/prd-phase3/04-slo-and-alerts.md` §3.1 의 SLO
  임계 숫자만 갱신 (SLI PromQL 형태 / 측정 윈도우 / burn rate 는 변경 금지 — 3단계
  I6.1, I6.2 유지). 본 갱신은 별도 PR 트리거.

```
1~2단계 PLAN (완료):
M1 → M2 → M3 → M4 → M5 → M6 → M7
                                  │
                                  ▼
3단계 PLAN (완료):
M-OBS-1 → M-OBS-2 → M-OBS-3 → M-OBS-4 → M-OBS-5 → M-OBS-6
                                                          │
                                                          ▼ (3단계 완료 + 본 PLAN 승인 후)
4단계 PLAN (본 묶음):
M-LOAD-1 → M-LOAD-2 → M-LOAD-3 → M-LOAD-4 → M-LOAD-5 → M-LOAD-6
```

---

## 3. 마일스톤별 Exit Criteria 요약

각 마일스톤 상세 파일이 더 자세히 다룬다. 본 표는 한눈 보기용.

### M-LOAD-1 — Bootstrap

- `docker-compose.yml` 에 `k6` 서비스 추가. depends_on api/worker. cgroup 한정값
  (`cpus`/`mem_limit`) 명세 (Q-LOAD-2).
- `docker/k6/` 디렉터리 + `scenarios/` 골격 + 측정 호스트 메타데이터 헬퍼 스크립트
  (CPU/메모리/OS/Docker/k6 버전/git commit/측정 일시 수집).
- `docs/prd-phase4/results/` 디렉터리 + `README.md` (보고서 형식 정합 + 첫 행
  플레이스홀더).
- 회귀 가드: `pnpm typecheck` 0 errors, `pnpm test` 그린, `docker compose config` pass,
  1~3단계 IT + UT 전건 그린.

### M-LOAD-2 — LP-1 baseline 측정

- LP-1 (R=10, P=small 고정, W=~6.5분) k6 시나리오 작성 + happy-path stub 수신자.
- `docker/k6/run.sh` (또는 등가) 측정 실행 스크립트. cgroup 한정값 적용 + Prometheus
  query 시점 기록 + 메타데이터 수집.
- 첫 결과 보고서 `docs/prd-phase4/results/LP-1_<date>.md` commit. 측정 분산 ±5% 안
  확인.
- Exit: AC4.4 측정 프로토콜 통과 + 회귀 가드 그린.

### M-LOAD-3 — LP-2 nominal sustained

- LP-2 (R=100, P=80/15/5, W=~32분) k6 시나리오. 페이로드 결정성 패딩.
- IT-S3 변형 (stub 가 K회 5xx 후 200) / IT-S4 변형 (항상 5xx) / IT-S5 변형 (항상 4xx)
  의 부하 인가.
- 결과 보고서 `docs/prd-phase4/results/LP-2_<date>.md` + 변형별 별도 행.
- Exit: SLO 잠정값 분포 확보(99.5% / 0.5s / 5s / 1%) + 회귀 가드 그린.

### M-LOAD-4 — LP-3 stress + LP-4 spike

- LP-3 (R=500, P=large 고정, W=~32분) — knee point 1차 탐색 영역.
- LP-4 (base 100 → spike 1000 → base 100, 30s spike, total ~15분) — 큐 길이 회복
  시간 측정.
- 결과 보고서 `LP-3_<date>.md` + `LP-4_<date>.md`. knee point 후보 식별 (Redis CPU /
  p99 / 큐 길이 중 어느 것이 먼저 비선형 진입).
- Exit: knee point 후보 식별 + 회귀 가드 그린.

### M-LOAD-5 — 수평 확장 측정

- N ∈ {1, 2, 5, 10} 각각에 대해 LP-2 sustained 측정. `docker compose up --scale worker=N`.
- 처리량(N) / p99(N) / 큐 길이(N) 의 함수 형태 측정.
- SLO-H-1 (`처리량(N) ≥ 처리량(1) × N × 0.8`) / SLO-H-2 (`p99(N) ≤ p99(1) × 1.2`)
  검증.
- 결과 보고서 `docs/prd-phase4/results/horizontal-scaling_<date>.md`.
- Exit: SLO-H-1/H-2 통과 또는 위반 시 사유(자원 경합 / Redis 한계) 식별 + 회귀
  가드 그린.

### M-LOAD-6 — Redis knee + 최종 종합 보고서

- Redis CPU / 메모리 / 네트워크 한계 식별 (M-LOAD-4 knee point 후보 + M-LOAD-5
  수평 확장 결과 종합).
- HA / Cluster 트리거 조건 명문화 (예: "운영 RPS X 부근 + N≥Y 인스턴스 → HA 검토").
- 전체 LP × N 결과 종합 보고서 `docs/prd-phase4/results/final_<date>.md` — PRD `03`
  §5.1 의 갱신된 SLO 임계 표를 실측 값으로 채움.
- `docs/prd-phase3/04-slo-and-alerts.md` §3.1 의 SLO 임계 숫자 갱신 PR 트리거
  (p99 × 1.5, Q-LOAD-9 정합). 본 PR 은 M-LOAD-6 종료 후 별도 commit.
- Exit: 최종 게이트(§5) 통과.

---

## 4. 마일스톤 간 회귀 방지 약속

- 각 마일스톤 종료 시점에 **이전 모든 마일스톤의 측정 결과 commit + 1~3단계 회귀
  가드** 가 그린이어야 다음 마일스톤 진입.
- 이를 위해 각 마일스톤 PLAN 은 §회귀 점검 단계를 둔다.
- 1~3단계 IT 회귀 보장:
  - IT-S1~S7 + 보강(IT-S1b, IT-S2b, IT-S6b).
  - IT-R1(보강) + IT-OBS-1~12.
  - UT-1~6 + 보강 (metrics-c-catalog, metrics-d-w-catalog 등).
  - 본 PLAN 의 어떤 측정도 위 가드를 변경하거나 약화시키지 않는다.
- 부수 효과 금지: 본 PLAN 의 k6 시나리오 / 측정 스크립트는 `packages/` 코드를 변경
  하지 않는다. 측정 입력은 외부 HTTP 요청만 (정상 `POST /webhooks` 또는 stub 수신자
  변형).

---

## 5. 본 PLAN 의 자체 가드

- **범위 통제(CLAUDE.md §7-3):** 부록 트랙 / 운영 PRD 항목 / 새 메트릭은 어떤
  마일스톤 PLAN 에서도 다루지 않는다. 위반 발견 시 PR 거절.
- **PRD 단일 출처(자율 일탈 사전 승인 강화):** 본 PLAN 실행 중 PRD 가 잠그지 않은
  모호 영역을 만나면 작업을 멈추고 [`00-decisions-needed.md`](./00-decisions-needed.md)
  에 `Q-LOAD-N-PLAN-M` 으로 추가한다. 임의 결정 금지.
- **결과 보고서 commit 정책:** 측정 실행 → 결과 보고서 commit → push 가 1 사이클.
  중간 실패 시 보고서에 "실패 사유" 절을 명시 + 사용자 검토. 부분 측정 결과를 commit
  안 하는 결정은 사용자에게 위임.
- **SLO 임계 갱신 PR 의 글자 단위 정합:** M-LOAD-6 의 SLO 갱신 PR 은 `prd-phase3/04`
  §3.1 표의 **숫자만** 변경. SLI PromQL / 측정 윈도우 / burn rate 변경 금지.

---

## 6. 최종 게이트 (M-LOAD-6 종료 시점)

본 PLAN 의 완료 조건:

- M-LOAD-1~6 의 모든 Exit Criteria 통과.
- `docs/prd-phase4/results/` 에 LP-1/LP-2/LP-3/LP-4 + horizontal-scaling + final
  결과 보고서 모두 commit.
- 1~3단계 IT + UT 전건 그린 유지.
- `prd-phase3/04` §3.1 SLO 임계 갱신 PR 인계.
- PRD `00-overview` §5 AC4.0~4.7 의 모든 항목 만족.

---

## 7. 다음 단계

1. 본 문서 + README + 00-decisions-needed 가 사용자에게 승인되면 outline 단계 완료.
2. M-LOAD-1 PLAN 상세 파일(`02-m-load-1-bootstrap.md`) 부터 순차 작성 — 별도
   commit 시리즈 또는 서브에이전트 위임.
3. 각 마일스톤 PLAN 이 작성된 후 실제 측정 단계 진입 (코드/시나리오 작성 + 측정
   + 결과 commit).
