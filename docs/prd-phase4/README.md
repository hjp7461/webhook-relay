# PRD Index — Phase 4 (Load · Measurement · Horizontal Scaling)

이 디렉터리는 본 저장소의 **4단계 범위 — 부하 테스트 · p50/p99 실측 · 수평 확장
SLO 검증** 에 대한 제품 요구 문서(PRD) 묶음입니다. 1~2단계 PRD(`docs/prd/`)가
"큐가 무엇을 보장하는가"를 정의하고, 3단계 PRD(`docs/prd-phase3/`)가 "그 보장을
어떻게 관측하는가"를 정의했다면, 본 PRD 는 **"그 보장과 관측 평면이 실제 부하
하에서도 잠긴 임계 안에 머무는가"** 를 정량적으로 증명하는 단계입니다.

> 단일 소스 오브 트루스 우선순위(엄수):
> 1. [`CLAUDE.md`](../../CLAUDE.md) — 본 PRD 는 §2 기술 스택과 §3 폴더 경계를 어기지 않습니다.
> 2. [`docs/plan/00-decisions-needed.md`](../plan/00-decisions-needed.md) — 1~2단계 21건 Resolved 결정을 뒤집지 않습니다.
> 3. [`docs/plan-phase3/00-decisions-needed.md`](../plan-phase3/00-decisions-needed.md) — 3단계 15건 Resolved 결정을 뒤집지 않습니다.
> 4. [`docs/prd/`](../prd/) (1~2단계 PRD), [`docs/prd-phase3/`](../prd-phase3/) (3단계 PRD) — 모든 §AC/§I/§F 를 침범하지 않습니다.
> 5. [`docs/architecture.md`](../architecture.md) — 본 PRD 가 향후 architecture 에 반영될 항목을 정의합니다.
>
> 본 PRD 가 위 우선순위와 충돌하면 본 PRD 가 갱신 대상입니다.

구현 코드(부하 시나리오 스크립트, 측정 자동화, 결과 분석 노트북, 회귀 가드
통합 테스트)는 본 PRD 가 승인된 뒤 **후속 PLAN 단계**(`docs/plan-phase4/`,
별도 commit 시리즈)에서 작성합니다. 본 PRD 단계에서는 코드(소스 파일,
`package.json`, `docker-compose.yml`, CI workflow 등)를 작성/수정하지 않습니다.

---

## 본 PRD 의 범위 한 줄 요약

> **결정된 부하 도구로 1~2단계 IT 시나리오를 정량 부하 프로필(RPS · 페이로드
> 분포 · 측정 윈도우)로 확장하고, 3단계가 노출한 메트릭/SLO PromQL 을 단일
> 출처로 사용해 p50/p99 · 처리량 · 카디널리티 · 에러 예산 소진율을 실측한다.
> 워커 N 의 변동에 따른 처리량/지연/큐 길이의 함수 형태를 측정해 3단계 SLO
> 잠정값(99.5% / 0.5s / 5s / 1%)을 실측 기반으로 재조정한다. 부록 트랙(Streams
> Internals) 의 추상화 비용 벤치마크는 본 PRD 에서 다루지 않는다(별도 단계).**

---

## 읽는 순서

| # | 파일 | 한 줄 설명 |
|---|------|------------|
| 00 | [`00-overview.md`](./00-overview.md) | 비전 · 목표/비목표 · 대상 사용자(SRE / Performance Engineer / Backend) · 성공 지표 · 1~3단계 PRD 와의 정합 · 용어집 |
| 01 | [`01-load-profiles.md`](./01-load-profiles.md) | 부하 프로필 카탈로그 — RPS 등급(낮음/중간/높음/스파이크), 페이로드 분포(small/medium/large), 1~2단계 IT 시나리오와의 매핑(LP-N 카탈로그) |
| 02 | [`02-measurement-tools-and-environment.md`](./02-measurement-tools-and-environment.md) | 측정 도구 선택(k6 / Artillery / Vegeta / 직접 구현 비교 + 결정 잠금), 토폴로지(로컬 단일 머신 / CI / 별도 환경), 격리 정책, 재현성 보장 |
| 03 | [`03-targets-and-rebaseline.md`](./03-targets-and-rebaseline.md) | 측정 대상 지표(처리량 / p50 / p99 / 카디널리티 / DLQ 적재율) + 3단계 SLO 잠정값의 실측 기반 재조정 규칙 + 갱신된 SLO 임계값 형식 |
| 04 | [`04-horizontal-scaling.md`](./04-horizontal-scaling.md) | 워커 N 변동에 따른 처리량 / 지연 / 큐 길이 함수 형태 측정. `docker compose up --scale worker=N` 자동화. 수평 확장 SLO 정의 (N 에 따른 처리량 선형성, 지연 안정성). Redis 단일 인스턴스 한계 식별 |
| 05 | [`05-out-of-scope-and-open-questions.md`](./05-out-of-scope-and-open-questions.md) | 본 PRD 밖 항목(Alertmanager 라우팅, Redis Cluster, Streams Internals 비교 등) + 오픈 퀘스천(Q-LOAD-N) + PRD 변경 제안 통합 |

PLAN 묶음(별도 디렉터리 `docs/plan-phase4/`) 은 본 PRD 승인 후 작성합니다. 3단계와
동일 패턴: PRD → PLAN → 구현 commit 시리즈.

---

## 1~3단계 PRD 와의 관계

본 PRD 는 다음 항목들을 **자연스러운 진화**로 다룹니다. **1~3단계의 어떤 §AC/§I/§F 도
뒤집지 않습니다.**

| 1~3단계 항목 | 본 PRD 가 받아 다루는 방식 |
|--------------|-----------------------------|
| 1~2단계 IT-S1~S7 시나리오 (해피패스 / 멱등성 / 재시도 / DLQ / stalled / 셧다운) | 각 시나리오를 정량 부하 프로필(LP-N)로 확장. 단일 실행 → 지속 부하 변환 |
| 3단계 §3 메트릭 카탈로그 (C1~C11 / D1~D3 / W1~W4) | 본 PRD 의 측정 대상 SLI 의 단일 출처. 글자 단위 정합(I5.3 정합) |
| 3단계 §4 SLO 정의 (가용성 99.5% / 등록 지연 p99 ≤ 0.5s / 전달 지연 p99 ≤ 5s / DLQ ≤ 1%) | **잠정값** 으로 명시된 임계를 본 PRD 의 실측 분포로 재조정. SLI PromQL 형태와 측정 윈도우는 I6.1 잠금 유지 |
| 3단계 IT-OBS-11 (카디널리티 ≤ 1000) | 부하 하에서도 카디널리티 가드가 유지되는지 정량 검증 |
| 1~2단계 API/Worker 분리 (`SERVICE_MODE` + `--scale worker=N`) | 수평 확장 SLO 측정의 기반. 본 PRD §4 가 N 의 함수 형태를 측정 |

### 명시적으로 침범하지 않는 항목

- 1~2단계의 모든 §I (불변식), §AC (수용 기준), §F (기능 요구사항). 부하 하에서도 그대로 유지되어야 한다.
- 3단계의 메트릭 이름 / 라벨 enum / 카디널리티 예산 / SLI PromQL 형태(I6.1).
- CLAUDE.md §2 기술 스택. 본 PRD 가 부하 도구로 새 npm 의존성을 도입한다면 §2 표에 추가하는 절차를 명문화한다(`02` §결정 잠금).

---

## 본 PRD 의 명시적 비목표 (Non-Goals)

- **Alertmanager 라우팅 / 온콜 / 인시던트 런북** — 운영 PRD 책임 (3단계 §5.4 와 동일).
- **Redis HA / Cluster / Sentinel** — 본 PRD 는 단일 Redis 인스턴스의 한계만 식별. HA 도입은 별도 PRD.
- **부록 트랙 (Streams Internals)** — Raw Redis Streams 직접 구현 + BullMQ 대비 비교는 본 PRD 범위 밖. 별도 단계.
- **운영 배포 자동화 (Terraform / Helm / ArgoCD 등)** — 본 PRD 는 로컬 + CI 측정에 한정.
- **카오스 / 실패 시뮬레이션** — 부하 + 워커 강제 종료 결합 (예: IT-S6 의 부하 변형) 은 별도 카오스 엔지니어링 PRD 책임 (Q-LOAD-5 (a) 결정).

---

## 결정 대기 항목 (Q-LOAD-1~N)

본 PRD 작성 진입 전에 사용자가 잠금해야 하는 결정과 PRD 본문 안에서 결정 위임되는
항목을 [`00-decisions-needed.md`](./00-decisions-needed.md) 가 단일 출처로 추적합니다.
잠금 전에는 본 PRD 의 어느 파일도 작성하지 않습니다(자율 일탈 사전 승인 규칙 정합).

---

## 4단계 PRD 의 단일 출처 / 단일 사실

- **메트릭 / 라벨:** `prd-phase3/01` §3 의 카탈로그(C1~C11 / D1~D3 / W1~W4) 가 단일 출처. 본 PRD 는 새 메트릭을 정의하지 않는다.
- **SLO SLI PromQL 형태 / 측정 윈도우:** `prd-phase3/04` §3.1 + §3.3 잠금. 본 PRD 는 임계 숫자만 갱신.
- **부하 프로필 (LP-N):** 본 PRD `01` 이 단일 출처.
- **측정 도구 + 토폴로지:** 본 PRD `02` 가 단일 출처.
- **수평 확장 SLO:** 본 PRD `04` 가 단일 출처 (3단계에는 없음).
