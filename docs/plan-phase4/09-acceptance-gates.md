# 09. Acceptance Gates — 마일스톤별 Exit Gate 체크리스트 (Phase 4 Load · Measurement)

> 본 문서는 각 마일스톤이 끝나는 시점에 사용자가 commit/PR 을 닫기 전 확인해야
> 할 **Done Gate** 를 단일 출처로 모은다.
>
> **운영 규칙:** 본 체크리스트의 모든 항목이 통과되지 않으면 다음 마일스톤으로
> 진입하지 않는다. 회귀가 발생하면 이전 마일스톤의 게이트로 되돌아간다(3단계
> plan-phase3 의 `09-acceptance-gates.md` 정합).
>
> **AI 협업 5원칙 적용:** 본 문서의 게이트가 빨강이면 임의 우회 금지 — 사용자에
> 게 보고 + 결정 위임 (`00-decisions-needed.md` 에 새 Q-LOAD-N-PLAN-M 추적).

---

## 0. 전 마일스톤 공통 게이트 (모든 commit 시퀀스에 적용)

각 마일스톤이 닫히기 전에 **공통으로** 통과해야 한다.

- [ ] `pnpm install` 0 에러.
- [ ] `pnpm typecheck` 0 에러 (모든 패키지).
- [ ] `pnpm test:unit` 그린 — UT-1~6 + 보강(metrics-c-catalog / metrics-d-w-catalog).
- [ ] `pnpm test:integration` 그린 — IT-S1~S7, IT-S1b, IT-S2b, IT-S6b, IT-R1
  (보강), IT-OBS-1~12 전건.
- [ ] `IT-R1-domain-boundary` 그린 (3단계 보강 룰 + `webhook_relay_` 접두 예외).
- [ ] `core/**` 의 모든 식별자가 도메인 식별자 검사 통과.
- [ ] 새 의존성을 추가했다면 정당성이 commit 메시지에 명시되어 있고, CLAUDE.md
  §2 고정 스택 내에 속함 (본 PLAN 전체에서 새 npm 의존성 0건 + Docker 이미지
  `grafana/k6` 1건만).
- [ ] Conventional Commits 형식의 commit 메시지 (원자적, 관심사 분리,
  `docs(plan-phase4):` 또는 `feat(docker/k6):` 등 prefix).
- [ ] 매직 스트링 0건 (`constants.ts` / `config.ts` 외부).
- [ ] `streams-internals/**` 변경 0건.
- [ ] 1~3단계 IT(IT-S1~S7, IT-S1b, IT-S2b, IT-S6b, IT-R1, IT-OBS-1~12) + UT-1~6
  + 보강 모두 그린.
- [ ] **본 PLAN 범위 안 파일만 수정:** `docker/k6/**`, `docker-compose.yml`,
  `docker/prometheus/rules/` (M-LOAD-6 단계 3 의 별도 commit 시리즈만),
  `.env.example`, `packages/demo/src/receiver/` (M-LOAD-3 단계 2 의 variant-aware
  stub), `packages/demo/test/receiver-variants.integration.test.ts` (M-LOAD-3
  단계 7), `docs/plan-phase4/02~10.md`, `docs/prd-phase4/results/`. `docs/prd/`,
  `docs/prd-phase3/04` (M-LOAD-6 단계 3 의 별도 commit 시리즈만), `architecture.md`,
  `CLAUDE.md`, `README.md`, `docs/adr/`, `docs/plan/`, `docs/plan-phase3/`,
  `docs/plan-phase4/README.md`, `00-decisions-needed.md`, `01-milestones.md` 변경
  금지.
- [ ] `docker compose config` 유효.
- [ ] `docker compose up` (k6 제외) 후 1~3단계 데모 정상 동작.

---

## 1. M-LOAD-1 — Bootstrap

### 통과 조건

- [ ] `docker-compose.yml` 에 `k6` 서비스 추가 + `profiles: ["measure"]` + cgroup
  한정값(`deploy.resources.limits.cpus` / `memory`) 명세.
- [ ] `docker-compose.yml` 의 prometheus 서비스 command 에 `--web.enable-remote-write-receiver`
  추가.
- [ ] `docker/k6/scenarios/.gitkeep` + `docker/k6/results/.gitkeep` + `docker/k6/scripts/collect-metadata.sh`
  등장.
- [ ] `docs/prd-phase4/results/.gitkeep` + `docs/prd-phase4/results/README.md`
  (보고서 형식 + 명명 규칙 + commit 정책 cross-link) 등장.
- [ ] `.env.example` 에 `K6_TARGET_URL` / `K6_API_BEARER_TOKEN` / `K6_PROMETHEUS_RW_SERVER_URL`
  3 키 추가. 기존 키 변경 0건.
- [ ] cgroup 호환성 체크 (§6 단계 6) 통과 — 6 서비스 cgroup 한정값 총합이 측정
  호스트 사양 안.
- [ ] §0 공통 게이트 전건.

### 데모 동작 가능 상태

- 일반 `docker compose up` → 1~3단계 5 서비스 정상 (k6 비실행).
- `docker compose --profile measure config` 가 `k6` 서비스 등장.

### 회귀 보호

- 1~3단계 IT 전건 그린. `packages/` 코드 변경 0건 → hot path 영향 0건.

---

## 2. M-LOAD-2 — LP-1 baseline 측정

### 통과 조건

- [ ] `docker/k6/scenarios/lp-1.js` (R=10 RPS, P=small 1KB 고정, W=~6.5분) 등장.
- [ ] `docker/k6/scripts/run-lp-1.sh` 측정 실행 스크립트 등장. cgroup 한정값
  적용 + Prometheus query 시점 기록 + 메타데이터 수집.
- [ ] `docker/k6/scenarios/README.md` 가 LP-1 계약 명세.
- [ ] 첫 결과 보고서 `docs/prd-phase4/results/LP-1_<date>.md` commit. 측정 분산
  ±5% 안.
- [ ] 메타데이터 8 항목 전건 기록 (`08-cross-cutting.md` §1).
- [ ] k6 의 RPS 도달률 9.8 ≤ achieved ≤ 10.2 (PRD `03` §3.4 정합).
- [ ] 페이로드 결정성 패딩 (1KB 고정).
- [ ] `.gitignore` 에 `docker/k6/results/**/k6-*.json` 등 raw artifact 제외 (선택,
  사용자 결정).
- [ ] AC4.4 측정 프로토콜 통과 + 회귀 가드 그린.
- [ ] §0 공통 게이트 전건.

### 데모 동작 가능 상태

- `docker compose --profile measure run --rm k6 run /scenarios/lp-1.js` 실행 가능.
- LP-1 첫 결과 보고서가 형식 정합 commit.

### 회귀 보호

- 1~3단계 IT 그린. `packages/` 변경 0건. `/_demo/receiver` 가 happy-path stub
  으로 사용 (1~2단계 동작 그대로).

---

## 3. M-LOAD-3 — LP-2 nominal sustained

### 통과 조건

- [ ] `docker/k6/scenarios/lp-2.js` (R=100, P=80/15/5, W=~32분) 등장.
- [ ] `docker/k6/scripts/run-lp-2.sh` 가 4 변형(normal / s3 / s4 / s5) 순차 실행.
- [ ] `packages/demo/src/receiver/` 에 variant-aware stub 응답 모드 추가:
  `variant=normal` → 200, `variant=s3` → K=2회 5xx 후 200, `variant=s4` → 항상
  5xx, `variant=s5` → 항상 4xx.
- [ ] `packages/demo/test/receiver-variants.integration.test.ts` 그린.
- [ ] 1~2단계 IT-S1 / IT-S3 / IT-S4 / IT-S5 가 variant 미지정으로 그대로 그린.
- [ ] 결과 보고서 `docs/prd-phase4/results/LP-2_<date>.md` + 4 변형 행. SLO 잠정
  값 분포(99.5% / 0.5s / 5s / 1%) 확보.
- [ ] LP-2-S3 의 W3 attempts 평균 ≈ 3 (K=2 의 결과).
- [ ] LP-2-S4 의 SLO-4 DLQ 적재율 ≈ 100% (모든 작업이 max_attempts_exceeded).
- [ ] LP-2-S5 의 C5 `reason="non_retriable"` 카운트가 부하 인가 작업 수와 일치.
- [ ] 4 변형 측정 분산 각각 ±5% 안.
- [ ] §0 공통 게이트 전건.

### 데모 동작 가능 상태

- `docker compose up` 후 `/_demo/receiver?variant=s4` 호출이 stub 응답 분기 동작.
- LP-2 보고서가 4 변형 × SLI 분포 commit.

### 회귀 보호

- 1~3단계 IT 그린 — variant 미지정 = normal 동작. IT-R1 그린 — `core/` 변경 0건.

---

## 4. M-LOAD-4 — LP-3 stress + LP-4 spike

### 통과 조건

- [ ] `docker/k6/scenarios/lp-3.js` (R=500, P=large 64KB 고정, W=~32분) 등장.
- [ ] `docker/k6/scenarios/lp-4.js` (spike base 100 → 1000 → 100, 30s spike,
  total ~15분) 등장.
- [ ] `docker/k6/scripts/run-lp-3.sh` + `run-lp-4.sh` 측정 실행 스크립트 등장.
- [ ] LP-3 의 Redis 자원 지표 (CPU / 메모리 / 네트워크) 결과 보고서에 기록.
- [ ] LP-4 의 spike 회복 시간 측정 또는 "측정 윈도우 초과" 명시.
- [ ] 결과 보고서 `LP-3_<date>.md` + `LP-4_<date>.md` commit.
- [ ] knee point 후보 식별 (Redis CPU / p99 / 큐 길이 중 어느 것이 먼저 비선형
  진입) + bound 원인(CPU / 메모리 / 네트워크 / 워커 경합) 분류.
- [ ] k6 의 RPS 도달률 — LP-3: 490 ≤ achieved ≤ 510, LP-4 spike: 980 ≤ achieved
  ≤ 1020.
- [ ] §0 공통 게이트 전건.

### 데모 동작 가능 상태

- LP-3 / LP-4 시나리오 실행 가능. knee point 후보 1건 + 회복 시간 1건 식별.

### 회귀 보호

- 1~3단계 IT 그린. M-LOAD-3 `receiver-variants` 그린 (variant 미지정).

---

## 5. M-LOAD-5 — 수평 확장 측정

### 통과 조건

- [ ] `docker/k6/scripts/run-horizontal-scaling.sh` (4 N 매트릭스: 1 / 2 / 5 / 10)
  등장.
- [ ] `docker/k6/scripts/README.md` 또는 `docker/k6/scenarios/README.md` 가 runner
  계약 명세.
- [ ] N=5 / N=10 측정 전 cgroup 호환성 사전 체크 통과.
- [ ] 결과 보고서 `docs/prd-phase4/results/horizontal-scaling_<date>.md` commit.
  N × SLI + SLO-H-1 / SLO-H-2 검증 결과 3 표 + 선형성(N) 계산 + 위반 사유 분류.
- [ ] N=1 baseline 처리량 / p99 / 큐 길이가 M-LOAD-3 LP-2-normal 와 ±5% 안 일치
  (재현성 확인).
- [ ] Prometheus targets 가 N+1 잡 (`webhook-relay-api` + `webhook-relay-worker`
  N 인스턴스) up=1.
- [ ] 카디널리티 가드 — `instance` 라벨이 N 만큼 증가하지만 IT-OBS-11 의 1000
  상한 위반 없음.
- [ ] 4 N 측정 분산 각각 ±5% 안.
- [ ] SLO-H-1 / SLO-H-2 위반 N 의 사유가 결과 보고서에 분류.
- [ ] §0 공통 게이트 전건.

### 데모 동작 가능 상태

- `docker compose up --scale worker=N` 으로 N=2/5/10 정상 기동.
- horizontal-scaling 보고서가 N 함수 형태 + SLO-H-1/H-2 검증 결과 commit.

### 회귀 보호

- 1~3단계 IT 그린. IT-OBS-11 카디널리티 가드 보존.

---

## 6. M-LOAD-6 — Redis knee + 최종 종합 보고서 + SLO 임계 갱신 PR 인계

### 통과 조건

- [ ] `docs/prd-phase4/results/final_<date>.md` commit. M-LOAD-2~5 결과 종합 +
  Redis knee point 식별 + HA/Cluster 트리거 조건(T1~T5) + SLO 재조정 임계 표
  (실측 값 기반).
- [ ] M-LOAD-2~5 결과 보고서의 메타데이터 일관성 검증 통과 — 같은 호스트 사양 /
  cgroup 한정값 / git commit SHA.
- [ ] Redis bound 원인 식별 (CPU / 메모리 / 네트워크 / 워커 경합).
- [ ] HA/Cluster 트리거 조건 5종 (T1~T5) 의 운영 모니터링 권고 명시.
- [ ] SLO 재조정 임계 (Q-LOAD-9 (a) p99 × 1.5 적용) — SLO-2 / SLO-3 의 실측 p99
  × 1.5. SLO-1 / SLO-4 의 비율 변형 적용(PRD `03` §4.5).
- [ ] SLO 임계 갱신 PR template (본 마일스톤 §11 절) 잠금 — `prd-phase3/04` §3.1
  의 임계 숫자만 + `docker/prometheus/rules/*.yaml` 의 PromQL 임계만 변경. SLI
  PromQL 형태 / 측정 윈도우 / burn rate 표준값 / 알람 YAML 구조 변경 금지.
- [ ] PLAN closeout 체크리스트(M-LOAD-6 §10) 전건 통과.
- [ ] §0 공통 게이트 전건.

### 데모 동작 가능 상태

- 1~3단계 데모 그대로 동작. 본 마일스톤은 측정/코드 변경 0건.
- `docs/prd-phase4/results/` 에 6 결과 보고서 commit (LP-1 / LP-2 / LP-3 / LP-4
  / horizontal-scaling / final).

### 회귀 보호

- 1~3단계 IT 그린. M-LOAD-3 `receiver-variants` 그린. 측정 사이클 종료 후 `docker
  compose down -v` 로 상태 정리.

### 후속 인계 (별도 commit 시리즈 — 본 PLAN commit 시퀀스 외)

- 단계 3 의 실제 SLO 임계 갱신 PR 발행:
  - `docs/prd-phase3/04-slo-and-alerts.md` §3.1 임계 숫자 갱신.
  - `docs/prd-phase3/04-slo-and-alerts.md` §3.4 "잠정값" 표기 갱신.
  - `docker/prometheus/rules/*.yaml` PromQL 임계 숫자 갱신.
- 후속 측정으로 갱신된 임계의 알람 발화 정확도 변동 확인 (별도 PR).

---

## 7. 본 PLAN 전체의 최종 게이트 (PLAN closeout)

본 PLAN 의 모든 마일스톤이 완료되었을 때 사용자가 확인해야 할 최종 체크리스트.

### 코드 품질

- [ ] `pnpm install` 0 에러.
- [ ] `pnpm typecheck` 0 에러.
- [ ] `pnpm test:unit` 그린 — UT-1~6 + 보강 + M-LOAD-3 `receiver-variants` 의
  단위 부분(있다면).
- [ ] `pnpm test:integration` 그린 — IT-S1~S7, IT-S1b, IT-S2b, IT-S6b, IT-R1,
  IT-OBS-1~12 + M-LOAD-3 `receiver-variants.integration.test.ts`.

### 도메인 격리 (3단계 IT-R1 보존)

- [ ] `core/` 의 어떤 식별자도 도메인 식별자 BANNED 세트와 단어 단위 일치하지
  않음.
- [ ] `webhook_relay_` 접두는 IT-R1 grep 예외 룰 안에서 통과.
- [ ] M-LOAD-3 의 variant-aware stub 이 `packages/demo/src/receiver/` 안에서만
  처리, `core/` 변경 0건.

### 데모 동작 (`docker compose up` 한 번)

- [ ] redis + api + worker + prometheus + grafana 5개 컨테이너 정상 기동 (1~3단계
  데모 그대로).
- [ ] k6 컨테이너는 `profiles: ["measure"]` 로 비실행 — `docker compose --profile
  measure run --rm k6 ...` 으로만 기동.
- [ ] `curl POST /webhooks` 가 `202 + jobId` (1~2단계 보장).
- [ ] 외부 수신자(`/_demo/receiver`) 도착 (1~2단계 보장).
- [ ] `/metrics` 가 C1~C11 + D1~D3 + W1~W4 전건 (3단계 보장).
- [ ] Prometheus UI `/api/v1/targets` 에 2 잡 (또는 `--scale worker=N` 시 N+1 잡)
  `up=1`.
- [ ] Grafana 4 대시보드 자동 import.

### 4단계 측정 결과 보존

- [ ] `docs/prd-phase4/results/` 에 6 결과 보고서 commit:
  - `LP-1_<date>.md` (M-LOAD-2).
  - `LP-2_<date>.md` (M-LOAD-3, 4 변형 행).
  - `LP-3_<date>.md` (M-LOAD-4).
  - `LP-4_<date>.md` (M-LOAD-4).
  - `horizontal-scaling_<date>.md` (M-LOAD-5).
  - `final_<date>.md` (M-LOAD-6).
- [ ] 각 보고서가 PRD `prd-phase4/02` §5.1 의 필수 메타데이터 8 항목 전건 기록.
- [ ] 측정 분산 ±5% 안 확인 (knee point 영역 LP-3 제외 — 사용자 결정).

### 카디널리티 (3단계 IT-OBS-11 보존)

- [ ] 4단계 측정 후에도 메트릭당 시계열 수 ≤ 1000 + k6 메트릭(`k6_http_*`) 은
  `job=k6` 분리.

### 셧다운 (3단계 보장 보존)

- [ ] SIGTERM 전송 시 `/webhooks` 503, `/healthz` 503, `/metrics` 200 유지 (Q-OBS-2
  (a) 정합).
- [ ] 잔여 작업 없는 정상 종료 시 exit code 0. 타임아웃 시 exit code 1.

### SLO 임계 갱신 PR 인계 (별도 commit 시리즈)

- [ ] M-LOAD-6 §11 의 PR template 글자 단위 정합으로 단계 3 의 실제 PR 발행.
- [ ] `prd-phase3/04` §3.1 의 임계 숫자만 갱신.
- [ ] `prd-phase3/04` §3.4 "잠정값" 표기 갱신.
- [ ] `docker/prometheus/rules/*.yaml` 의 PromQL 임계 숫자 갱신.
- [ ] SLI PromQL 형태 / 측정 윈도우 / burn rate / 알람 YAML 구조 변경 0건.

### 본 PLAN 범위 보호

- [ ] `packages/streams-internals/` 변경 0건.
- [ ] outline 3 파일 (`README.md`, `00-decisions-needed.md`, `01-milestones.md`)
  변경 0건.
- [ ] `docs/prd-phase4/00~05.md` 본문 변경 0건.
- [ ] `docs/architecture.md`, `CLAUDE.md`, `README.md` 본문 변경 0건 (PLAN
  closeout 후 별도 PR — C-LOAD-1 / C-LOAD-4 / C-LOAD-9 / C-LOAD-14 / C-LOAD-15).

### 결정 보존

- [ ] 1~2단계 Resolved 21건 보존 (`docs/plan/00-decisions-needed.md` 변경 없음).
- [ ] 3단계 Resolved 15건 보존 (`docs/plan-phase3/00-decisions-needed.md` 변경
  없음).
- [ ] 4단계 PRD Resolved 13건 보존 (`docs/prd-phase4/00-decisions-needed.md` 변경
  없음).
- [ ] 본 PLAN 실행 중 새 Q-LOAD-N-PLAN-M 추가가 있었다면 `00-decisions-needed.md`
  §3 에 추적 가능.

---

## 8. PRD 변경 제안 (C-LOAD-1~15) 최종 매핑

본 PLAN 안에서 직접 적용된 C-LOAD 와 별도 PR 로 사용자가 결정 위임된 C-LOAD 를
단일 출처로 정리한다 (`08-cross-cutting.md` §10 짝).

> **최종 확정 시점:** M-LOAD-6 — 본 PLAN 의 모든 마일스톤 종료 시점에 갱신. 표의
> ✅ (적용 완료) / 🔵 (별도 commit 시리즈 인계) / ❌ (별도 PR 위임) 상태는 M-LOAD-6
> 단계에서 잠긴다.

### 본 PLAN 내 직접 적용 (5건)

| 상태 | C-LOAD ID | 적용 마일스톤 | 적용 형태 |
|------|-----------|----------------|------------|
| ✅ | **C-LOAD-3** | M-LOAD-1 단계 1 | `docker-compose.yml` 에 `k6` 서비스 추가 (profile=measure) |
| ✅ | **C-LOAD-5** | M-LOAD-1 단계 7 | `.env.example` 에 `K6_TARGET_URL` / `K6_API_BEARER_TOKEN` / `K6_PROMETHEUS_RW_SERVER_URL` 3 키 추가 |
| 🔵 | **C-LOAD-6** | M-LOAD-6 단계 3 (별도 commit 시리즈) | `prd-phase3/04` §3.1 임계 숫자 갱신 PR |
| 🔵 | **C-LOAD-7** | M-LOAD-6 단계 3 (별도 commit 시리즈) | `prd-phase3/04` §3.4 "잠정값" 표기 갱신 |
| 🔵 | **C-LOAD-8** | M-LOAD-6 단계 3 (별도 commit 시리즈) | `docker/prometheus/rules/*.yaml` PromQL 임계 숫자 갱신 |

### 별도 PR 위임 (10건, ❌)

| 상태 | C-LOAD ID | 대상 문서 | 갱신 제안 | 처리 시점 |
|------|-----------|-----------|-----------|------------|
| ❌ | **C-LOAD-1** | `docs/architecture.md` §5 | "부하 측정, p50/p99, 수평 확장 SLO — 4단계 PRD" 줄을 "보장한다" 절로 이동 | PLAN closeout 후 별도 PR |
| ❌ | **C-LOAD-2** | 본 PRD `prd-phase4/00-overview` §5 AC4.2 | 본 PRD 본문 갱신 시 동시 갱신 | 본 PRD 본문 변경 — 본 PLAN 범위 밖 |
| ❌ | **C-LOAD-4** | `docs/architecture.md` §2 컴포넌트 표 | "k6 (측정 도구)" 행 추가 | PLAN closeout 후 별도 PR |
| ❌ | **C-LOAD-9** | `docs/architecture.md` §5 "보장한다" | SLO-H-1 / SLO-H-2 항목 추가 | M-LOAD-5/6 완료 후 별도 PR |
| ❌ | **C-LOAD-10** | (신규 자리) | Redis HA / Cluster PRD 자리 예약 | 트리거 발동 후 별도 PRD |
| ❌ | **C-LOAD-11** | `docs/prd/04` 또는 `architecture.md` §2 | `--scale worker=N` N 매트릭스 결과 cross-link | PLAN closeout 후 별도 PR |
| ❌ | **C-LOAD-12** | (신규 자리) | 운영 PRD 자리 예약 | 본 PRD 범위 밖 N4.1 |
| ❌ | **C-LOAD-13** | (신규 자리) | 카오스 엔지니어링 PRD 자리 예약 | 본 PRD 범위 밖 N4.3 |
| ❌ | **C-LOAD-14** | `README.md` 운영 노트 | "SLO-H-1 / SLO-H-2 실측 기반 잠금" 추가 | PLAN closeout 후 별도 PR |
| ❌ | **C-LOAD-15** | `CLAUDE.md` §3 폴더 구조 | `docker/k6/scenarios/`, `docker/k6/results/`, `docker/k6/scripts/` 추가 명시 | PLAN closeout 후 별도 PR |

### 본 PLAN 완료 후 처리 순서 (사용자 결정)

위 ❌ 10건의 처리 순서는 사용자가 PLAN closeout 후 결정. 권장 순서 (3단계
plan-phase3 의 d624154~b0bb9e5 7 commits 패턴 정합):

1. **C-LOAD-1, 4, 9** — `docs(architecture)`.
2. **C-LOAD-11** — `docs(prd/04)` 또는 `docs(architecture) §2`.
3. **C-LOAD-14** — `docs(readme)`.
4. **C-LOAD-15** — `docs(claude)`.
5. **C-LOAD-2** — 본 PRD `prd-phase4/00-overview` 본문 변경 (별도 결정).
6. **C-LOAD-10, 12, 13** — 신규 PRD 자리 예약 (트리거 발동 후 또는 별도 결정).

---

## 9. PRD 변경 제안 (없음 — 본 PLAN 안)

본 PLAN 묶음 (`docs/plan-phase4/`) 작성 중 PRD `prd-phase4/00~05.md` 의 변경
제안은 0건. 본 PLAN 은 PRD 가 잠근 결정 위에서 실행 시퀀스만 정한다.

본 PLAN 실행 중 PRD 모순 발견 시 임의로 PRD 본문을 변경하지 않고 `00-decisions-needed.md`
§3 에 새 Q-LOAD-N-PLAN-M 으로 추가 + 사용자 결정 대기 (자율 일탈 사전 승인
규칙).

---

## 10. 결정 자리 (`00-decisions-needed.md` cross-link)

본 PLAN 진입 시점의 결정 대기: **0건** (`00-decisions-needed.md` §1 정합).

본 PLAN 실행 중 발생할 수 있는 모호 영역 (사전 가이드, `00-decisions-needed.md`
§3):

- 측정 분산 ±5% 초과 시 처리 절차 (M-LOAD-2~5).
- Redis OOM / 워커 OOM 발생 시 PLAN 중단 vs 측정 변수로 기록 (M-LOAD-4, M-LOAD-6).
- `prd-phase3/04` §3.1 SLO 임계 재조정 PR 의 본문 형식 (M-LOAD-6).
- `--scale worker=N` 의 N 값 추가 필요 (M-LOAD-5).
- docker-compose.yml 의 k6 서비스 spec 의 사소한 결정 (M-LOAD-1).

발생 시 본 §10 + `00-decisions-needed.md` §3 에 새 Q-LOAD-N-PLAN-M 으로 추가 +
사용자 결정 대기.
