# 08. Cross-Cutting Concerns — 횡단 관심사 (Phase 4 Load · Measurement)

> 본 문서는 특정 마일스톤에 귀속되지 않고 **M-LOAD-1~6 전 마일스톤에 걸쳐 일관
> 적용** 되어야 하는 정책을 모은다. 각 항목은 "어느 마일스톤에서 처음 도입되는가"
> + "어느 마일스톤이 가장 자주 의존하는가" 를 표로 명시한다.
>
> **AI 협업 5원칙 적용:** 본 문서의 정책은 CLAUDE.md §4·§8 + PRD `prd-phase4/01`·
> `02`·`03`·`04` 의 규약을 PLAN 수준으로 풀어 적은 것. **임의 결정을 더하지
> 않는다.** 모호 사항은 `00-decisions-needed.md` §3 의 새 Q-LOAD-N-PLAN-M 행으로
> 보낸다.

---

## 1. 측정 호스트 메타데이터 강제

### 정책 (PRD `prd-phase4/02` §5 + I4.9 정합)

- 모든 결과 보고서(`docs/prd-phase4/results/*.md`) 의 YAML 헤더가 **PRD `02`
  §5.1 의 필수 8 항목** 을 전건 기록.
- 필수 8 항목 (재인용):
  1. 측정 호스트 CPU 모델 + 주파수 + RAM.
  2. 측정 호스트 OS.
  3. Docker 버전.
  4. k6 버전.
  5. git commit SHA (40자 hex).
  6. 측정 일시 (시작 / 종료 ISO 8601 UTC).
  7. LP-ID + 워커 수 N + Redis 토폴로지 + cgroup 한정값.
  8. 부하 패턴 (T) + 페이로드 분포 (P).
- 누락 시 측정 결과 **무효** 처리(PRD `02` §5.3).
- 자동 수집 강제: `docker/k6/scripts/collect-metadata.sh` (M-LOAD-1 단계 4) 가
  단일 출처.

### 도입 시점 매트릭스

| 마일스톤 | 도입 항목 |
|---------|-----------|
| **M-LOAD-1** | `collect-metadata.sh` 헬퍼 + `docs/prd-phase4/results/README.md` 형식 잠금 |
| **M-LOAD-2** | LP-1 첫 보고서가 형식 정합 검증 (첫 결과 commit) |
| **M-LOAD-3** | LP-2 4 변형 보고서가 같은 형식 |
| **M-LOAD-4** | LP-3 / LP-4 보고서가 같은 형식 |
| **M-LOAD-5** | horizontal-scaling 보고서가 같은 형식 + `worker_count: N` 필수 |
| **M-LOAD-6** | final 종합 보고서가 M-LOAD-2~5 메타데이터 일관성 검증 |

### 위반 시 검출

- 보고서 commit 시 사람 검토 — 누락 항목이 발견되면 결과 무효 + 재측정.
- M-LOAD-6 의 final 종합 보고서가 M-LOAD-2~5 메타데이터의 일관성 (같은 호스트 /
  cgroup / git commit) 검증을 수행 — 불일치 시 본 PLAN 전체 재측정 또는 사용자
  결정.

---

## 2. 결과 보고서 commit 정책

### 정책 (PRD `prd-phase4/02` §6 + Q-LOAD-12 (a) Markdown 표 정합)

- 측정 사이클 = "측정 실행 → 결과 추출 → 보고서 작성 → commit → push" 의 1
  사이클.
- 부분 실패 (측정 무효 조건 발동) 시 보고서에 **"실패 사유" 절** 을 명시 + 사용자
  검토.
- 결과 보고서는 `docs/prd-phase4/results/` 디렉터리의 Markdown 파일로 commit. raw
  artifact (`docker/k6/results/<id>/k6-*.json` 등) 은 `.gitignore` 대상 (M-LOAD-2
  단계 6 잠정 권고).

### 명명 규칙 (M-LOAD-1 단계 5 의 `results/README.md` 단일 출처)

- LP 측정: `<LP-ID>_<YYYY-MM-DD>.md` (예: `LP-1_2026-06-01.md`).
- 4 변형(LP-2): LP-2 단일 보고서 안의 4 행 (변형별 별도 행).
- 수평 확장: `horizontal-scaling_<YYYY-MM-DD>.md`.
- 최종 종합: `final_<YYYY-MM-DD>.md`.
- knee point 정밀 식별 (M-LOAD-6 선택): `micro-n-matrix_<YYYY-MM-DD>.md`.

### 도입 시점 매트릭스

| 마일스톤 | 적용 |
|---------|------|
| **M-LOAD-1** | `docs/prd-phase4/results/README.md` 가 형식 + 명명 규칙 잠금 |
| **M-LOAD-2~6** | 각 마일스톤이 형식 정합 보고서 commit |

### 위반 시 검출

- 보고서 작성 시 형식 위반 → PR 리뷰에서 거부.
- M-LOAD-6 최종 보고서 작성 시 M-LOAD-2~5 의 보고서가 명명 규칙 / 형식 정합 검증.

---

## 3. Prometheus time range 분리

### 정책 (PRD `prd-phase4/02` §7.3 + `prd-phase4/03` §3.2 정합)

- 같은 Prometheus 인스턴스가 여러 측정 사이클의 시계열을 누적한다 (기본 보존
  기간 2주).
- 측정별 time range 로 PromQL 쿼리 분리 — `t_start` / `t_end` 가 메타데이터에
  기록.
- `query_range` API + `range = [t_start, t_end]` + `step = 15s` 가 본 PRD 의 표준
  쿼리 형태.
- `query` (instant) API 는 SLO-4 (DLQ 적재율, 1h rate 윈도우) 와 W3 attempts 분포
  에만 사용 — 측정 윈도우 끝 `t = t_end`.

### k6 메트릭의 별도 job label 분리

- k6 자체 메트릭 (`k6_http_*`) 은 Prometheus remote write 로 전송되며 `job=k6`
  로 분리 (PRD `prd-phase4/02` §11 R4.8).
- 3단계 IT-OBS-11 카디널리티 가드(`webhook_relay_*` 시계열 ≤ 1000) 의 단언 대상
  에서 k6 메트릭은 제외 — `webhook_relay_*` 이름 정규식 외이므로 자연 분리.

### 도입 시점 매트릭스

| 마일스톤 | 적용 |
|---------|------|
| **M-LOAD-1** | `docker-compose.yml` 의 prometheus command 에 `--web.enable-remote-write-receiver` 추가 (단계 2) |
| **M-LOAD-2~5** | 각 측정 사이클에서 `t_start` / `t_end` 기록 + PromQL 쿼리 분리 |
| **M-LOAD-6** | final 종합 보고서가 측정별 time range 일관성 검증 |

### 위반 시 검출

- Prometheus query 결과 시점이 메타데이터의 `t_start` / `t_end` 와 다르면 측정
  결과 무효 (PRD `03` §3.4).
- 카디널리티 폭주 (k6 메트릭이 `webhook_relay_*` 정규식에 잡히면) → IT-OBS-11
  빨강 → 즉시 보고.

---

## 4. k6 시나리오의 결정성 패딩

### 정책 (PRD `prd-phase4/01` §4.3 + I4.5 페이로드 결정성)

- 모든 k6 시나리오의 페이로드는 **결정성 패딩** (예: `{"_pad": "x".repeat(...)}`)
  으로 목표 바이트 크기에 맞춘다.
- 난수 페이로드 (`Math.random()` 기반 페이로드 생성) **금지**.
- HMAC 서명은 본문에 의존하므로(`packages/demo/src/domain/hmac.ts`) 페이로드 본문
  이 결정성이어야 측정 재현성이 보장된다.
- 페이로드 크기 분포 (LP-2 의 80/15/5) 의 선택 자체는 결정성 시드 또는 가중치
  순환 — `Math.random()` 시드를 `K6_SEED` 환경변수 또는 시나리오의 시작 시각으로
  잠금.

### 도입 시점 매트릭스

| 마일스톤 | 적용 |
|---------|------|
| **M-LOAD-2** | LP-1 시나리오의 small 1KB 고정 결정성 패딩 |
| **M-LOAD-3** | LP-2 시나리오의 80/15/5 분포 결정성 선택 + 각 크기 결정성 패딩 |
| **M-LOAD-4** | LP-3 large 64KB 고정 + LP-4 small 1KB 고정 결정성 패딩 |
| **M-LOAD-5** | LP-2 재사용 (M-LOAD-3 결정성 정합 유지) |

### 위반 시 검출

- HMAC 서명 재현 불가 → 재측정 시 결과 분산이 ±5% 초과 (PRD `02` §7.2) →
  무효.
- 페이로드 분포가 의도된 80/15/5 와 다르면 D3 히스토그램 분포로 검증 가능 (LP-2
  결과 보고서의 보강 항목).

---

## 5. Redis flush 시점

### 정책 (PRD `prd-phase4/02` §7.3 측정 격리 + `prd-phase4/03` §3.1 [8] 단계 정합)

- 각 측정 사이클 종료 후 `docker compose down -v` 로 Redis 데이터 삭제.
- 다음 측정 사이클의 부트스트랩 [1] 단계부터 재시작.
- 누적 큐 영향 방지 — 이전 측정의 작업이 다음 측정에 영향을 주지 않도록.

### 측정 사이 격리 (4 변형 / 4 N 매트릭스)

- LP-2 의 4 변형 (normal / s3 / s4 / s5) 사이: 각 변형 후 `docker compose down -v`.
- LP-2 의 4 N 매트릭스 (1 / 2 / 5 / 10) 사이: 각 N 후 `docker compose down -v`.
- LP-1 → LP-2 → LP-3 → LP-4 의 마일스톤 간 격리: 각 마일스톤 사이클 사이 `docker
  compose down -v`.

### 도입 시점 매트릭스

| 마일스톤 | 적용 |
|---------|------|
| **M-LOAD-2** | `run-lp-1.sh` 가 측정 후 `docker compose down -v` |
| **M-LOAD-3** | `run-lp-2.sh` 가 4 변형 사이 `docker compose down -v` |
| **M-LOAD-4** | `run-lp-3.sh` + `run-lp-4.sh` 가 측정 후 `docker compose down -v` |
| **M-LOAD-5** | `run-horizontal-scaling.sh` 가 4 N 사이 `docker compose down -v` |

### 위반 시 검출

- 측정 시작 시점에 Prometheus targets `up=1` 확인 (이전 측정의 leftover process
  가 남아 있으면 새 측정의 부트스트랩이 실패).
- C1 `queue_depth{job_state="waiting"}` 가 측정 시작 시점에 0 이 아니면 누적 영향
  의심 → 보고서 "실패 사유" 절.

---

## 6. cgroup 한정값의 호스트 사양 정합

### 정책 (PRD `prd-phase4/02` §4.2 + §4.3 + Q-LOAD-2 (b) 정합)

- 측정 호스트 사양 대비 cgroup 한정값 총합이 다음 조건 만족:
  - **N=1 측정 (`cpus` 총합 = 6.0):** 호스트 코어 수 ≥ 6.
  - **N=5 측정 (`cpus` 총합 = 10.0):** 호스트 코어 수 ≥ 10.
  - **N=10 측정 (`cpus` 총합 = 15.0):** 호스트 코어 수 ≥ 15.
  - **메모리 총합 (N=1 기준 약 3GB, N=10 기준 약 7.5GB):** 호스트 RAM ≥ 8GB.
- over-commit (총합이 호스트 한계 초과) 시 cgroup 격리 의미 약화 — 결과 메타
  데이터에 over-commit 여부 기록 (PRD `prd-phase4/04` §2.3 정합).
- under-allocate (cgroup 한정값이 너무 작아 워커가 자기 자원을 다 못 씀) 도 측정
  분산 ±5% 초과 원인 가능 — PRD `02` §7.2.

### Docker Desktop (macOS / Windows) vs Linux native

- Docker Desktop: VM 안에서 cgroup 적용. native Linux 와 격리 수준 다를 수 있음.
  Apple Silicon (M1/M2/M3) 은 ARM64 이미지 우선 — `grafana/k6` 는 multi-arch.
- Linux native: cgroup v2 (RHEL 9 / Ubuntu 22.04 이상) 환경에서 직접 적용.

### 도입 시점 매트릭스

| 마일스톤 | 적용 |
|---------|------|
| **M-LOAD-1** | 단계 6 호환성 체크 절차 명세 + 호스트 사양 검증 |
| **M-LOAD-5** | N=5 / N=10 측정 전 호환성 재검증 (cgroup × N 매트릭스) |

### 위반 시 검출

- N=5 / N=10 측정 결과의 측정 분산이 N=1 / N=2 대비 비정상 증가 → over-commit
  의심 → 사용자 보고 + 결정 위임.
- 측정 호스트 사양이 본 PLAN 의 한정값 총합 미달 → M-LOAD-1 단계 6 에서 멈춤 +
  사용자 결정 위임 (cgroup 한정값 축소 vs N 매트릭스 축소 vs 호스트 교체).

---

## 7. 측정 분산 ±5% 초과 처리 절차

### 정책 (PRD `prd-phase4/02` §7.2 + I4.12 정합)

- 측정 분산 (재측정 1회의 핵심 SLI 차이):
  - 처리량 (RPS achieved): ±2% 안.
  - p99 처리 지연 (W2) / p99 등록 지연 (D2): ±5% 안.
  - 메트릭 카디널리티: 변동 없음 (구조적 수치).
  - DLQ 적재율 (SLO-4): ±10% 안 (낮은 절대값으로 상대 분산 큼).
- ±5% 초과 시 1차 대응 절차:
  1. 측정 호스트 노이즈 점검 — 백그라운드 프로세스 / 시스템 업데이트 / 외부 부하.
  2. cgroup 한정값 호스트 사양 정합 (§6) 재검증.
  3. k6 시나리오의 RPS 분산 점검 — `k6 summary` 의 RPS achieved 값.
  4. Prometheus targets `up=1` 유지 확인 (scrape 실패 없음).
- 1차 대응 후 재측정이 ±5% 안 → 정상.
- 1차 대응 후에도 ±5% 초과 → 사용자 보고 + 결정 위임 (재측정 / 환경 점검 / 결과
  폐기).

### knee point 영역의 특수 처리 (LP-3)

- knee point 영역의 측정 분산은 본질적으로 큼 (PRD `prd-phase4/04` §5.5 한계
  정합).
- LP-3 의 ±5% 초과를 무효로 간주할지 vs 측정 변수로 기록할지는 사용자 결정.
- 결과 보고서에 "knee point 영역의 분산 본질적 큼" 명시 + 사용자 검토.

### 도입 시점 매트릭스

| 마일스톤 | 적용 |
|---------|------|
| **M-LOAD-2** | LP-1 baseline 측정 분산 ±5% 안 확인 (측정 환경 신뢰성 검증) |
| **M-LOAD-3** | LP-2 4 변형 각각 ±5% 안 |
| **M-LOAD-4** | LP-3 knee point 영역의 특수 처리 |
| **M-LOAD-5** | 4 N 각각 ±5% 안 |
| **M-LOAD-6** | M-LOAD-2~5 결과 일관성 검증 |

### 위반 시 검출

- 측정 사이클의 [7] 통계 추출 단계에서 분산 계산 → ±5% 초과 시 1차 대응 절차
  자동 진입.

---

## 8. SLO 임계 갱신 PR 의 글자 단위 정합

### 정책 (M-LOAD-6 단계 2 의 PR template 단일 출처)

- SLO 임계 갱신 PR 의 본문 형식은 M-LOAD-6 `07-m-load-6-...md` §11 의 template
  와 글자 단위 정합.
- 변경 대상:
  - `docs/prd-phase3/04-slo-and-alerts.md` §3.1 표의 임계 숫자만.
  - `docs/prd-phase3/04-slo-and-alerts.md` §3.4 "잠정값" 표기 → "실측 기반 갱신
    (yyyy-mm-dd, `docs/prd-phase4/results/final_<date>.md`)".
  - `docker/prometheus/rules/*.yaml` 의 PromQL 임계 숫자.
- 변경 금지 (3단계 I6.1 / I6.2 / I3.1 / I3.2 정합 유지):
  - SLI PromQL 형태 (메트릭 이름 / 라벨 / 집계 함수).
  - 측정 윈도우 (`[5m]` / `[1h]` / 28d / 7d / 1d).
  - burn rate 표준값 (14.4× / 6×).
  - 알람 규칙 YAML 의 구조 (group / for / labels / annotations).
  - 메트릭 이름 / 라벨 enum.

### 도입 시점

| 마일스톤 | 적용 |
|---------|------|
| **M-LOAD-6** | 단계 2 가 PR template 잠금 + 단계 3 이 별도 commit 시리즈로 실제 PR 발행 |

### 위반 시 검출

- PR 본문이 template 와 글자 단위 정합 위반 → 사용자 리뷰에서 거부.
- 변경 금지 항목이 PR diff 에 포함 → 3단계 IT-OBS-10 / IT-OBS-11 빨강 → 즉시 보고
  + 회귀 가드.

---

## 9. 횡단 정책 간 우선순위

본 문서의 정책이 서로 충돌할 때:

1. **측정 결과 무효 조건 (PRD `03` §3.4)** > 다른 모든 항목 — 무효 결과는 보고
   서에 들어가지 못한다.
2. **메타데이터 완전성 (§1)** > 측정 사이클 완료 — 메타데이터 누락 시 측정 결과
   무효.
3. **결정성 패딩 (§4)** > k6 시나리오 단순성 — 난수 페이로드는 측정 재현성을 결정
   적으로 약화시킨다.
4. **Redis flush 시점 (§5)** > 측정 시간 단축 — 누적 영향이 측정 신뢰성을 깬다.
5. **cgroup 호환성 (§6)** > N 매트릭스 완전성 — 호스트 사양 미달 시 N=5 / N=10
   측정을 축소하거나 호스트 교체 결정 (사용자).
6. **SLO 임계 갱신 PR 의 글자 단위 정합 (§8)** > 갱신 속도 — 3단계 잠금 항목
   변경은 절대 금지.

---

## 10. 외부 PR 위임 정책 (C-LOAD 15건)

본 PLAN 안에서 직접 적용되는 C-LOAD (PRD `prd-phase4/05` §4 통합 표 정합):

| C-LOAD ID | 항목 | 적용 마일스톤 |
|-----------|------|----------------|
| **C-LOAD-3** | `docker-compose.yml` 에 k6 서비스 추가 | M-LOAD-1 단계 1 |
| **C-LOAD-5** | `.env.example` k6 환경변수 키 추가 | M-LOAD-1 단계 7 |
| **C-LOAD-6** | `prd-phase3/04` §3.1 임계 숫자 갱신 PR | M-LOAD-6 단계 3 (별도 commit 시리즈 인계) |
| **C-LOAD-7** | `prd-phase3/04` §3.4 "잠정값" 표기 갱신 | M-LOAD-6 단계 3 (별도 commit 시리즈 인계) |
| **C-LOAD-8** | `docker/prometheus/rules/*.yaml` 임계 숫자 갱신 | M-LOAD-6 단계 3 (별도 commit 시리즈 인계) |

본 PLAN 안에서 **별도 commit 시리즈 / 사용자 결정 위임** (10건):

| C-LOAD ID | 대상 문서 | 위임 이유 |
|-----------|-----------|-----------|
| **C-LOAD-1** | `docs/architecture.md` §5 "보장한다" 이동 | PLAN closeout 후 별도 PR |
| **C-LOAD-2** | 본 PRD `00-overview` §5 AC4.2 정합 | 본 PRD 본문 변경 — 본 PLAN 범위 밖 |
| **C-LOAD-4** | `docs/architecture.md` §2 컴포넌트 표 "k6" 행 | PLAN closeout 후 별도 PR |
| **C-LOAD-9** | `docs/architecture.md` §5 "보장한다" SLO-H-1/H-2 | M-LOAD-5/6 완료 후 별도 PR |
| **C-LOAD-10** | Redis HA / Cluster PRD 자리 예약 | 트리거 발동 후 별도 PRD |
| **C-LOAD-11** | `docs/prd/04` 또는 `architecture.md` §2 `--scale worker=N` 결과 | PLAN closeout 후 별도 PR |
| **C-LOAD-12** | 운영 PRD 자리 예약 | 본 PRD 범위 밖 N4.1 |
| **C-LOAD-13** | 카오스 엔지니어링 PRD 자리 예약 | 본 PRD 범위 밖 N4.3 |
| **C-LOAD-14** | `README.md` 운영 노트 "SLO-H-1/H-2" | PLAN closeout 후 별도 PR |
| **C-LOAD-15** | `CLAUDE.md` §3 폴더 구조 `docker/k6/` 추가 | 본 PLAN closeout 후 별도 PR |

> 본 PLAN 의 어떤 마일스톤도 위 별도 PR 들의 완료를 **전제로 하지 않는다**. 따라
> 서 본 PLAN 은 별도 PR 의 일정과 독립적으로 실행 가능 (3단계 plan-phase3 의
> C-MET 정책 정합).

상세 매핑은 `09-acceptance-gates.md` §8 표 단일 출처.
