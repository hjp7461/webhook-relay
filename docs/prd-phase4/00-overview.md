# 00. Overview — Phase 4 (Load · Measurement · Horizontal Scaling)

> 담당 페르소나: **Performance Engineer / SRE Specialist** · Backend Lead 보조
> 본 문서는 4단계 PRD 묶음의 진입점이다. 구현 코드는 후속 PLAN 단계에서 작성한다.

---

## 1. 컨텍스트 / 배경

1~2단계 PRD 는 본 시스템의 **보장**(at-least-once, 멱등성, 분류된 재시도, DLQ
단방향, stalled 회수, 그레이스풀 셧다운) 을 정의하고 7개 통합 시나리오(IT-S1~S7)
+ IT-R1 회귀 보호로 그 보장을 **테스트로** 증명했다. 3단계 PRD 는 그 보장이
운영 중에도 지켜지는지 **외부에서 관측**할 수 있도록 메트릭 / 대시보드 / SLO 를
정의했다.

그러나 3단계의 SLO 임계값은 **잠정값**(99.5% / p99 0.5s / p99 5s / 1%)으로
명시되어 있다. 운영 부하 측정 없이 채택한 숫자다(`prd-phase3/04` §3.4, Q-OBS-11).
또한 본 시스템은 `SERVICE_MODE=worker` + `docker compose up --scale worker=N` 로
워커를 수평 확장할 수 있으나, **N 이 늘어날 때 처리량/지연/큐 길이가 어떻게
움직이는지** 는 측정한 적이 없다.

본 PRD(4단계) 는 이 두 공백을 정량적으로 채운다.

- 1~2단계 IT-S1~S7 시나리오를 **지속 부하 프로필** 로 확장해, 잠정 SLO 가 실제
  부하 하에서 지켜지는지 측정한다.
- 그 측정 분포를 근거로 잠정 SLO 의 **임계 숫자만** 재조정한다(SLI PromQL 형태와
  측정 윈도우는 3단계의 I6.1 잠금 유지).
- 워커 N 의 함수 형태(처리량(N), p99(N), 큐 길이(N)) 를 측정해 본 시스템의
  **수평 확장 SLO** 를 정의한다.
- Redis 단일 인스턴스의 한계(knee point) 를 식별해, HA / Cluster 도입의 트리거
  조건을 명문화한다(도입 자체는 본 PRD 범위 밖).

> 4단계의 어필 포인트는 "처리량 X RPS 달성" 이 아니라, **"잠정값으로 잠겼던 SLO
> 임계를 실측 기반으로 재조정하고, 그 근거를 단일 측정 보고서로 잠근다"** 이다.
> 측정 자체보다 **측정의 신뢰성·재현성·해석의 단일 출처**가 중요한 어필 포인트
> (CLAUDE.md §1 정합).

---

## 2. 목표 (Goals)

본 PRD(4단계) 의 목표:

- **G4.1** 1~2단계 IT-S1~S7 + 3단계 IT-OBS-* 의 메트릭 매트릭스를 **지속 부하
  프로필(LP-N)** 로 확장한다(`01-load-profiles.md` §3). 단일 실행 → 지속 부하의
  변환을 카탈로그로 잠금.
- **G4.2** 측정 도구 **k6** (Q-LOAD-1 (a)) 와 측정 환경 **로컬 + cgroup 격리**
  (Q-LOAD-2 (b)) 를 단일 출처로 잠근다(`02-measurement-tools-and-environment.md`).
  측정 도구가 새 npm 의존성 도입이 아닌 Docker 이미지(`grafana/k6`) 추가이므로
  CLAUDE.md §2 정합.
- **G4.3** 3단계가 노출한 메트릭/라벨(C1~C11 / D1~D3 / W1~W4) 과 SLI PromQL
  (`prd-phase3/04` §3.1) 을 본 PRD 의 단일 측정 대상으로 사용한다. **새 메트릭을
  정의하지 않는다**(3단계 카탈로그의 글자 단위 정합 유지).
- **G4.4** 처리량 / p50 / p99 / 카디널리티 / DLQ 적재율을 **재현 가능한 실험
  프로토콜** 로 측정한다(`03-targets-and-rebaseline.md` §3). 측정 호스트의
  CPU/메모리 사양, cgroup 한정값, 부하 프로필 ID, 워커 수, Redis 토폴로지를
  결과 메타데이터로 명시 의무.
- **G4.5** 3단계 SLO 의 **임계 숫자만** 실측 분포 기반으로 재조정한다. SLI PromQL
  형태와 측정 윈도우(28d/7d/1d/1h/5m) + burn rate 표준(14.4×/6×) 은 변경하지
  않는다(3단계 I6.1, I6.2 잠금 유지).
- **G4.6** 워커 N 의 함수 형태를 측정해 본 시스템의 **수평 확장 SLO** 를 정의한다
  (`04-horizontal-scaling.md` §4). 예: "처리량(N) ≥ 처리량(1) × N × α (α 는 본
  PRD 가 잠그는 선형성 허용 오차)".
- **G4.7** Redis 단일 인스턴스의 **knee point** 를 식별해(`04-horizontal-scaling.md`
  §5), HA / Cluster 도입의 트리거 조건을 명문화한다. 도입 자체는 본 PRD 범위 밖.
- **G4.8** 측정 결과를 **단일 보고서 형식**(`docs/prd-phase4/results/` 또는
  README 갱신, 위치는 `02` §6 가 잠금) 으로 보존한다. 재측정 시 같은 형식으로
  덮어쓰기 가능. 회귀 가드 IT-LOAD-N (선택, Q-LOAD-13) 도입 여부는 `02` §8 가
  결정.

---

## 3. 비목표 (Non-Goals)

본 PRD 가 **명시적으로 다루지 않는** 항목.

- **N4.1 Alertmanager 라우팅 / 온콜 / 인시던트 런북** — 3단계 §5.4 와 동일하게
  운영 PRD 책임. 본 PRD 가 새 알람을 정의하지 않는다.
- **N4.2 Redis HA / Cluster / Sentinel 도입** — Q-LOAD-4 (a) 결정 정합. 본 PRD 는
  **한계 식별** 만. 도입 자체는 별도 운영 PRD.
- **N4.3 카오스 / 실패 시뮬레이션** — Q-LOAD-5 (a) 결정 정합. 부하 + 워커 강제
  종료 결합(IT-S6 부하 변형) 은 별도 카오스 엔지니어링 PRD.
- **N4.4 부록 트랙 (Streams Internals) 의 추상화 비용 벤치마크** — 본 PRD 는
  BullMQ 위의 본 시스템만 측정. Raw Redis Streams 직접 구현과의 비교는 별도
  단계.
- **N4.5 운영 배포 자동화** — Terraform / Helm / ArgoCD 등은 본 PRD 범위 밖.
  로컬 + cgroup 측정에 한정.
- **N4.6 새 메트릭 / 라벨 정의** — 3단계 카탈로그(C1~C11 / D1~D3 / W1~W4) 가
  단일 출처. 본 PRD 가 새 메트릭을 도입하지 않는다(G4.3 정합). 측정 결과 새
  메트릭이 필요해지면 `prd-phase3/` 의 별도 PR 로 처리.
- **N4.7 외부 수신자 측의 성능 측정** — 본 PRD 는 송신 측(api + worker) 의 성능만
  측정. 데모 수신자(`/_demo/receiver`) 의 응답 성능은 측정 환경 변수로 취급하되
  본 PRD 의 SLO 대상이 아님.

---

## 4. 대상 사용자 / 페르소나

- **Performance Engineer (주):** 본 PRD 의 부하 프로필 + 측정 프로토콜 + 결과
  보고서를 작성·검토하는 주체. 본 PRD 의 §3.4 SLO 잠정성 명시를 실측으로
  닫는 책임.
- **SRE / Observability Lead (보조):** 3단계 SLO 임계 재조정의 운영 영향 평가.
  알람 발화 정확도 변동(false positive / false negative) 추적.
- **Backend Lead (보조):** 본 PRD 결과가 1~2단계 보장에 영향을 주는지(예: stalled
  recovery 지연 분포가 SLO-3 전달 지연 안에 들어가는지) 검증. 코드 변경이 필요
  해지면 별도 commit 시리즈.
- **신규 입사자 / 코드 리뷰어 (간접):** 본 PRD 가 "이 시스템이 어느 부하까지
  지원하는가" 의 단일 출처 문서.

---

## 5. 성공 지표 / Done 정의

본 PRD 가 닫혀(closeout) 다음 PLAN 단계로 진입할 수 있는 조건.

- **AC4.0 PRD 6 파일 (`00-overview` + `01-load-profiles` + `02-measurement-tools-and-environment`
  + `03-targets-and-rebaseline` + `04-horizontal-scaling` + `05-out-of-scope-and-open-questions`)
  존재** 및 README 의 "읽는 순서" 표와 글자 단위 정합.
- **AC4.1 결정 잠금 표(`00-decisions-needed.md`) 의 Q-LOAD-1~13 전건 Resolved.**
  Open 0건이 PLAN 진입 조건.
- **AC4.2 부하 프로필(LP-N) 카탈로그 정의.** 각 LP-N 이 (i) RPS 등급 + (ii)
  페이로드 분포 + (iii) 측정 윈도우 + (iv) 1~2단계 IT-S 매핑을 명시.
- **AC4.3 측정 환경 잠금.** 측정 호스트 사양 메타데이터 형식 + cgroup 한정값 +
  Docker network 구성 + k6 + Prometheus + Grafana 설정의 단일 출처가 본 PRD 안에
  명시.
- **AC4.4 SLO 재조정 규칙 정의.** "실측 p99 의 1.5× 를 SLO 임계로 채택" 같은
  공식이 본 PRD 가 잠근 형태. 임계 숫자는 PLAN 측정 결과에 따라 자동 계산.
- **AC4.5 수평 확장 SLO 형태 정의.** 처리량(N) / p99(N) / 큐 길이(N) 의 함수
  형태(선형성 / 포화 / knee point) + 허용 오차 α 가 본 PRD 가 잠근 값.
- **AC4.6 본 PRD 범위 외 항목의 cross-link.** Alertmanager / Redis HA / 카오스
  / 부록 트랙 / 배포 자동화 의 각각의 "다음 단계" 가 §3 비목표 절에서 명시.
- **AC4.7 1~3단계 PRD 의 §AC / §I / §F 0건 침범.** README 의 "1~3단계 PRD 와의
  관계" 표가 글자 단위 정합 검증.

> 본 PRD 가 닫히는 시점에 PLAN 묶음(`docs/plan-phase4/`) 이 작성 가능해진다. PLAN
> 묶음은 본 PRD 의 잠금된 결정 위에서 실제 부하 스크립트 + 측정 자동화 + 결과
> 보고서 + (선택) 회귀 가드 IT-LOAD-N 통합 테스트를 단계별 마일스톤(M-LOAD-1~N)
> 으로 분해한다.

---

## 6. 1~3단계 PRD 와의 정합

본 PRD 는 1~3단계 PRD 의 어떤 §AC / §I / §F 도 침범하지 않는다. 다음 항목을
**자연스러운 진화** 로 다룬다.

| 1~3단계 항목 | 본 PRD 가 받아 다루는 방식 |
|--------------|-----------------------------|
| 1~2단계 IT-S1~S7 (해피패스 / 멱등성 / 재시도 / DLQ / stalled / 셧다운) | 각 시나리오를 정량 부하 프로필(LP-N)로 확장. 단일 실행 → 지속 부하 변환 (`01` §3) |
| 1~2단계 `Q-ARCH-2 (c)` (도메인 경계 IT-R1) | 본 PRD 가 새 식별자를 도입하지 않으므로 영향 없음 |
| 3단계 §3 메트릭 카탈로그 (C1~C11 / D1~D3 / W1~W4) | 본 PRD 의 측정 대상 SLI 단일 출처. 새 메트릭 정의 0건 (G4.3) |
| 3단계 §4 SLO 정의 (가용성 99.5% / p99 0.5s / p99 5s / DLQ 1%) | **잠정값** 만 실측 기반 재조정. SLI PromQL 형태(I6.1) 와 측정 윈도우는 그대로 |
| 3단계 IT-OBS-11 (카디널리티 ≤ 1000) | 부하 하에서도 가드 유지 검증 |
| 1~2단계 API/Worker 분리 (`SERVICE_MODE` + `--scale worker=N`) | 수평 확장 SLO 측정의 기반 (G4.6) |
| 3단계 §5.4 알람 외부 라우팅 비목표 | 본 PRD 도 동일 비목표 유지 (N4.1) |

### 1~3단계 결정 잠금 보존

- 1~2단계 Resolved 21건(`docs/plan/00-decisions-needed.md`) 보존.
- 3단계 Resolved 15건(`docs/plan-phase3/00-decisions-needed.md`) 보존.
- 본 PRD 가 도입하는 결정은 모두 새 ID(Q-LOAD-N) 로 추적. 기존 ID 의 결정을
  뒤집지 않는다.

---

## 7. 용어집

본 PRD 가 사용하는 용어의 단일 출처.

| 용어 | 정의 |
|------|------|
| **LP-N (Load Profile #N)** | 본 PRD 가 정의하는 부하 프로필. (RPS, 페이로드 크기, 등록 패턴, 측정 윈도우) 의 잠긴 튜플. `01` §3 카탈로그 |
| **Knee point** | 처리량(또는 지연) 곡선이 N(워커 수) 또는 RPS 의 함수에서 선형성을 잃기 시작하는 지점. `04` §5 |
| **선형성 허용 오차 (α)** | `처리량(N) ≥ 처리량(1) × N × α` 의 α. 본 PRD 가 잠그는 수평 확장 SLO 의 핵심 파라미터. Q-LOAD-11 결정 위임 |
| **SLO 재조정 규칙** | 실측 p99 에서 SLO 임계를 계산하는 공식. 예: "실측 p99 × 1.5 = SLO 임계". Q-LOAD-9 결정 위임 |
| **cgroup 격리** | Docker `cpus` / `mem_limit` / `cpuset` 으로 측정 컨테이너의 자원을 한정해 호스트 노이즈 영향을 분리. Q-LOAD-2 (b) 정합 |
| **측정 메타데이터** | 결과 보고서 행마다 필수로 기록되는 항목: 측정 호스트 CPU/메모리 사양, cgroup 한정값, LP ID, 워커 수, Redis 토폴로지, k6 버전, 측정 일시, git commit SHA |
| **재조정 가능 임계** | 본 PRD 가 실측 분포로 갱신할 수 있는 값. 3단계 SLO 의 숫자(99.5% 등) 만 해당. SLI PromQL 형태 / 측정 윈도우 / 메트릭 이름 / 라벨 enum 은 모두 **불변** |

---

## 8. 본 PRD 의 단일 출처 / 책임 분리

- **메트릭 / 라벨:** 3단계 (`prd-phase3/01` §3). 본 PRD 가 새 항목 추가 0건.
- **SLI PromQL 형태 / 측정 윈도우:** 3단계 (`prd-phase3/04` §3.1 + §3.3). 본
  PRD 가 변경하지 않음.
- **부하 프로필(LP-N):** 본 PRD `01`.
- **측정 도구 + 환경:** 본 PRD `02`.
- **측정 결과 + SLO 재조정:** 본 PRD `03`.
- **수평 확장 SLO + Redis knee point:** 본 PRD `04`.
- **비목표 + Q-LOAD-N:** 본 PRD `05` + `00-decisions-needed.md`.

본 책임 분리가 본 PRD 의 모든 후속 결정의 잠금 기준이다. 충돌 시 본 PRD 가
갱신 대상(README 우선순위 5 정합).
