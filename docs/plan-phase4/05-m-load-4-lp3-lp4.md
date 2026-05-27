# 05. M-LOAD-4 — LP-3 stress (R=500 · P=large 64KB) + LP-4 spike (100→1000→100) + knee point 1차 탐색

> **PLAN 진입 조건:** M-LOAD-3 완료 — LP-2 4 변형 결과 보고서 commit + 측정 분산
> ±5% 안 + SLO 잠정값 분포 확보. PRD Q-LOAD-1~13 전건 Resolved. 1~3단계 IT + UT
> 전건 그린.
>
> **AI 협업 5원칙 적용:** 본 마일스톤은 **knee point 1차 탐색** 영역이다. 비선형
> 영역 진입 시 (CPU / 메모리 / p99 / 큐 길이) 어떤 SLI 가 먼저 임계에 도달하는지
> 식별 (PRD `prd-phase4/04` §5). knee point 의 정밀 위치는 본 마일스톤이 잠그지
> 않으며 후속 미세 매트릭스(M-LOAD-5 / M-LOAD-6) 가 다룰 수 있는 영역이다(원칙 3
> 범위 통제). OOM / Redis 한계 도달은 측정 변수로 기록(원칙 4 — 임의 결정 금지).
>
> **본 마일스톤이 명시적으로 다루지 않는 것:** 수평 확장 N 매트릭스 측정(M-LOAD-5
> 책임), Redis HA / Cluster 도입(N4.2 정합 — knee point 식별만), 최종 종합 보고서
> (M-LOAD-6 책임), SLO 재조정 PR(M-LOAD-6 책임).

---

## 1. 진입 조건

- M-LOAD-3 Exit Criteria 전건 통과 (`04-m-load-3-lp2-nominal.md` §6).
- 본 마일스톤이 의존하는 PRD 결정 잠금:
  - Q-LOAD-6 (b) 중도 셋 → LP-3 R = 500, LP-4 base=100 / spike=1000.
  - Q-LOAD-8 (b) sustained (LP-3) → W_warmup=60s + W_load=30m + W_cooldown=60s.
  - Q-LOAD-8 (a) 짧은 (LP-4 spike) → W_warmup=60s + W_load=5m + W_cooldown=30s
    (총 ~6.5분이나 spike 구조 안에서 base→spike→base 의 시간 배분이 명세에 따라
    조정).
- LP-2 nominal 영역에서의 SLO 잠정값 분포가 LP-3 stress 영역의 비교 기준선.

## 2. 선행 의존

- **마일스톤:** M-LOAD-3.
- **PRD 결정 잠금:** Q-LOAD-6, Q-LOAD-8, Q-LOAD-12, Q-LOAD-4 (a) Redis 단일
  인스턴스 한계 식별.
- **1~3단계 결정 정합:** LP-3 / LP-4 는 stub 응답이 항상 200 (happy-path) 으로
  사용. IT-S 변형은 LP-2 에서만 측정 (PRD `prd-phase4/01` §3.1 + §6 매핑표).
- **자율 일탈 사전 승인 규칙:**
  - knee point 후보가 N=1 측정에서 식별되지 않으면 본 PLAN 의 N 매트릭스 미세화는
    M-LOAD-5 책임이며 본 마일스톤에서 임의 결정 금지.
  - OOM / Redis 한계 도달 시 PLAN 중단 vs 측정 변수로 기록 결정은 사용자 위임
    (PRD `prd-phase4/04` §5 + `10-risks-and-rollback.md`).
  - LP-3 / LP-4 외 추가 RPS 셋 (예: R=2000, R=5000) 추가 금지 (Q-LOAD-6 (b) 잠금
    범위 외).

## 3. 측정 우선 시퀀스 (LP-3 stress + LP-4 spike 순차)

본 마일스톤은 2 LP 의 순차 측정. LP-3 (sustained) → LP-4 (spike) 의 순서로 진행
하여 stress 영역의 정상 분포 확보 후 spike 회복 시간 측정.

### 3.1 LP-3 stress 측정 (sustained)

- R = 500 RPS, P = large 64KB 고정, T = steady, W = ~32분.
- 페이로드 결정성 패딩 — large 고정 (64KB).
- 측정 의도: knee point 1차 탐색. p99 / 처리량 / 큐 길이가 LP-2 대비 비선형으로
  증가하는지 식별 (PRD `prd-phase4/04` §5.2).
- knee point 후보 식별 (PRD `prd-phase4/04` §5.3 절차 정합):
  - 선형성(N=1, LP-3) = LP-3 처리량 / 기대 처리량(R=500) → 1.0 근처면 knee 미도달,
    < 0.8 면 knee 진입.
  - p99 처리 지연 (W2) 이 LP-2 nominal 대비 어느 정도 증가했는가.
  - 큐 길이 (C1 `queue_depth{job_state="waiting"}`) 가 정상 상태에서 0 근처가
    아닌 어느 값에 머무는가 (워커 포화 신호).
- Redis 자원 지표 확인 (PRD `prd-phase4/04` §5.3 [3] 단계):
  - Redis CPU 사용률 (`docker stats webhook-relay-redis` 또는 `redis-cli INFO cpu`).
  - Redis 메모리 사용률.
  - Redis 네트워크 처리량 (호스트 측 `docker stats`).
- bound 원인 판정 (§5.3 [4] 단계): CPU / 메모리 / 네트워크 / 워커 경합 중 하나.

### 3.2 LP-4 spike 측정 (base → spike → base)

- 패턴: R_base = 100 RPS → R_spike = 1000 RPS → R_base = 100 RPS.
- T_spike = 30s, total 측정 시간 약 15분 (W_base_1=300s + W_warmup_to_spike=10s +
  W_spike=30s + W_recovery_to_base=10s + W_base_2=300s + W_cooldown=60s ≈ 12분
  + warmup 60s = 약 13분, 잠정값. 실제 시간 배분은 본 PLAN step 1 commit 이 잠금).
- P = small 1KB 고정.
- 측정 의도 (PRD `prd-phase4/01` §3.1 LP-4 + `prd-phase4/04` §4.3):
  - spike 구간 동안 C1 `queue_depth{job_state="waiting"}` 가 어떤 최대값에 도달
    하는가.
  - spike 종료 후 큐 길이가 baseline (R=100 정상 상태) 으로 회복되는 시간
    (time-to-recover) 측정.
  - 회복 시간 = (큐 길이가 마지막으로 baseline 분포 안에 들어간 시각) - (spike
    종료 시각).

### 3.3 측정 결과 무효 조건 (PRD `prd-phase4/03` §3.4 정합)

LP-1 / LP-2 와 동일 + 본 마일스톤 보강:

- 메타데이터 8 항목 누락.
- 측정 분산 ±5% 초과 (LP-3 / LP-4 각각). 단, **knee point 영역의 분산은 본질적
  으로 큼** — LP-3 가 knee point 진입 시 ±5% 초과를 무효로 간주할지 vs 측정
  변수로 기록할지는 사용자 결정 (PRD `prd-phase4/04` §5.5 한계 정합).
- 카디널리티 가드 위반.
- Prometheus target up = 0 구간이 W_load 안에 존재.
- k6 의 RPS 도달률이 목표의 ±2% 를 벗어남 (LP-3: 490 ≤ achieved ≤ 510, LP-4
  spike: 980 ≤ achieved ≤ 1020).
- **보강 (LP-3 stress):** Redis 또는 워커가 OOM / panic 발생 시 측정 변수로 기록
  → 보고서 "실패 사유" 절. PLAN 중단 결정은 사용자.
- **보강 (LP-4 spike):** spike 종료 후 큐 길이가 보고서 작성 시점까지 회복되지
  않으면 회복 시간 = "측정 윈도우 초과" 로 기록 (knee point 가 base RPS 안에
  들어왔음을 시사 — 본 PRD `prd-phase4/04` §6.2 T3 트리거 조건).

## 4. 구현 단계 (커밋 단위)

각 번호는 1 commit. 본 마일스톤의 총 commit 수는 6건.

### 단계 1 — `feat(docker/k6/scenarios): add LP-3 stress scenario (R=500, P=large)`

- `docker/k6/scenarios/lp-3.js` 신규 생성. k6 JS 시나리오:
  - `executor: 'constant-arrival-rate'`, `rate: 500`, `timeUnit: '1s'`.
  - `duration: __ENV.DURATION || '30m'`.
  - `preAllocatedVUs: 200`, `maxVUs: 500`.
  - `tags: { lp_id: 'LP-3', stage: __ENV.STAGE || 'load' }`.
  - 페이로드: large 64KB 고정 (결정성 패딩 — `{ event: 'lp-3', _pad: 'x'.repeat(65536 - 64) }`).
  - 대상 URL: `K6_TARGET_URL` (variant 미지정 = normal).
- **회귀 가드:** 다른 LP 시나리오 변경 0건.
- **금지:** RPS = 500 외 임의 변경 0건 (Q-LOAD-6 (b) 잠금). large 외 페이로드
  분포 0건.

### 단계 2 — `feat(docker/k6/scenarios): add LP-4 spike scenario (base 100 → spike 1000 → base 100)`

- `docker/k6/scenarios/lp-4.js` 신규 생성. k6 JS 시나리오:
  - `executor: 'ramping-arrival-rate'`.
  - `stages`:

    ```js
    stages: [
      { duration: '5m', target: 100 },   // W_base_1
      { duration: '10s', target: 1000 }, // ramp up to spike
      { duration: '30s', target: 1000 }, // T_spike sustained
      { duration: '10s', target: 100 },  // ramp down to base
      { duration: '5m', target: 100 },   // W_base_2 + recovery 측정
    ]
    ```

  - `startRate: 100`, `timeUnit: '1s'`.
  - `preAllocatedVUs: 100`, `maxVUs: 1000`.
  - `tags: { lp_id: 'LP-4', stage: __ENV.STAGE || 'load' }`.
  - 페이로드: small 1KB 고정 (결정성 패딩).
- **회귀 가드:** spike 구간(30s) 의 R_spike 가 정확히 1000 RPS 에 도달하는지
  k6 의 `iterations` 카운터로 확인.
- **금지:** spike 시간 30s 외 임의 변경 0건. R_base / R_spike 외 임의 변경 0건.

### 단계 3 — `feat(docker/k6/scripts): add LP-3 + LP-4 measurement runners`

- `docker/k6/scripts/run-lp-3.sh` + `docker/k6/scripts/run-lp-4.sh` 신규 생성.
- 각 runner 는 PRD `prd-phase4/03` §3.1 의 8 단계 프로토콜 + LP 별 보강:
  - **LP-3 runner:** Redis 자원 지표 수집 (Redis CPU / 메모리 / 네트워크) — `docker
    stats --no-stream webhook-relay-redis` 를 W_load 중 30초 간격으로 sampling →
    `docker/k6/results/<id>/redis-stats.json`.
  - **LP-4 runner:** spike 종료 후 큐 길이 회복 시간 측정 — Prometheus query
    `sum by (job_state) (webhook_relay_queue_depth)` 를 spike 종료 시점부터 1초
    간격으로 polling. 큐 길이가 baseline (R=100 정상 분포의 95th percentile 이하)
    으로 회복된 시각을 기록.
- **회귀 가드:** runner 스크립트가 호스트 측에서 수동 실행. CI 통합 없음.

### 단계 4 — 측정 실행 (commit 아님 — 사람이 수동 실행)

- LP-3 측정 → 결과 무효 조건(§3.3) 검증 → knee point 후보 식별 (선형성 < 0.8
  이거나 p99 > LP-2 의 1.5×).
- LP-4 측정 → spike 회복 시간 측정.
- **무효 조건 발동 시:** 보고서 "실패 사유" 절 명시 + 사용자 결정 위임.

### 단계 5 — `docs(prd-phase4/results): commit LP-3 stress + knee point candidate`

- `docs/prd-phase4/results/LP-3_<date>.md` 신규 생성. 형식:
  - **YAML 헤더 + 메타데이터 8 항목.**
  - **본문 Markdown 표 (SLI × 통계):**

    | SLI | p50 | p99 | 평균 | 분산 | LP-2 nominal 대비 배율 |
    |-----|-----|-----|------|------|--------------------------|
    | SLO-2 등록 지연 | ... | ... | ... | ... | (예: p99 = LP-2 p99 × 2.5) |
    | SLO-3 전달 지연 | ... | ... | ... | ... | ... |
    | 처리량 (RPS achieved) | ... | ... | ... | ... | ... |
    | 큐 길이 (C1 waiting) | ... | ... | ... | ... | ... |
    | 카디널리티 | ... | ... | ... | ... | ... |

  - **부속 절: Redis 자원 지표** — CPU / 메모리 / 네트워크 사용률의 W_load 평균.
  - **부속 절: knee point 후보 식별:**
    - 선형성(N=1, R=500) = LP-3 처리량 / 500.
    - 선형성 < 0.8 → knee 진입.
    - bound 원인 (CPU / 메모리 / 네트워크 / 워커 경합) 의 우선순위 식별.
  - **부속 절: 측정 분산 확인** — knee point 영역의 분산 ±5% 초과 시 측정 변수로
    기록 + 사용자 결정 대기.
  - **부속 절: 실패 사유 (있을 시).**

### 단계 6 — `docs(prd-phase4/results): commit LP-4 spike + recovery time`

- `docs/prd-phase4/results/LP-4_<date>.md` 신규 생성. 형식:
  - **YAML 헤더 + 메타데이터 8 항목.**
  - **본문 Markdown 표 (spike 구조 × 측정값):**

    | 구간 | 시각 (ISO 8601) | R (RPS) | 큐 길이 평균 | 큐 길이 최대 |
    |------|-------------------|---------|----------------|----------------|
    | W_base_1 | t_start ~ t_spike_start | 100 | ... | ... |
    | T_spike | t_spike_start ~ t_spike_end | 1000 | ... | ... |
    | recovery | t_spike_end ~ t_recovered | (transient) | ... | ... |
    | W_base_2 | t_recovered ~ t_end | 100 | ... | ... |

  - **부속 절: 회복 시간 측정** — t_recovered - t_spike_end. 본 값이 본 시스템
    의 spike 흡수 능력 단일 측정값.
  - **부속 절: p99 / 처리량 spike 비교** — spike 구간 동안 p99 / 처리량의 분포.
  - **부속 절: 회복 시간 = "측정 윈도우 초과" 인 경우** — knee point 가 base RPS
    (100) 안에 들어왔음을 시사 (PRD `prd-phase4/04` §6.2 T3 트리거 — 본 PRD 범위
    밖, 사용자 검토).
  - **부속 절: 실패 사유 (있을 시).**

> **단계 6 이후 회귀 점검:** `pnpm typecheck` 0 errors, `pnpm test` 그린, 1~3단계
> IT + UT 전건 그린, `docker compose config` 유효, LP-3 + LP-4 시나리오 등장.

## 5. 생성/수정할 파일 목록 (절대경로)

### 생성

- `/Users/connor/biz/webhook-relay/docker/k6/scenarios/lp-3.js`
- `/Users/connor/biz/webhook-relay/docker/k6/scenarios/lp-4.js`
- `/Users/connor/biz/webhook-relay/docker/k6/scripts/run-lp-3.sh`
- `/Users/connor/biz/webhook-relay/docker/k6/scripts/run-lp-4.sh`
- `/Users/connor/biz/webhook-relay/docs/prd-phase4/results/LP-3_<date>.md` (단계 5)
- `/Users/connor/biz/webhook-relay/docs/prd-phase4/results/LP-4_<date>.md` (단계 6)

### 수정

- `/Users/connor/biz/webhook-relay/docker/k6/scenarios/README.md` (LP-3 + LP-4
  계약 추가 — 본 단계의 commit 단위로 처리 또는 단계 1/2 의 commit 안에서 동시
  처리).

### 절대 만들지/수정하지 않는 것

- `packages/**` — 본 마일스톤 코드 변경 0건. variant-aware stub 은 M-LOAD-3 이
  추가, 본 마일스톤은 variant 미지정 (normal) 사용.
- `docker-compose.yml` — 본 마일스톤 변경 0건.
- `docker/prometheus.yml`, `docker/grafana/**` — 본문 변경 0건.
- `docs/plan-phase4/README.md`, `00-decisions-needed.md`, `01-milestones.md` —
  outline 3 파일 변경 0건.
- `docs/prd-phase4/00~05.md` — PRD 본문 변경 0건.
- `docs/prd-phase3/04-slo-and-alerts.md` — SLO 임계 갱신 PR 은 M-LOAD-6 책임.

## 6. 수용 기준 / Done 정의

본 절은 outline `01-milestones.md` §3 M-LOAD-4 의 Exit Criteria 와 글자 단위
정합 + 본 마일스톤 보강 항목.

- [ ] LP-3 (R=500, P=large 고정, W=~32분) — knee point 1차 탐색 영역.
- [ ] LP-4 (base 100 → spike 1000 → base 100, 30s spike, total ~15분) — 큐 길이
  회복 시간 측정.
- [ ] 결과 보고서 `LP-3_<date>.md` + `LP-4_<date>.md`. knee point 후보 식별
  (Redis CPU / p99 / 큐 길이 중 어느 것이 먼저 비선형 진입).
- [ ] knee point 후보 식별 + 회귀 가드 그린.

### 보강 항목 (본 마일스톤 단위)

- [ ] LP-3 의 페이로드가 정확히 64KB 고정 (large) — D3 히스토그램의 상위 버킷에
  집중.
- [ ] LP-4 의 spike 구간이 정확히 30초 + R_spike 가 1000 RPS 에 도달 (k6 의
  iterations 카운터 확인).
- [ ] LP-4 의 회복 시간이 결과 보고서에 측정값 또는 "측정 윈도우 초과" 로 명시.
- [ ] LP-3 의 Redis 자원 지표 (CPU / 메모리 / 네트워크) 가 결과 보고서에 기록.
- [ ] knee point 후보 식별 결과가 bound 원인(CPU / 메모리 / 네트워크 / 워커 경합)
  으로 분류 (PRD `prd-phase4/04` §5.3 [4] 단계 정합).
- [ ] 본 PLAN 범위 안 파일만 수정 — outline 3 파일 mtime 변경 0건.

## 7. PRD 역참조

| 본 마일스톤 항목 | PRD 절 |
|------------------|---------|
| LP-3 시나리오 (R=500, P=large, W=~32분) | `prd-phase4/01` §3.1 + Q-LOAD-6 (b) + Q-LOAD-8 (b) |
| LP-4 시나리오 (spike 100→1000→100) | `prd-phase4/01` §3.1 + Q-LOAD-6 (b) + Q-LOAD-8 (a) |
| 페이로드 결정성 패딩 (large / small 고정) | `prd-phase4/01` §4.3 + I4.5 |
| knee point 1차 탐색 절차 | `prd-phase4/04` §5.2 + §5.3 |
| Redis 단일 인스턴스 한계 식별 | Q-LOAD-4 (a) + `prd-phase4/04` §5.1 |
| 회복 시간 측정 (LP-4) | `prd-phase4/04` §4.3 |
| HA / Cluster 트리거 조건 (사용자 검토 위임) | `prd-phase4/04` §6 (도입 자체는 N4.2 정합 본 PRD 범위 밖) |

## 8. 결정 의존

- **Q-LOAD-4** (a) Redis 단일 인스턴스 한계 식별 — 본 마일스톤이 knee point 후보
  식별.
- **Q-LOAD-6** (b) 중도 셋 — LP-3 R=500, LP-4 base=100/spike=1000.
- **Q-LOAD-8** (b) sustained (LP-3) + (a) 짧은 (LP-4).
- **Q-LOAD-12** (a) Markdown 표 — 결과 보고서 형식.
- **1~3단계 결정 정합:** 3단계 메트릭 카탈로그 + SLI PromQL(I6.1) 보존, IT-OBS-11
  카디널리티 가드 보존.

> 모든 결정 2026-05-27 Resolved.

## 9. 회귀 점검

본 마일스톤이 끝나는 시점에 다음이 모두 그린:

- `pnpm typecheck` 0 errors.
- `pnpm test:unit` — UT-1~6 + 보강.
- `pnpm test:integration` — IT-S1~S7, IT-S1b, IT-S2b, IT-S6b, IT-R1, IT-OBS-1~12
  전건 그린 + M-LOAD-3 신규 `receiver-variants` 그린 (variant 미지정 = normal).
- `docker compose config` 유효 + LP-3 / LP-4 시나리오 파일 마운트 정상.
- `docker compose up` (k6 제외) 후 1~3단계 데모 그대로 동작.
- **부수 효과 0건 검증:** LP-3 측정이 끝난 후 `docker compose down -v` 가 Redis
  데이터를 정리 → 1~3단계 데모 재실행 시 상태 누적 없음. LP-4 spike 측정도 동일.

## 10. 본 마일스톤 후 데모 상태

- 일반 `docker compose up` 후 1~3단계 데모 그대로 동작.
- `docker compose --profile measure run --rm k6 run /scenarios/lp-3.js` + `lp-4.js`
  가 실행 가능.
- `docs/prd-phase4/results/LP-3_<date>.md` + `LP-4_<date>.md` 가 commit.
- knee point 후보 1건 (선형성 < 0.8 또는 p99 > LP-2 의 1.5×) 식별. bound 원인
  분류.
- LP-4 spike 회복 시간 1건 측정.
- **다음 마일스톤(M-LOAD-5) 진입 가능 조건:** §6 Done 정의 전건 + 본 §9 회귀 가드
  전건 그린 + knee point 후보 식별 결과가 보고서에 명시.
