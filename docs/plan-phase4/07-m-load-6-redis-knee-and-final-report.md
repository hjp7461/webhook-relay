# 07. M-LOAD-6 — Redis knee point + 최종 종합 보고서 + SLO 임계 갱신 PR 트리거

> **PLAN 진입 조건:** M-LOAD-5 완료 — N 매트릭스 결과 보고서 commit + SLO-H-1/H-2
> 검증 결과 명시. PRD Q-LOAD-1~13 전건 Resolved. 1~3단계 IT + UT 전건 그린.
>
> **AI 협업 5원칙 적용:** 본 마일스톤은 **PLAN 묶음의 최종 게이트** 다. M-LOAD-4
> knee point 후보 + M-LOAD-5 수평 확장 결과를 종합해 Redis 단일 인스턴스의 한계를
> 식별 (Q-LOAD-4 (a) 정합) + HA/Cluster 트리거 조건 명문화 + `prd-phase3/04`
> §3.1 SLO 임계 갱신 PR 인계 (Q-LOAD-9 (a) p99 × 1.5 적용).
>
> **본 PLAN 의 최종 마일스톤이며 다음 단계는 PLAN closeout.** 본 마일스톤이 끝난
> 후 추가 4단계 작업이 필요하면 별도 PRD/PLAN 묶음 (예: Redis HA PRD, 카오스
> 엔지니어링 PRD) 으로 진입.
>
> **본 마일스톤이 명시적으로 다루지 않는 것:** Redis HA / Cluster / Sentinel 도입
> (N4.2 정합 — 트리거 조건 명문화만), 카오스 엔지니어링(N4.3 정합), 부록 트랙
> (N4.4 정합), 운영 배포 자동화(N4.5 정합), 외부 수신자 측 성능 측정(N4.7 정합).

---

## 1. 진입 조건

- M-LOAD-5 Exit Criteria 전건 통과 (`06-m-load-5-horizontal-scaling.md` §6).
- 본 마일스톤이 의존하는 PRD 결정 잠금:
  - Q-LOAD-4 (a) Redis 단일 인스턴스 한계 식별 → 본 마일스톤이 HA/Cluster 트리거
    조건 명문화.
  - Q-LOAD-9 (a) p99 × 1.5 → SLO 임계 갱신 PR 의 산출 규칙.
  - Q-LOAD-12 (a) Markdown 표 → `docs/prd-phase4/results/final_<date>.md`.
- M-LOAD-2~5 의 모든 결과 보고서가 commit + 측정 분산 ±5% 안 + 메타데이터 8 항목
  완전성.

## 2. 선행 의존

- **마일스톤:** M-LOAD-2, M-LOAD-3, M-LOAD-4, M-LOAD-5 (전건 완료).
- **PRD 결정 잠금:** Q-LOAD-4, Q-LOAD-9, Q-LOAD-12.
- **1~3단계 결정 정합:**
  - `prd-phase3/04` §3.1 SLO 임계 표의 **숫자만** 갱신 (PRD `prd-phase4/03` §5.2
    + §5.3 정합). SLI PromQL 형태 / 측정 윈도우 (`[5m]` / `[1h]` / 28d/7d/1d) /
    burn rate 표준값 (14.4× / 6×, I6.2) 은 변경 금지.
  - `docker/prometheus/rules/*.yaml` 의 임계 숫자만 동시 갱신 (PRD `prd-phase4/03`
    §6.3 [3] 단계).
- **자율 일탈 사전 승인 규칙:**
  - HA/Cluster 트리거 조건 5종 (T1~T5, PRD `prd-phase4/04` §6.2) 외 추가 트리거
    조건 도입 금지.
  - SLO 재조정 PR 의 본문 형식 (비교 표 형식, cross-link 라인) 의 사소한 결정은
    발생 시 사용자 보고 + 결정 위임 (`00-decisions-needed.md` §3 후보 모호 영역
    3번 정합).
  - 측정 결과가 SLO 잠정값을 크게 벗어나는 경우 (예: 실측 p99 > 3단계 잠정 임계
    의 1.5× 이상) PLAN 중단 vs 측정 변수로 기록 결정은 사용자 위임.

## 3. 측정 우선 시퀀스 (종합 분석 → 최종 보고서 commit → SLO 갱신 PR 인계)

본 마일스톤은 **새 측정을 실행하지 않는다** (선택 사항: knee point 정밀 식별을
위한 미세 N 매트릭스, 사용자 결정 위임). M-LOAD-2~5 의 결과 commit 을 종합 분석.

### 3.1 Redis knee point 식별 (PRD `prd-phase4/04` §5.3 절차 정합)

```
[1] LP-3 결과 보고서(M-LOAD-4) + horizontal-scaling 결과 보고서(M-LOAD-5) 종합
    └ LP-3 의 선형성(N=1, R=500) 의 bound 원인 (CPU / 메모리 / 네트워크 / 워커 경합)
    └ horizontal-scaling 의 N 매트릭스에서 어느 N 에서 SLO-H-1 (α=0.8) 위반
    └ horizontal-scaling 의 N 매트릭스에서 어느 N 에서 SLO-H-2 (β=1.2) 위반

[2] Redis 자원 지표 (M-LOAD-4 LP-3 측정 시 수집한 `redis-stats.json`) 검토
    └ Redis CPU 사용률 (W_load 평균 / W_load 의 90% 이상 구간 비율)
    └ Redis 메모리 사용률
    └ Redis 네트워크 처리량 (호스트 네트워크 한계 대비)

[3] Knee point 의 판정 (PRD `prd-phase4/04` §5.3 [4] 단계)
    └ Redis CPU > 80% 지속 (W_load 의 90% 이상 구간) → Redis CPU bound
    └ Redis 메모리 > 80% → 메모리 bound
    └ Redis 네트워크 > 호스트 네트워크 한계의 80% → 네트워크 bound
    └ 셋 다 아니면 → 본 시스템 워커 자원 경합 (Redis 외 원인)

[4] Knee point 표현 (PRD `prd-phase4/04` §5.4 표 형식)
    └ knee point N (또는 RPS) + bound 원인 + LP-ID + 측정 메타데이터
```

### 3.2 HA / Cluster 트리거 조건 명문화 (PRD `prd-phase4/04` §6.2 정합)

본 마일스톤이 명문화하는 5 트리거 조건 (T1~T5) 의 운영 임계:

| 트리거 | 측정 지표 | 임계 |
|--------|------------|------|
| **T1 Redis CPU 포화** | Redis CPU 사용률 | > 80% 지속 (1시간 윈도우의 50% 이상 구간) |
| **T2 Redis 메모리 포화** | Redis 메모리 사용률 | > 80% |
| **T3 본 시스템 knee point 가 운영 부하 안에 들어옴** | knee point RPS < 운영 평균 RPS × 2 (margin) | (운영 측정) |
| **T4 SLO-3 전달 지연 위반 지속** | 3단계 SLO-3 burn rate alert 14.4× 가 N 증가로도 회복 안 됨 | (`prd-phase3/04` §5.2.2) |
| **T5 SLO-4 DLQ 적재율 위반 지속** | 3단계 SLO-4 burn rate alert 가 N 증가로도 회복 안 됨 | (`prd-phase3/04` §5.2.3) |

본 5 트리거 조건은 최종 보고서 + PRD `prd-phase4/04` §6.2 cross-link.

### 3.3 SLO 재조정 규칙 적용 (Q-LOAD-9 (a) p99 × 1.5)

PRD `prd-phase4/03` §4.4 의 적용:

| SLO | 3단계 잠정값 | 실측 p99 (M-LOAD-2~5 종합) | 재조정 임계 = p99 × 1.5 |
|-----|---------------|-------------------------------|----------------------------|
| SLO-1 가용성 | 5xx ≤ 0.5% | (실측 5xx 비율 평균) | (변형 규칙 §4.5 적용) |
| SLO-2 등록 지연 | p99 ≤ 0.5s | (실측 p99) | (실측 p99 × 1.5) |
| SLO-3 전달 지연 | p99 ≤ 5s | (실측 p99) | (실측 p99 × 1.5) |
| SLO-4 DLQ 적재율 | ≤ 1% | (실측 DLQ 적재율 평균) | (변형 규칙 §4.5 적용) |

**비율 SLI (SLO-1 / SLO-4) 의 변형 적용 (PRD `prd-phase4/03` §4.5):**

- SLO-1: 실측 5xx 비율의 평균 × 1.5. 실측이 0 인 경우 3단계 잠정값 (0.5%) 유지.
- SLO-4: 실측 DLQ 적재율의 평균 × 1.5. LP-N 별 적재율 중 가장 보수적인(높은)
  LP 값 채택. 실측이 0 인 경우 잠정값 (1%) 유지.

### 3.4 측정 결과 무효 조건 (본 마일스톤 단독 가드)

본 마일스톤은 새 측정을 실행하지 않지만 종합 분석의 무효 조건:

- M-LOAD-2~5 결과 보고서 중 하나라도 메타데이터 8 항목 누락 → 본 보고서 무효.
- M-LOAD-2~5 측정의 git commit SHA 가 서로 다름 → 재현성 위반. 본 마일스톤
  전체 재측정.
- M-LOAD-2~5 측정의 호스트 사양 / cgroup 한정값이 서로 다름 → 일관성 위반. 본
  마일스톤 전체 재측정 또는 사용자 결정.

## 4. 구현 단계 (커밋 단위)

각 번호는 1 commit. 본 마일스톤의 총 commit 수는 4건 (선택 사항으로 5건).

### 단계 1 — `docs(prd-phase4/results): commit final synthesis report`

- `docs/prd-phase4/results/final_<date>.md` 신규 생성. 형식:
  - **YAML 헤더** — M-LOAD-2~5 결과 보고서의 메타데이터 일관성 검증 + 본 종합
    보고서의 작성 일시.
  - **§1 종합 측정 결과 요약** — LP-1 ~ LP-4 + horizontal-scaling 결과 보고서
    cross-link.
  - **§2 Redis knee point 식별 (§3.1 절차 적용):**
    - knee point N (또는 RPS).
    - bound 원인 (CPU / 메모리 / 네트워크 / 워커 경합).
    - 신뢰도 (LP-3 / LP-2 N=10 의 결과 일치도).
  - **§3 HA / Cluster 트리거 조건 (§3.2 5 트리거):**

    | 트리거 | 측정 지표 | 임계 | 운영 모니터링 권고 |
    |--------|------------|------|----------------------|
    | T1 | Redis CPU | > 80% 1h | redis_exporter 도입 (별도 PR) |
    | T2 | Redis 메모리 | > 80% | redis_exporter 도입 |
    | T3 | knee point RPS < 운영 RPS × 2 | (운영 측정) | knee point RPS 비교 |
    | T4 | 3단계 SLO-3 burn rate | (3단계 표준) | 이미 3단계가 처리 |
    | T5 | 3단계 SLO-4 burn rate | (3단계 표준) | 이미 3단계가 처리 |

  - **§4 SLO 재조정된 임계 표 (§3.3 결과)** — PRD `prd-phase4/03` §5.1 표를 실측
    값으로 채움:

    | SLO | 3단계 잠정값 | 실측 | 재조정 임계 (p99 × 1.5) |
    |-----|---------------|------|----------------------------|
    | SLO-1 가용성 | 5xx ≤ 0.5% | ... | ... |
    | SLO-2 등록 지연 | p99 ≤ 0.5s | ... | ... |
    | SLO-3 전달 지연 | p99 ≤ 5s | ... | ... |
    | SLO-4 DLQ 적재율 | ≤ 1% | ... | ... |

  - **§5 SLO-H-1 / SLO-H-2 검증 결과 종합** — 본 PRD 가 새로 정의한 수평 확장
    SLO 의 실측 분포.
  - **§6 운영 권고 사항:**
    - HA / Cluster 도입 우선순위 (T1~T5 중 어느 트리거가 가장 가까운가).
    - SLO 재조정 PR 의 인계 절차 (단계 2~3).
    - 4단계 후속 PRD 권고 (Redis HA / 카오스 엔지니어링 / 운영 배포 자동화 — 본
      PRD 범위 밖).
  - **§7 본 PLAN 의 closeout 체크리스트** — `09-acceptance-gates.md` §7 최종 게이
    트 cross-link.
- **commit 메시지:** "M-LOAD-6: 4단계 PLAN 묶음 최종 종합 보고서. LP-1~LP-4 +
  horizontal-scaling 결과 종합. Redis knee point 식별 + HA/Cluster 트리거 조건
  + SLO 재조정 임계 산출."

### 단계 2 — `docs(plan-phase4): document SLO threshold update PR template`

- 본 단계는 별도 commit 으로 SLO 임계 갱신 PR 의 본문 형식만 명세. 실제 PR
  발행은 단계 3.
- 본 PLAN 의 본 마일스톤 파일 (`07-m-load-6-...md`) §11 절(아래) 에 PR 본문
  template 을 잠금:
  - **PR 제목:** `docs(prd-phase3/04): rebaseline SLO thresholds from phase 4
    measurements (yyyy-mm-dd)`.
  - **PR 본문 형식:**
    - §1 배경 — 본 PR 의 측정 출처 (`docs/prd-phase4/results/final_<date>.md`
      cross-link).
    - §2 갱신 대상 (글자 단위 정합) — `prd-phase3/04` §3.1 표의 임계 숫자만 +
      `docker/prometheus/rules/*.yaml` 의 PromQL 임계.
    - §3 갱신 금지 항목 — SLI PromQL 형태 / 측정 윈도우 / burn rate 표준값 / 알람
      YAML 구조.
    - §4 비교 표 — 3단계 잠정값 → 본 PRD 재조정 임계 → 본 PR 의 갱신값.
    - §5 검증 — 갱신된 임계로 알람 발화 정확도 변동 확인 (재측정 필요 시 후속 PR).
- **금지:** 본 단계의 commit 안에서 `prd-phase3/04` 또는 `docker/prometheus/rules/`
  본문을 변경하지 않는다. 본 단계는 PR template 의 명세만.

### 단계 3 — 실제 SLO 임계 갱신 PR 발행 (별도 commit 시리즈 — 본 PLAN 묶음의 인계 산출물)

- 본 단계는 본 PLAN 묶음 안에서 별도 commit 시리즈로 처리. 본 PLAN 의 본 마일스톤
  파일에는 인계 절차만 명세하며 실제 갱신 PR 의 commit 은 본 마일스톤 §4 단계 3
  의 사람 수동 결정 진행.
- 갱신 절차 (PRD `prd-phase4/03` §6.3 정합):
  1. `prd-phase3/04` §3.1 표의 임계 숫자만 갱신 — SLO-1 (5xx 비율) / SLO-2 (p99)
     / SLO-3 (p99) / SLO-4 (적재율).
  2. `docker/prometheus/rules/*.yaml` 의 PromQL 의 임계 숫자 동시 갱신 (예:
     `> (14.4 * 0.005)` 의 `0.005` 부분 등).
  3. `prd-phase3/04` §3.4 "잠정값" 표기를 "실측 기반 갱신 (yyyy-mm-dd,
     `docs/prd-phase4/results/final_<date>.md`)" 로 변경 (PRD `prd-phase4/05` §4
     C-LOAD-7 정합).
  4. 본 갱신이 알람 발화 정확도에 미치는 영향을 후속 측정으로 확인 (별도 commit
     시리즈).

> **본 단계는 commit 으로 잠그지 않는다.** 본 PLAN 의 commit 시퀀스(M-LOAD-1~6)
> 가 끝난 후 사용자가 단계 3 의 실제 갱신 PR 을 별도 commit 시리즈로 발행. 본
> PLAN 본문은 인계 절차의 단일 출처.

### 단계 4 — `docs(plan-phase4): mark PLAN closeout + cross-link final report`

- 본 PLAN 의 본 마일스톤 파일 (`07-m-load-6-...md`) §10 절(아래) 에 PLAN closeout
  체크리스트 잠금:
  - M-LOAD-1~6 의 모든 Exit Criteria 통과.
  - `docs/prd-phase4/results/` 에 LP-1 / LP-2 / LP-3 / LP-4 / horizontal-scaling
    / final 결과 보고서 모두 commit.
  - 1~3단계 IT + UT 전건 그린 유지.
  - `prd-phase3/04` §3.1 SLO 임계 갱신 PR 인계 (단계 3).
  - PRD `prd-phase4/00-overview` §5 AC4.0~4.7 의 모든 항목 만족.
- 본 단계의 commit 은 본 PLAN 의 본 마일스톤 파일 자체의 변경 없이, **최종 보고
  서(`final_<date>.md`) 가 본 PLAN closeout 의 단일 출처임을 명시**. 즉 본 단계
  의 commit 메시지가 "PLAN closeout 선언" 의 단일 출처.
- **commit 메시지:** "4단계 PLAN 묶음 closeout. M-LOAD-1~6 전건 완료. SLO 임계
  갱신 PR 은 별도 commit 시리즈로 인계 (`docs/prd-phase4/results/final_<date>.md`
  §6 운영 권고 사항 cross-link)."

### 단계 5 (선택) — `docs(prd-phase4/results): micro N matrix supplement` (사용자 결정 위임)

- knee point 정밀 위치 식별이 필요해지면 N=3 / 4 / 6 / 7 / 8 의 미세 매트릭스 추가
  측정 (PRD `prd-phase4/04` §5.5 한계 정합).
- 본 단계는 **자율 일탈 사전 승인 규칙 안 사용자 결정 위임**. 본 PLAN 의 commit
  시퀀스에서 본 단계를 실행할지는 사용자가 단계 1~4 후 결정.
- 실행 결정 시: `docs/prd-phase4/results/micro-n-matrix_<date>.md` 신규 commit.

> **단계 4 이후 회귀 점검:** `pnpm typecheck` 0 errors, `pnpm test` 그린, 1~3단계
> IT + UT 전건 그린, `docker compose config` 유효, 최종 보고서 commit 등장.

## 5. 생성/수정할 파일 목록 (절대경로)

### 생성

- `/Users/connor/biz/webhook-relay/docs/prd-phase4/results/final_<date>.md`
  (단계 1)
- `/Users/connor/biz/webhook-relay/docs/prd-phase4/results/micro-n-matrix_<date>.md`
  (단계 5, 선택)

### 수정

- (본 마일스톤은 코드/시나리오/PRD/3단계 PLAN 본문 변경 0건. 단계 3 의 SLO 임계
  갱신 PR 은 별도 commit 시리즈 — 본 PLAN 의 commit 시퀀스 외.)

### 절대 만들지/수정하지 않는 것

- `packages/**` — 본 마일스톤 코드 변경 0건.
- `docker/k6/scenarios/lp-*.js`, `scripts/*.sh` — 본 마일스톤은 새 시나리오/스크
  립트 추가 0건.
- `docker-compose.yml`, `docker/prometheus.yml`, `docker/grafana/**` — 본 마일스
  톤 변경 0건.
- `docs/plan-phase4/README.md`, `00-decisions-needed.md`, `01-milestones.md` —
  outline 3 파일 변경 0건.
- `docs/prd-phase4/00~05.md` — PRD 본문 변경 0건. (단계 3 의 SLO 임계 갱신 PR 도
  `prd-phase3/04` 만 변경하며 `prd-phase4/` 는 변경하지 않음.)
- `docs/prd-phase3/04-slo-and-alerts.md` — 본 PLAN 의 commit 시퀀스 안에서는
  변경 0건. 단계 3 의 별도 commit 시리즈가 갱신.
- `docker/prometheus/rules/*.yaml` — 본 PLAN 의 commit 시퀀스 안에서는 변경 0건.
  단계 3 의 별도 commit 시리즈가 갱신.

## 6. 수용 기준 / Done 정의

본 절은 outline `01-milestones.md` §3 M-LOAD-6 의 Exit Criteria 와 글자 단위
정합 + 본 마일스톤 보강 항목.

- [ ] Redis CPU / 메모리 / 네트워크 한계 식별 (M-LOAD-4 knee point 후보 + M-LOAD-5
  수평 확장 결과 종합).
- [ ] HA / Cluster 트리거 조건 명문화 (예: "운영 RPS X 부근 + N≥Y 인스턴스 → HA
  검토").
- [ ] 전체 LP × N 결과 종합 보고서 `docs/prd-phase4/results/final_<date>.md` — PRD
  `03` §5.1 의 갱신된 SLO 임계 표를 실측 값으로 채움.
- [ ] `docs/prd-phase3/04-slo-and-alerts.md` §3.1 의 SLO 임계 숫자 갱신 PR 트리거
  (p99 × 1.5, Q-LOAD-9 정합). 본 PR 은 M-LOAD-6 종료 후 별도 commit.
- [ ] 최종 게이트(§5) 통과.

### 보강 항목 (본 마일스톤 단위)

- [ ] M-LOAD-2~5 결과 보고서의 메타데이터 일관성 검증 — 같은 호스트 사양 / cgroup
  한정값 / git commit SHA.
- [ ] HA/Cluster 트리거 조건 5종 (T1~T5) 의 운영 모니터링 권고가 결과 보고서에
  명시.
- [ ] SLO-1 / SLO-4 비율 SLI 의 변형 적용(§4.5) 이 실측 0 인 경우 잠정값 유지
  로 명시.
- [ ] SLO 임계 갱신 PR template (단계 2 §11 절) 이 글자 단위 잠금 (`prd-phase3/04`
  §3.1 의 임계 숫자만 + `docker/prometheus/rules/*.yaml` 의 PromQL 임계).
- [ ] PLAN closeout 체크리스트 (§10 + `09-acceptance-gates.md` §7) 전건 통과.
- [ ] 본 PLAN 범위 안 파일만 수정 — outline 3 파일 mtime 변경 0건, `prd-phase3/`
  변경 0건, `packages/` 변경 0건.

## 7. PRD 역참조

| 본 마일스톤 항목 | PRD 절 |
|------------------|---------|
| Redis knee point 식별 절차 | `prd-phase4/04` §5.3 + Q-LOAD-4 (a) |
| HA/Cluster 트리거 조건 (T1~T5) | `prd-phase4/04` §6.2 |
| SLO 재조정 규칙 (p99 × 1.5) | `prd-phase4/03` §4 + Q-LOAD-9 (a) |
| 비율 SLI 변형 (SLO-1 / SLO-4) | `prd-phase4/03` §4.5 |
| 갱신된 SLO 임계 형식 | `prd-phase4/03` §5.1 |
| 갱신 금지 항목 (SLI PromQL / 윈도우 / burn rate) | `prd-phase4/03` §5.3 + I6.1 / I6.2 |
| SLO 갱신 PR 인계 절차 | `prd-phase4/03` §6 |
| 최종 보고서 형식 | `prd-phase4/02` §6 + Q-LOAD-12 (a) |
| PLAN closeout | `prd-phase4/00-overview` §5 AC4.0~4.7 |

## 8. 결정 의존

- **Q-LOAD-4** (a) Redis 단일 인스턴스 한계 식별 — knee point + HA 트리거.
- **Q-LOAD-9** (a) p99 × 1.5 — SLO 재조정 규칙.
- **Q-LOAD-12** (a) Markdown 표 — 최종 보고서 형식.
- **1~3단계 결정 정합:** 3단계 I6.1 (SLO 형태 안정성) + I6.2 (burn rate 패턴 보존)
  + I3.1 (메트릭 이름 안정성) + I3.2 (라벨 enum 폐쇄성) 보존. 본 PLAN 의 SLO 갱신
  PR 은 임계 숫자만 갱신.

> 모든 결정 2026-05-27 Resolved.

## 9. 회귀 점검

본 마일스톤이 끝나는 시점에 다음이 모두 그린:

- `pnpm typecheck` 0 errors.
- `pnpm test:unit` — UT-1~6 + 보강.
- `pnpm test:integration` — IT-S1~S7, IT-S1b, IT-S2b, IT-S6b, IT-R1, IT-OBS-1~12
  전건 그린 + M-LOAD-3 신규 `receiver-variants` 그린.
- `docker compose config` 유효. 1~3단계 데모 그대로 동작.
- **부수 효과 0건 검증:** 본 마일스톤은 측정/코드 변경 0건. 종합 분석 + 최종 보고
  서 commit + PR template 명세만.

> **단계 3 의 SLO 임계 갱신 PR 발행 후 회귀:** 별도 commit 시리즈 진행 후 알람
> 발화 정확도 변동을 후속 측정으로 확인 (본 PLAN 범위 밖, 별도 PR).

## 10. 본 마일스톤 후 데모 상태 + PLAN closeout 체크리스트

### 데모 상태

- 일반 `docker compose up` 후 1~3단계 데모 그대로 동작.
- `docs/prd-phase4/results/` 에 LP-1 / LP-2 / LP-3 / LP-4 / horizontal-scaling /
  final 결과 보고서 6건 commit.
- 4단계 PLAN 묶음의 최종 인계 산출물:
  - SLO 임계 갱신 PR (별도 commit 시리즈) — `prd-phase3/04` §3.1 + `docker/prometheus/rules/*.yaml`
    의 임계 숫자.
  - 본 시스템의 수평 확장 능력 정량 측정값 (SLO-H-1 / SLO-H-2 검증 결과).
  - Redis 단일 인스턴스 한계 식별 + HA/Cluster 트리거 조건 (T1~T5).

### PLAN closeout 체크리스트 (단계 4 commit 의 단일 출처)

- [ ] M-LOAD-1 Exit Criteria 전건 통과 (`02-m-load-1-bootstrap.md` §6).
- [ ] M-LOAD-2 Exit Criteria 전건 통과 (`03-m-load-2-lp1-baseline.md` §6).
- [ ] M-LOAD-3 Exit Criteria 전건 통과 (`04-m-load-3-lp2-nominal.md` §6).
- [ ] M-LOAD-4 Exit Criteria 전건 통과 (`05-m-load-4-lp3-lp4.md` §6).
- [ ] M-LOAD-5 Exit Criteria 전건 통과 (`06-m-load-5-horizontal-scaling.md` §6).
- [ ] M-LOAD-6 Exit Criteria 전건 통과 (본 파일 §6).
- [ ] `docs/prd-phase4/results/` 에 6 결과 보고서 모두 commit.
- [ ] 1~3단계 IT + UT 전건 그린 유지.
- [ ] PRD `prd-phase4/00-overview` §5 AC4.0~4.7 만족.
- [ ] SLO 임계 갱신 PR 인계 (단계 3) — 별도 commit 시리즈로 진행.
- [ ] outline 3 파일 변경 0건 + `prd-phase4/00~05.md` 변경 0건 + `prd-phase3/`
  변경 0건 (단계 3 의 별도 commit 시리즈 외).

## 11. SLO 임계 갱신 PR template (단계 2 의 단일 출처)

본 절은 단계 2 의 commit 이 잠그는 PR template. 단계 3 의 실제 PR 발행 시 글자
단위 정합.

### PR 제목

```
docs(prd-phase3/04): rebaseline SLO thresholds from phase 4 measurements (yyyy-mm-dd)
```

### PR 본문

```
## §1 배경

본 PR 은 4단계 PRD(`docs/prd-phase4/`) 의 측정 결과로 3단계 SLO 잠정값
(99.5% / 0.5s / 5s / 1%) 의 임계 숫자만 재조정한다.

- 측정 결과 출처: `docs/prd-phase4/results/final_<date>.md`
- 재조정 규칙: Q-LOAD-9 (a) p99 × 1.5 (Google SRE Workbook 권고)
- 비율 SLI (SLO-1 / SLO-4): PRD `prd-phase4/03` §4.5 변형 적용

## §2 갱신 대상 (글자 단위 정합)

본 PR 이 변경하는 항목:

- `docs/prd-phase3/04-slo-and-alerts.md` §3.1 표의 "목표" 열의 임계 숫자.
- `docs/prd-phase3/04-slo-and-alerts.md` §3.4 "잠정값" 표기 → "실측 기반 갱신
  (yyyy-mm-dd, `docs/prd-phase4/results/final_<date>.md`)".
- `docker/prometheus/rules/*.yaml` 의 PromQL 임계 숫자 (예: `> (14.4 * 0.005)`
  의 `0.005` 부분 등).

## §3 갱신 금지 항목 (3단계 I6.1 / I6.2 / I3.1 / I3.2 정합 유지)

본 PR 이 변경하지 않는 항목:

- SLI PromQL 형태 (메트릭 이름 / 라벨 / 집계 함수).
- 측정 윈도우 (`[5m]` / `[1h]` / 28d / 7d / 1d / 1h).
- burn rate 표준값 (14.4× / 6×).
- 알람 규칙 YAML 의 구조 (group / for / labels / annotations).
- 메트릭 이름 / 라벨 enum.

## §4 비교 표

| SLO | 3단계 잠정값 | 4단계 실측 | 본 PR 갱신값 (p99 × 1.5) |
|-----|---------------|------------|----------------------------|
| SLO-1 가용성 | 5xx ≤ 0.5% | (실측) | (갱신) |
| SLO-2 등록 지연 | p99 ≤ 0.5s | (실측) | (갱신) |
| SLO-3 전달 지연 | p99 ≤ 5s | (실측) | (갱신) |
| SLO-4 DLQ 적재율 | ≤ 1% | (실측) | (갱신) |

## §5 검증 절차 (후속 PR)

본 PR 의 갱신된 임계가 알람 발화 정확도에 미치는 영향을 후속 측정으로 확인.
재측정 결과는 별도 PR 로 commit.
```

본 template 은 단계 2 의 commit 이 잠그는 단일 출처. 단계 3 의 실제 PR 발행 시
글자 단위 정합 유지.
