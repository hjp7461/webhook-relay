# 06. M-LOAD-5 — 수평 확장 측정 (N ∈ {1, 2, 5, 10} × LP-2 sustained + SLO-H-1/H-2 검증)

> **PLAN 진입 조건:** M-LOAD-4 완료 — LP-3 stress + LP-4 spike 결과 보고서 commit
> + knee point 후보 식별. PRD Q-LOAD-1~13 전건 Resolved. 1~3단계 IT + UT 전건 그린.
>
> **AI 협업 5원칙 적용:** 본 마일스톤은 **`docker compose up --scale worker=N`**
> 의 N 함수 형태를 정량 측정한다. SLO-H-1 (α=0.8, Q-LOAD-10) / SLO-H-2 (β=1.2,
> Q-LOAD-11) 의 검증은 본 PRD 가 새로 정의하는 수평 확장 SLO (PRD `prd-phase4/04`
> §4.4). 본 PRD 가 새 메트릭을 도입하지 않으므로 SLI PromQL 은 3단계 카탈로그를
> 그대로 사용(G4.3 정합).
>
> **본 마일스톤이 명시적으로 다루지 않는 것:** Redis CPU/메모리/네트워크 한계
> 식별(M-LOAD-6 책임), HA / Cluster 트리거 조건 명문화(M-LOAD-6 책임), 최종 종합
> 보고서(M-LOAD-6 책임), SLO 재조정 PR(M-LOAD-6 책임).

---

## 1. 진입 조건

- M-LOAD-4 Exit Criteria 전건 통과 (`05-m-load-4-lp3-lp4.md` §6).
- 본 마일스톤이 의존하는 PRD 결정 잠금:
  - Q-LOAD-2 (b) cgroup 격리 → N=5 / N=10 의 cgroup 총합이 호스트 사양 안인지
    재검증.
  - Q-LOAD-6 (b) 중도 셋 → LP-2 의 R=100 RPS 가 N 매트릭스 측정의 기준 부하.
  - Q-LOAD-10 (b) α=0.8 → SLO-H-1 의 처리량 선형성 허용 오차.
  - Q-LOAD-11 (b) β=1.2 → SLO-H-2 의 p99 안정성 허용 오차.
  - Q-LOAD-12 (a) Markdown 표 → `docs/prd-phase4/results/horizontal-scaling_<date>.md`.
- N=1 의 LP-2 nominal 측정 결과(M-LOAD-3)가 본 마일스톤의 기준선 (baseline).

## 2. 선행 의존

- **마일스톤:** M-LOAD-4 (knee point 후보 식별 → N 매트릭스의 해석 기초).
- **PRD 결정 잠금:** Q-LOAD-2, Q-LOAD-6, Q-LOAD-10, Q-LOAD-11, Q-LOAD-12.
- **1~3단계 결정 정합:**
  - `--scale worker=N` 의 의미 보존 — 1~2단계 `SERVICE_MODE=worker` + N 인스턴스
    가 같은 Redis 큐 공유 소비 (PRD `prd-phase4/04` §I4.20 정합).
  - 3단계 메트릭 카탈로그(`webhook_relay_jobs_processed_total` /
    `webhook_relay_worker_processing_duration_seconds_bucket`) 의 SLI PromQL
    형태 보존(I6.1, PRD `prd-phase4/04` §4.4).
- **자율 일탈 사전 승인 규칙:**
  - N ∈ {1, 2, 5, 10} 외의 N (예: N=3, 7, 20) 추가 측정 금지 (Q-LOAD-2 측정 환경
    의 호스트 사양 한계 + 본 PRD `prd-phase4/04` §I4.19 폐쇄성). 추가 N 이 필요
    해지면 본 마일스톤 단계에서 사용자 보고 + 결정 위임.
  - N=10 측정 시 worker × 10 cgroup cpus 가 호스트 코어 수를 초과하면 cgroup
    격리 의미 약화 — M-LOAD-1 단계 6 호환성 체크가 본 마일스톤의 사전 가드.

## 3. 측정 우선 시퀀스 (4 N × LP-2 sustained 순차)

본 마일스톤의 측정 사이클은 PRD `prd-phase4/04` §2.1 의 N 매트릭스 × LP-2
sustained 측정. 본 마일스톤이 LP-2 만 사용하는 이유 — N 함수 형태의 분석은 일관
된 부하 프로필에서 추출해야 의미 있으며, LP-2 가 운영 기대 부하 영역(nominal).
LP-3 / LP-4 × N 매트릭스는 본 PRD `prd-phase4/04` §2.1 의 잠정 합계 매트릭스 외
이며, 추가 측정은 사용자 결정 위임.

### 3.1 N 매트릭스 (4 값 순차)

| N | docker-compose 명령 | LP | 측정 의도 |
|---|---------------------|-----|-----------|
| 1 | `docker compose up` (기본) | LP-2 normal | 기준선 (단일 워커 처리량 / p99 / 큐 길이) |
| 2 | `docker compose up --scale worker=2` | LP-2 normal | 선형성의 첫 단계 확인 |
| 5 | `docker compose up --scale worker=5` | LP-2 normal | 중간 영역 — knee point 후보 검증 |
| 10 | `docker compose up --scale worker=10` | LP-2 normal | 포화 / 역전 식별 영역 |

> **N=1 측정 재사용 정책:** M-LOAD-3 의 LP-2-normal 결과가 N=1 기준선으로 재사용
> 가능. 단, 측정 호스트 / cgroup 한정값 / git commit SHA 가 본 마일스톤 측정과
> 일치해야 한다 (PRD `prd-phase4/02` §7.1 재현성 정의). 일치하지 않으면 N=1
> 재측정 → 본 마일스톤이 새 N=1 baseline 으로 사용.

### 3.2 측정 사이클 (4 N 순차)

각 N 은 PRD `prd-phase4/03` §3.1 의 8 단계 프로토콜을 따른다. N 사이의 격리:

- 각 N 측정 후 `docker compose down -v` (Redis flush).
- 다음 N 으로 `docker compose up --scale worker=N` 으로 재기동.
- 메타데이터 헤더에 `worker_count: N` 명시.
- Prometheus 인스턴스는 같은 인스턴스가 4 N 의 시계열을 누적 → 측정별 time range
  로 PromQL 쿼리 분리.

### 3.3 SLO-H-1 / SLO-H-2 검증 절차

PRD `prd-phase4/04` §4.4 의 SLI PromQL 을 그대로 사용:

- **SLO-H-1 (처리량 선형성):**
  - SLI: `sum(rate(webhook_relay_jobs_processed_total{job_state="completed"}[5m]))`
    의 W_load 평균.
  - 목표: `처리량(N) ≥ 처리량(1) × N × 0.8` (α = 0.8).
- **SLO-H-2 (p99 안정성):**
  - SLI: `histogram_quantile(0.99, sum by (le) (rate(webhook_relay_worker_processing_duration_seconds_bucket{outcome="success"}[5m])))`
    의 W_load 평균.
  - 목표: `p99(N) ≤ p99(1) × 1.2` (β = 1.2).

검증 결과:

- SLO-H-1 통과 / 위반 (N=2 / 5 / 10 각각).
- SLO-H-2 통과 / 위반 (N=2 / 5 / 10 각각).
- 위반 시 사유 식별 (자원 경합 / Redis 포화 / 호스트 사양 한계).

### 3.4 측정 결과 무효 조건

LP-1 / LP-2 / LP-3 / LP-4 와 동일 + 본 마일스톤 보강:

- 메타데이터 누락 (특히 `worker_count: N` 필수).
- 측정 분산 ±5% 초과 (4 N 각각).
- 카디널리티 가드 위반 — N 증가 시 워커 인스턴스 라벨 추가로 시계열 수 증가
  가능. `instance` 라벨이 N 만큼 증가는 정상 (Prometheus 표준), 그러나 카디널
  리티 총합이 IT-OBS-11 의 1000 상한을 위반하면 무효.
- Prometheus target up = 0 구간이 W_load 안에 존재 — N 인스턴스 중 일부가 scrape
  되지 않으면 부분 측정. PRD `prd-phase4/04` §R4.18 정합 — worker 포트 매핑 충돌
  은 Prometheus scrape 에 영향 없음(컨테이너 network).
- k6 의 RPS 도달률이 목표 R=100 의 ±2% 를 벗어남.

## 4. 구현 단계 (커밋 단위)

각 번호는 1 commit. 본 마일스톤의 총 commit 수는 4건.

### 단계 1 — `feat(docker/k6/scripts): add horizontal scaling runner (N matrix)`

- `docker/k6/scripts/run-horizontal-scaling.sh` 신규 생성. POSIX shell. 4 N 매트
  릭스 순차 실행:

  ```sh
  for N in 1 2 5 10; do
    MEASUREMENT_ID="LP-2-N${N}_$(date -u +%Y-%m-%dT%H-%M-%SZ)"
    mkdir -p "docker/k6/results/${MEASUREMENT_ID}"
    docker/k6/scripts/collect-metadata.sh > "docker/k6/results/${MEASUREMENT_ID}/metadata.yaml"
    echo "worker_count: ${N}" >> "docker/k6/results/${MEASUREMENT_ID}/metadata.yaml"
    docker compose up -d --scale worker=${N}
    # /healthz 200 + Prometheus targets up=1 (N+1 잡) 확인
    TSTART=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    docker compose --profile measure run --rm \
      -e VARIANT=normal -e DURATION=30m \
      k6 run /scenarios/lp-2.js
    TEND=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    echo "t_start: ${TSTART}" >> "docker/k6/results/${MEASUREMENT_ID}/metadata.yaml"
    echo "t_end: ${TEND}" >> "docker/k6/results/${MEASUREMENT_ID}/metadata.yaml"
    # docker/k6/scripts/query-slis-horizontal.sh "${TSTART}" "${TEND}" "${N}" \
    #     > "docker/k6/results/${MEASUREMENT_ID}/prom-queries.json"
    docker compose down -v
  done
  ```

- 본 스크립트는 호스트 측에서 수동 실행. 총 측정 시간 약 128분 (32 × 4).
- **회귀 가드:** 각 N 측정 사이 `docker compose down -v` 가 Redis 데이터 flush.
- **금지:**
  - N=1/2/5/10 외 임의 N 추가 금지 (Q-LOAD-2 호스트 사양 한계 + I4.19 폐쇄성).
  - 4 N 매트릭스 외 LP-3 / LP-4 × N 추가 측정 금지 (본 PRD `prd-phase4/04` §2.1
    잠정 합계 매트릭스 외).

### 단계 2 — 측정 실행 (commit 아님 — 사람이 수동 실행)

- §3.2 측정 사이클을 4 N 에 대해 순차 실행. 각 N 의 결과 무효 조건 검증.
- N=5 / N=10 측정 전에 cgroup 호환성 재검증 (M-LOAD-1 단계 6 절차 재실행).
- **무효 조건 발동 시:** 해당 N 의 측정 결과를 보고서 "실패 사유" 절에 명시.
  남은 N 측정은 사용자 결정에 따라 진행 또는 중단.

### 단계 3 — `docs(prd-phase4/results): commit horizontal-scaling N=1/2/5/10`

- `docs/prd-phase4/results/horizontal-scaling_<date>.md` 신규 생성. 형식:
  - **YAML 헤더** — 측정 호스트 메타데이터 + cgroup 한정값. N 별 측정 시각은
    본문 표의 N 행 안에 기록.
  - **본문 Markdown 표 1: 처리량 / p99 / 큐 길이의 함수 형태 (N × SLI):**

    | N | 처리량 (RPS achieved) | p99 처리 지연 (W2) | 큐 길이 평균 | 큐 길이 최대 |
    |---|-------------------------|----------------------|----------------|----------------|
    | 1 | (M-LOAD-3 N=1 LP-2-normal 재사용 또는 재측정) | ... | ... | ... |
    | 2 | ... | ... | ... | ... |
    | 5 | ... | ... | ... | ... |
    | 10 | ... | ... | ... | ... |

  - **본문 Markdown 표 2: SLO-H-1 검증 (Q-LOAD-10 α=0.8):**

    | N | 처리량(N) | 처리량(1) × N × 0.8 | SLO-H-1 |
    |---|-----------|------------------------|----------|
    | 2 | ... | ... | 통과 / 위반 |
    | 5 | ... | ... | 통과 / 위반 |
    | 10 | ... | ... | 통과 / 위반 |

  - **본문 Markdown 표 3: SLO-H-2 검증 (Q-LOAD-11 β=1.2):**

    | N | p99(N) | p99(1) × 1.2 | SLO-H-2 |
    |---|---------|---------------|----------|
    | 2 | ... | ... | 통과 / 위반 |
    | 5 | ... | ... | 통과 / 위반 |
    | 10 | ... | ... | 통과 / 위반 |

  - **부속 절: 선형성(N) 계산** — PRD `prd-phase4/04` §3.3 공식. 선형성(N) =
    처리량(N) / (처리량(1) × N). 1.0 = 완전 선형, < 1.0 = 손실, > 1.0 = 측정
    노이즈.
  - **부속 절: 위반 사유 식별** — SLO-H-1 또는 SLO-H-2 위반 N 의 사유:
    - 자원 경합 (호스트 코어 부족, 컨텍스트 스위치 비용).
    - Redis 포화 (M-LOAD-4 knee point 후보의 검증).
    - cgroup 한정값 과소 (worker 당 cpus=1.0 이 부족할 수 있음 — PRD `prd-phase4/02`
      §4.2 메모).
  - **부속 절: 측정 분산 확인** — 4 N 각각 ±5% 안.
  - **부속 절: 실패 사유 (있을 시).**

### 단계 4 — `docs(docker/k6/scripts): document horizontal scaling runner contract`

- `docker/k6/scripts/README.md` 신규 생성 (또는 `docker/k6/scenarios/README.md`
  에 §3 절 추가). 본 commit 은 단계 1 의 runner 스크립트 계약을 문서화:
  - 입력: N 매트릭스 (기본 {1, 2, 5, 10}).
  - 출력: 각 N 별 `docker/k6/results/<id>/` + 메타데이터 + Prometheus query 결과.
  - cgroup 호환성 사전 체크 절차.
  - 측정 실행 후 보고서 작성은 단계 3 의 형식 정합.
- **금지:** 본 commit 에서 N 매트릭스 변경 0건. runner 스크립트 변경 0건 (단계
  1 의 결과 잠금).

> **단계 4 이후 회귀 점검:** `pnpm typecheck` 0 errors, `pnpm test` 그린, 1~3단계
> IT + UT 전건 그린, `docker compose config` 유효, runner 스크립트 등장.

## 5. 생성/수정할 파일 목록 (절대경로)

### 생성

- `/Users/connor/biz/webhook-relay/docker/k6/scripts/run-horizontal-scaling.sh`
- `/Users/connor/biz/webhook-relay/docs/prd-phase4/results/horizontal-scaling_<date>.md`
  (단계 3)
- `/Users/connor/biz/webhook-relay/docker/k6/scripts/README.md` (단계 4, 또는
  `docker/k6/scenarios/README.md` 에 §3 절 추가)

### 수정

- (없음 — 본 마일스톤은 코드 변경 0건, 시나리오 파일 추가 0건. LP-2 시나리오는
  M-LOAD-3 이 이미 작성.)

### 절대 만들지/수정하지 않는 것

- `packages/**` — 본 마일스톤 코드 변경 0건.
- `docker/k6/scenarios/lp-*.js` — 본 마일스톤은 새 시나리오 추가 없음.
- `docker-compose.yml` — 본 마일스톤 변경 0건. `--scale worker=N` 은 docker
  compose CLI 옵션이며 yml 변경 불요.
- `docker/prometheus.yml`, `docker/grafana/**` — 본문 변경 0건.
- `docs/plan-phase4/README.md`, `00-decisions-needed.md`, `01-milestones.md` —
  outline 3 파일 변경 0건.
- `docs/prd-phase4/00~05.md` — PRD 본문 변경 0건.
- `docs/prd-phase3/04-slo-and-alerts.md` — SLO 임계 갱신 PR 은 M-LOAD-6 책임.

## 6. 수용 기준 / Done 정의

본 절은 outline `01-milestones.md` §3 M-LOAD-5 의 Exit Criteria 와 글자 단위
정합 + 본 마일스톤 보강 항목.

- [ ] N ∈ {1, 2, 5, 10} 각각에 대해 LP-2 sustained 측정. `docker compose up
  --scale worker=N`.
- [ ] 처리량(N) / p99(N) / 큐 길이(N) 의 함수 형태 측정.
- [ ] SLO-H-1 (`처리량(N) ≥ 처리량(1) × N × 0.8`) / SLO-H-2 (`p99(N) ≤ p99(1) ×
  1.2`) 검증.
- [ ] 결과 보고서 `docs/prd-phase4/results/horizontal-scaling_<date>.md`.
- [ ] SLO-H-1/H-2 통과 또는 위반 시 사유(자원 경합 / Redis 한계) 식별 + 회귀
  가드 그린.

### 보강 항목 (본 마일스톤 단위)

- [ ] N=1 baseline 의 처리량 / p99 / 큐 길이가 M-LOAD-3 LP-2-normal 와 ±5% 안
  일치 (재현성 확인).
- [ ] N=5 / N=10 측정 시 cgroup 호환성 사전 체크 통과 (worker × N cpus ≤ 호스트
  코어 수 - 1).
- [ ] Prometheus targets 가 N+1 잡 (`webhook-relay-api` + `webhook-relay-worker`
  N 인스턴스) up=1.
- [ ] 카디널리티 가드 — `instance` 라벨이 N 만큼 증가하지만 IT-OBS-11 의 1000
  상한 위반 없음.
- [ ] SLO-H-1 / SLO-H-2 위반 N 의 사유가 결과 보고서에 분류 (자원 경합 / Redis
  포화 / cgroup 한정값 과소).
- [ ] 본 PLAN 범위 안 파일만 수정 — outline 3 파일 mtime 변경 0건.

## 7. PRD 역참조

| 본 마일스톤 항목 | PRD 절 |
|------------------|---------|
| N 매트릭스 ({1, 2, 5, 10}) | `prd-phase4/04` §2.1 + §I4.19 폐쇄성 |
| `--scale worker=N` 의미 보존 | `prd-phase4/04` §I4.20 + 1~2단계 PRD |
| SLO-H-1 (α=0.8) | `prd-phase4/04` §4.1 + Q-LOAD-10 (b) + §4.4 SLI PromQL |
| SLO-H-2 (β=1.2) | `prd-phase4/04` §4.2 + Q-LOAD-11 (b) + §4.4 SLI PromQL |
| 처리량 / p99 / 큐 길이 함수 형태 | `prd-phase4/04` §3 + §3.3 선형성 |
| 새 메트릭 도입 0건 | `prd-phase4/00-overview` §2 G4.3 + `04` §I4.23 |
| 새 알람 도입 0건 (SLO-H-1/H-2 알람 없음) | `prd-phase4/04` §4.5 + N4.1 |

## 8. 결정 의존

- **Q-LOAD-2** (b) cgroup 격리 — N 매트릭스의 호스트 사양 호환성.
- **Q-LOAD-6** (b) 중도 셋 — LP-2 R=100 기준.
- **Q-LOAD-10** (b) α=0.8 — SLO-H-1 허용 오차.
- **Q-LOAD-11** (b) β=1.2 — SLO-H-2 허용 오차.
- **Q-LOAD-12** (a) Markdown 표 — 결과 보고서 형식.
- **1~3단계 결정 정합:** `SERVICE_MODE=worker` + `--scale worker=N` 의미 보존,
  3단계 메트릭 카탈로그 + SLI PromQL(I6.1) 보존, IT-OBS-11 카디널리티 가드 보존.

> 모든 결정 2026-05-27 Resolved.

## 9. 회귀 점검

본 마일스톤이 끝나는 시점에 다음이 모두 그린:

- `pnpm typecheck` 0 errors.
- `pnpm test:unit` — UT-1~6 + 보강.
- `pnpm test:integration` — IT-S1~S7, IT-S1b, IT-S2b, IT-S6b, IT-R1, IT-OBS-1~12
  전건 그린 + M-LOAD-3 신규 `receiver-variants` 그린.
- `docker compose config` 유효 + `docker compose up --scale worker=N` 가 N=2/5/10
  에서 정상 기동 (3단계 종료 상태의 동작 그대로).
- IT-OBS-11 카디널리티 가드 — N=10 측정 후에도 메트릭당 시계열 수 ≤ 1000 유지.
- **부수 효과 0건 검증:** 측정 종료 후 `docker compose down -v` 로 정리 → 1~3단계
  데모 재실행 시 상태 누적 없음.

## 10. 본 마일스톤 후 데모 상태

- 일반 `docker compose up` 후 1~3단계 데모 그대로 동작.
- `docker compose up --scale worker=N` 으로 N 매트릭스 측정 가능 (N=2/5/10).
- `docs/prd-phase4/results/horizontal-scaling_<date>.md` 가 N × SLI + SLO-H-1/H-2
  검증 결과 commit.
- 본 시스템의 수평 확장 능력이 정량 측정값 (예: "N=10 시 처리량(10)/처리량(1) =
  6.5, 선형성 0.65, SLO-H-1 위반 — 사유: Redis CPU 포화") 으로 명시.
- **다음 마일스톤(M-LOAD-6) 진입 가능 조건:** §6 Done 정의 전건 + 본 §9 회귀 가드
  전건 그린 + 4 N 측정 분산 각각 ±5% 안 + SLO-H-1/H-2 검증 결과 명시.
