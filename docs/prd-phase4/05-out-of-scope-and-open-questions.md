# 05. Out of Scope & Open Questions — 4단계 PRD 의 명시적 비범위 + Q-LOAD-N + PRD 변경 제안

> 담당 페르소나: **PM**
> 본 문서는 4단계 PRD 에서 다루지 않는 것과, 본 PRD 작성 중 임의 결정 대신 사람에게
> 미룬 결정을 한 곳에 모은다. 1~2단계 PRD `07-out-of-scope-and-future.md` §2 / 3단계
> PRD `prd-phase3/05` 형식을 따른다.

---

## 1. 명시적 Out of Scope (확장)

본 PRD(4단계) `00-overview` §3 의 N4.1~N4.7 비목표 7건의 cross-link + 각 항목의
"다음 단계 PRD" 후보를 명시한다.

### 1.1 N4.1 — Alertmanager 라우팅 / 온콜 / 인시던트 런북

- **본 PRD 범위 밖 이유:** 3단계 `prd-phase3/05` §1.3 / `prd-phase3/04` §5.4 와 동일.
  본 PRD 는 측정 결과로 SLO 임계 숫자만 갱신하며 알람 규칙 자체를 변경하지 않는다.
- **다음 단계 PRD 후보:** **운영 PRD** (자리 없음 — 본 §4 C-LOAD-12 가 자리 예약
  제안). 3단계 PRD 가 이미 같은 책임 분리를 명시 (`prd-phase3/04` §5.4 + `prd-phase3/05`
  §1.3).

### 1.2 N4.2 — Redis HA / Cluster / Sentinel 도입

- **본 PRD 범위 밖 이유:** Q-LOAD-4 (a) 결정 정합. 본 PRD `04` §5 는 단일 인스턴스의
  knee point 식별 만, §6 은 HA / Cluster 도입의 트리거 조건만 명문화.
- **다음 단계 PRD 후보:** **Redis HA / Cluster PRD** (자리 없음 — 본 §4 C-LOAD-10
  가 자리 예약 제안). 본 PRD `04` §6.2 의 트리거 조건 5종 (T1~T5) 이 진입 신호.

### 1.3 N4.3 — 카오스 / 실패 시뮬레이션

- **본 PRD 범위 밖 이유:** Q-LOAD-5 (a) 결정 정합. 본 PRD `01` §2.5 / §6.1 이 부하 +
  카오스 결합을 명시적 차원 외로 잠금.
- **다음 단계 PRD 후보:** **카오스 엔지니어링 PRD** (자리 없음 — 본 §4 C-LOAD-13
  가 자리 예약 제안). 1~2단계 IT-S6 / IT-S6b (워커 강제 종료) 의 부하 변형 + 본 PRD
  `01` §6 매핑표의 "(LP 매핑 없음)" 행이 진입 신호.

### 1.4 N4.4 — 부록 트랙 (Streams Internals) 의 추상화 비용 벤치마크

- **본 PRD 범위 밖 이유:** CLAUDE.md §1 트랙 구분 정합. 본 PRD 는 BullMQ 위의 메인
  트랙만 측정. Raw Redis Streams 직접 구현과의 비교는 부록 트랙 진입 후 별도 PRD.
- **다음 단계 PRD 후보:** **부록 트랙 PRD** (자리 예약 — `packages/streams-internals/`
  + CLAUDE.md §1). 메인 트랙 안정화 + 본 PRD 측정 완료 + SLO 재조정 완료 후 진입.

### 1.5 N4.5 — 운영 배포 자동화 (Terraform / Helm / ArgoCD)

- **본 PRD 범위 밖 이유:** 본 PRD 는 로컬 + cgroup 측정에 한정 (Q-LOAD-2 (b)).
- **다음 단계 PRD 후보:** **배포 자동화 PRD** (자리 없음). 본 저장소의 단독 개발
  + 데모 패턴에서는 진입 시점 불명확. 운영 진입 결정과 동반.

### 1.6 N4.6 — 새 메트릭 / 라벨 정의

- **본 PRD 범위 밖 이유:** 3단계 카탈로그(C1~C11 / D1~D3 / W1~W4) 가 단일 출처. 본
  PRD `00-overview` §2 G4.3 정합 — 측정 대상은 3단계 카탈로그의 부분 집합만.
- **다음 단계 PRD 후보:** **`prd-phase3/` 의 별도 PR** (3단계 카탈로그 갱신). 본 PRD
  측정 결과로 새 메트릭이 필요해지면 `prd-phase3/01` §3 갱신 PR 로 처리.

### 1.7 N4.7 — 외부 수신자 측의 성능 측정

- **본 PRD 범위 밖 이유:** 본 PRD 는 송신 측(api + worker) 의 성능만 측정. 데모
  수신자(`/_demo/receiver`) 의 응답 성능은 측정 환경 변수로 취급.
- **다음 단계 PRD 후보:** 없음. 운영 수신자의 성능은 본 시스템의 책임 외. 수신자
  성능 변동은 측정 메타데이터(`02` §5) 에 외부 변수로 기록.

### 1.8 추가 명시적 비목표 (`00-overview` §3 외)

다음은 본 PRD 본문 5 파일 작성 중 발견한 추가 비목표:

- **N4.8 — k6 외 측정 도구 비교 측정** — Q-LOAD-1 (a) 결정 정합. 본 PRD 는 k6 단일
  도구만 사용 (`02` §2 / I4.7).
- **N4.9 — CI 통합 측정** — Q-LOAD-13 잠정 권고 (a) 정합. 본 PRD 의 측정은 로컬
  사람 실행 + 결과 commit 패턴. CI 통합은 별도 결정.
- **N4.10 — 외부 metrics push (Datadog / NewRelic / Honeycomb)** — 본 PRD 는 본
  저장소의 Prometheus / Grafana 스택 내부 측정만. 외부 모니터링 서비스 연동은 별도
  PRD.

---

## 2. Q-LOAD-1~5 Resolved 요약 (사전 잠금)

본 PRD 작성 진입 전 사용자가 잠근 5건의 단일 출처는 `00-decisions-needed.md` §🔴
다. 본 §2 는 잠금 사유 + 본 PRD 본문의 정합 위치를 글자 단위로 재인용한다.

| Q-ID | 결정 | 잠금일 | 본 PRD 정합 위치 |
|------|------|--------|--------------------|
| Q-LOAD-1 | (a) k6 (Grafana Labs, JS) | 2026-05-27 | `02` §2 (단일 출처) |
| Q-LOAD-2 | (b) 로컬 + cgroup 격리 | 2026-05-27 | `02` §4 (단일 출처) |
| Q-LOAD-3 | (a) PRD 묶음만 (PRD → PLAN → 구현 분리) | 2026-05-27 | `00-overview` §0 / 본 PRD 5 파일 + PLAN 묶음 미작성 |
| Q-LOAD-4 | (a) Redis 단일 인스턴스 한계만 식별 | 2026-05-27 | `04` §5 / §6 (단일 출처) |
| Q-LOAD-5 | (a) 정적 부하만 (카오스 + 부하 결합 비목표) | 2026-05-27 | `01` §2.5 / §6.1 + `00-overview` §3 N4.3 |

### 2.1 잠금 영향

- Q-LOAD-1 / Q-LOAD-2 → `02` 가 측정 도구 + 환경의 단일 출처. PLAN 단계는 본 PRD
  의 잠금 위에서 docker-compose 갱신 + k6 시나리오 작성.
- Q-LOAD-3 → 본 PRD 5 파일만 작성. PLAN 묶음(`docs/plan-phase4/`) + 구현(`docker/k6/`)
  은 본 PRD 승인 후 별도 commit 시리즈.
- Q-LOAD-4 → `04` 가 단일 인스턴스 한계 식별 + 트리거 조건 명문화. HA / Cluster
  도입 자체는 별도 PRD.
- Q-LOAD-5 → 본 PRD 의 LP-N 카탈로그는 정적 부하만. 카오스 + 부하 결합은 별도 카오스
  엔지니어링 PRD (§1.3 / C-LOAD-13).

---

## 3. Q-LOAD-6~13 (PRD 본문 결정 위임) 통합 표

본 §3 은 본 PRD 본문 안에서 옵션 정리 + 결정 위임된 8건의 단일 출처다.
`00-decisions-needed.md` §🟡 의 표와 글자 단위 정합 유지. PRD closeout 전에 사용자가
8건을 잠금해야 한다.

### 3.1 통합 표

| Q-ID | 결정 대상 | 본 PRD 위치 | 옵션 | 잠정 권고 | 트레이드오프 요약 |
|------|-----------|-------------|------|-----------|---------------------|
| Q-LOAD-6 | 부하 프로필 RPS 등급의 정확한 숫자 (LP-1~LP-4) | `01` §3.2 | (a) 보수 셋 (10/50/200/500-500) / (b) 중도 셋 (10/100/500/100-1000) / (c) 공격 셋 (50/500/2000/500-5000) | (b) 중도 셋 | 보수 = 안정 측정 / 공격 = knee point 식별 정밀도 |
| Q-LOAD-7 | 페이로드 크기 분포 (LP-2 nominal) | `01` §4.1 | (a) 운영 평균 (80/15/5) / (b) 균등 (60/30/10) / (c) 페이로드 비용 강조 (40/40/20) | (a) 운영 평균 | 운영 평균 = 현실적 분포 / 균등 = p99 큰 페이로드 반영 |
| Q-LOAD-8 | 측정 윈도우 길이 (W_warmup / W_load / W_cooldown) | `01` §5.1 | (a) 짧은 (60s/5m/30s) / (b) sustained (60s/30m/60s) / (c) long-run (120s/60m/60s) | LP-1/LP-4 (a), LP-2/LP-3 (b) | 짧은 = CI 가능 / sustained = 측정 분산 안정화 |
| Q-LOAD-9 | SLO 임계 갱신 규칙 | `03` §4.1 | (a) p99 × 1.5 / (b) p99 + 3σ / (c) p99 × 1.2 (엄격) / (d) p99 × 2.0 (느슨) | (a) p99 × 1.5 | (a) = Google SRE 권고 / (b) = 측정 분산 기반 비안정 |
| Q-LOAD-10 | 처리량 선형성 허용 오차 α | `04` §4.1 | (a) 0.7 보수 / (b) 0.8 중도 / (c) 0.9 공격 | (b) 0.8 | 0.7 = 노이즈 흡수 / 0.9 = 어필 강화 |
| Q-LOAD-11 | 수평 확장 SLO 의 정확한 형태 — p99 안정성 β | `04` §4.2 | (a) 1.1 엄격 / (b) 1.2 중도 / (c) 1.5 느슨 | (b) 1.2 | 1.1 = 어필 강화 / 1.5 = 흡수 우선 |
| Q-LOAD-12 | 결과 보존 형식 | `02` §6.1 | (a) Markdown 표 / (b) CSV / (c) Grafana 대시보드 / (d) Markdown + JSON 이중 | (a) Markdown 표 | (a) = PR 가독성 / (c) = 시각화 우수 |
| Q-LOAD-13 | 회귀 가드 IT-LOAD-N | `02` §8.1 | (a) 없음 / (b) LP-1 만 CI / (c) LP-1 + LP-2 / (d) 전건 | (a) 없음 | (a) = 단순 / (d) = 강력 가드 + CI 시간 부담 |

### 3.2 결정 진행 절차

1. 사용자가 본 §3.1 표의 8건을 일괄 잠금 (1~2단계 21건 + 3단계 15건 잠금 패턴 동일).
2. 잠금 결과를 `00-decisions-needed.md` §🟡 의 각 Q-ID 에 Resolved 표기 + 본 PRD
   본문의 잠정 권고를 결정 값으로 갱신 (필요 시).
3. 본 PRD `00-overview` §5 AC4.1 (Q-LOAD-1~13 전건 Resolved) 가 닫힌다.
4. PLAN 묶음 (`docs/plan-phase4/`) 작성 진입 가능 (Q-LOAD-3 (a) 정합).

### 3.3 일괄 잠금 권장 (3단계 패턴)

3단계 Q-OBS-1~15 가 2026-05-27 일괄 잠금된 패턴 (`prd-phase3/05` §2) 처럼, 본
PRD 의 8건도 일괄 잠금 권장. 본 §3.1 의 잠정 권고가 전건 사용자 의도와 일치하면
"기본값으로 진행" 한 줄로 8건 동시 Resolved 가능.

---

## 4. PRD 변경 제안 (통합 표)

본 PRD 작성 중 1~3단계 PRD / architecture / README / CLAUDE.md 에 **보강 권장**
하는 항목. **본 PRD 는 임의로 다른 문서를 수정하지 않는다.** 결정은 사람이 별도 PR 로.

본 PRD 5 파일(`01`~`04` + 본 `05`) 의 §10 / §12 / §10 / §10 절은 본 §4 표를 가리킨다.

| ID | 대상 문서 | 갱신 제안 | 이유 / 결정자 |
|----|-----------|-----------|----------------|
| **C-LOAD-1** | `docs/architecture.md` §5 "보장하지 않는다" | "부하 측정, p50/p99, 수평 확장 SLO — 4단계 PRD" 줄을 본 PRD 승인 + PLAN 완료 후 "보장한다" 절로 이동 | 본 PRD 가 4단계를 완성하면 자연스러운 갱신. 결정자: 사람. |
| **C-LOAD-2** | 본 PRD `00-overview` §5 AC4.2 | 본 PRD `01` §3.1 카탈로그의 4 LP-ID 와 글자 단위 정합 유지. 본 PRD 본문 갱신 시 동시 갱신 | 본 PRD 내부 정합. 결정자: 사람. |
| **C-LOAD-3** | `docker-compose.yml` | `k6` 서비스 추가 (Q-LOAD-12 / Q-LOAD-13 결정 후 PLAN 단계가 정확한 YAML 작성) | CLAUDE.md §2 "컨테이너 = Docker Compose" 안에서 정합. 결정자: 사람. |
| **C-LOAD-4** | `docs/architecture.md` §2 컴포넌트 표 | "k6 (측정 도구)" 행 추가 | 본 PRD 가 새 서비스 추가. 본 PRD 승인 + PLAN 완료 후. 결정자: 사람. |
| **C-LOAD-5** | `.env.example` | `K6_TARGET_URL` / `K6_API_BEARER_TOKEN` / `K6_PROMETHEUS_RW_SERVER_URL` 항목 추가 | Q-LOAD-12 결정 후 PLAN 단계. 결정자: 사람. |
| **C-LOAD-6** | `prd-phase3/04` §3.1 표 | 본 PRD 측정 완료 후 임계 숫자만 갱신 PR | SLI PromQL / 측정 윈도우 / 알람 YAML 구조는 변경 없음 (`03` §5.3). 결정자: 사람. |
| **C-LOAD-7** | `prd-phase3/04` §3.4 "잠정값" 표기 | 측정 완료 후 "실측 기반 갱신 (yyyy-mm-dd, `docs/prd-phase4/results/...`)" 로 변경 | Q-OBS-11 + Q-LOAD-9 결정 정합. 결정자: 사람. |
| **C-LOAD-8** | `docker/prometheus/rules/*.yaml` | 본 PRD 측정 완료 후 임계 숫자만 갱신 (PromQL 의 `0.005` 등) | burn rate 표준값(14.4× / 6×) 은 변경 없음 (3단계 I6.2 정합). 결정자: 사람. |
| **C-LOAD-9** | `docs/architecture.md` §5 "보장한다" | 본 PRD 측정 + Q-LOAD-10 / Q-LOAD-11 결정 후 SLO-H-1 / SLO-H-2 항목 추가 제안 | 수평 확장 SLO 의 신규 약속. 결정자: 사람. |
| **C-LOAD-10** | (신규 자리) | Redis HA / Cluster PRD 자리 예약 — 예: `docs/prd-redis-ha/` 디렉터리 신규 생성 | 본 PRD `04` §6.2 의 트리거 조건이 trigger 되었을 때 진입. 결정자: 사람. |
| **C-LOAD-11** | `docs/prd/04-architecture-boundaries.md` 또는 `docs/architecture.md` §2 | `--scale worker=N` 의 N 매트릭스 측정 결과 cross-link 추가 제안 | 본 PRD `04` 측정 결과의 추적성. 결정자: 사람. |
| **C-LOAD-12** | (신규 자리) | 운영 PRD 자리 예약 — Alertmanager 라우팅 / 온콜 / 인시던트 런북 책임 (`prd-phase3/04` §5.4 + 본 PRD §1.1 정합) | 본 PRD / 3단계 PRD 가 명시적 비목표로 미룬 영역. 결정자: 사람. |
| **C-LOAD-13** | (신규 자리) | 카오스 엔지니어링 PRD 자리 예약 — 부하 + 워커 강제 종료 결합 측정 (Q-LOAD-5 (a) 정합) | 본 PRD §1.3 정합. IT-S6 / IT-S6b 의 부하 변형이 진입 신호. 결정자: 사람. |
| **C-LOAD-14** | `README.md` 운영 노트 | 본 PRD 측정 완료 후 "수평 확장 SLO (SLO-H-1 / SLO-H-2) 실측 기반 잠금" 추가 제안 | 본 PRD 결과의 README 노출. 결정자: 사람. |
| **C-LOAD-15** | `CLAUDE.md` §3 폴더 구조 | `docker/k6/scenarios/` + `docker/k6/results/` (선택) 추가 명시 | 본 PRD `02` §3 / §6 가 새 자리 사용. 결정자: 사람. |

> 위 15건은 본 PRD 작성 중 PM 이 식별한 보강 후보의 **전부** 다. PLAN 단계에서 추가
> 발견 시 같은 표에 행을 추가한다.

---

## 5. 1~3단계 PRD 와의 정합 검증 체크리스트

본 §5 는 본 PRD 가 1~3단계 PRD 의 어떤 §AC / §I / §F 도 침범하지 않음을 행별로
검증하는 체크리스트다. 본 PRD `00-overview` §5 AC4.7 (1~3단계 PRD 의 §AC / §I /
§F 0건 침범) 의 글자 단위 정합.

### 5.1 1~2단계 PRD 정합 (Resolved 21건 보존)

| 1~2단계 항목 | 본 PRD 영향 | 침범 여부 |
|--------------|-------------|------------|
| `prd/01-functional.md` §F1.* (작업 등록 / 처리 / DLQ / 셧다운) | 본 PRD 가 동일 동작을 부하 변형으로 측정 | 침범 없음 |
| `prd/02-reliability.md` §F2.* (멱등성 / 재시도 / DLQ / stalled / 셧다운) | 본 PRD `01` §6 매핑이 IT-S1/S3/S4/S5 만 부하 변형 — IT-S2/S6/S6b/S7 은 매핑 없음 | 침범 없음 (Q-LOAD-5 (a) 정합) |
| `prd/03-test-strategy.md` §3 IT-S 시나리오 | 본 PRD 가 IT-S 를 부하 변형으로 확장 | 침범 없음 |
| `prd/04-architecture-boundaries.md` §F4.* (`core` ↔ `demo` 경계) | 본 PRD 가 코드 변경 없음 | 침범 없음 |
| `prd/05-api-and-contracts.md` §F5.* (API 계약) | 본 PRD 가 `POST /webhooks` 만 부하 — API 계약 변경 없음 | 침범 없음 |
| `prd/06-security-and-ops.md` §F6.* (시크릿 / 셧다운 / SSRF) | 본 PRD 가 시크릿 / SSRF / 셧다운 시퀀스 변경 없음 | 침범 없음 |
| `prd/07-out-of-scope-and-future.md` | 본 PRD 가 1~2단계 비목표를 새로 다루지 않음 | 침범 없음 |
| Resolved 21건 (`docs/plan/00-decisions-needed.md`) | 본 PRD 가 새 Q-LOAD-N 으로 추적, 기존 Q-ID 의 결정 뒤집지 않음 | 침범 없음 |

### 5.2 3단계 PRD 정합 (Resolved 15건 + I3.* / I6.* 보존)

| 3단계 항목 | 본 PRD 영향 | 침범 여부 |
|------------|-------------|------------|
| `prd-phase3/01` §3 메트릭 카탈로그 (C1~C11 / D1~D3 / W1~W4) | 본 PRD `03` §2 가 부분 집합 13개만 측정 — 새 메트릭 도입 0건 | 침범 없음 (`00-overview` §2 G4.3 / §3 N4.6) |
| `prd-phase3/01` §4 카디널리티 예산 | 본 PRD `03` §2.3 가 IT-OBS-11 정합 — 카디널리티 가드 유지 | 침범 없음 |
| `prd-phase3/01` I3.1 (메트릭 이름 안정성) | 본 PRD 가 메트릭 이름 변경 / 삭제 / 추가 0건 | 침범 없음 |
| `prd-phase3/01` I3.2 (라벨 enum 폐쇄성) | 본 PRD 가 라벨 enum 변경 0건 | 침범 없음 |
| `prd-phase3/01` I3.3 (도메인 격리) | 본 PRD 가 `core` ↔ `demo` 경계 변경 없음 | 침범 없음 |
| `prd-phase3/04` §3.1 SLO 4종 SLI PromQL | 본 PRD `03` §2.2 가 그대로 사용 | 침범 없음 |
| `prd-phase3/04` §3.3 측정 윈도우 (28d / 7d / 1d / 1h / 5m) | 본 PRD 가 윈도우 변경 0건 | 침범 없음 (`03` §5.3) |
| `prd-phase3/04` §4.3 burn rate 14.4× / 6× | 본 PRD 가 burn rate 변경 0건 | 침범 없음 (`03` §5.3) |
| `prd-phase3/04` I6.1 (SLO 형태 안정성) | 본 PRD 가 SLI PromQL 형태 변경 0건 — 임계 숫자만 갱신 (`03` §5.2) | 침범 없음 |
| `prd-phase3/04` I6.2 (burn rate 패턴 보존) | 본 PRD 가 burn rate 변경 0건 | 침범 없음 |
| `prd-phase3/04` I6.3 (알람 = 메트릭의 그림자) | 본 PRD 가 새 알람 도입 0건 | 침범 없음 (`00-overview` §3 N4.1) |
| `prd-phase3/04` I6.4 (라우팅 분리) | 본 PRD 가 라우팅 다루지 않음 | 침범 없음 |
| IT-OBS-1~12 시나리오 | 본 PRD 가 IT-OBS 시나리오 변경 0건 | 침범 없음 |
| Resolved 15건 (`docs/plan-phase3/00-decisions-needed.md`) | 본 PRD 가 새 Q-LOAD-N 으로 추적 | 침범 없음 |

### 5.3 architecture.md 정합

| architecture.md 항목 | 본 PRD 영향 | 침범 여부 |
|----------------------|-------------|------------|
| §2 컴포넌트 표 | 본 PRD 가 `k6` 행 추가 제안 (§4 C-LOAD-4) — 직접 갱신 아님 | 침범 없음 |
| §5 "보장한다" — SLO-1~4 잠정값 | 본 PRD 가 측정 완료 후 임계 숫자만 갱신 (§4 C-LOAD-1 / C-LOAD-6) | 침범 없음 (직접 갱신 아님) |
| §5 "보장한다" — Prometheus / Grafana 관측성 | 본 PRD 가 새 메트릭 도입 0건 | 침범 없음 |
| §5 "보장하지 않는다" — 부하 측정, p50/p99 | 본 PRD 측정 완료 후 "보장한다" 절로 이동 제안 (§4 C-LOAD-1) | 침범 없음 (직접 갱신 아님) |
| §6 Resolved 21건 | 본 PRD 가 새 Q-LOAD-N 으로 추적 | 침범 없음 |

### 5.4 CLAUDE.md 정합

| CLAUDE.md 항목 | 본 PRD 영향 | 침범 여부 |
|-----------------|-------------|------------|
| §1 메인 트랙 / 부록 트랙 | 본 PRD 가 메인 트랙만 다룸. 부록 트랙은 §1.4 비목표 | 침범 없음 |
| §2 기술 스택 고정 표 | 본 PRD 가 npm 의존성 추가 0건. Docker 이미지 `grafana/k6` 만 추가 (`02` §2.4 정당성) | 침범 없음 |
| §3 폴더 구조 | 본 PRD 가 `docker/k6/scenarios/` + `docker/k6/results/` 자리 추가 제안 (§4 C-LOAD-15) | 침범 없음 (직접 갱신 아님) |
| §4 코딩 컨벤션 | 본 PRD 는 코드 작성 아님 — 컨벤션 변경 없음 | 침범 없음 |
| §5 테스트 정책 | 본 PRD 가 IT-S 7건 + IT-OBS 12건 변경 0건. IT-LOAD-N (Q-LOAD-13) 은 도입 결정 위임 | 침범 없음 |
| §7 AI 협업 워크플로우 | 본 PRD 가 자율 일탈 사전 승인 규칙(`00-overview` §1.3 정합) 준수 | 침범 없음 |

### 5.5 종합 결론

본 §5.1~§5.4 의 모든 행이 "침범 없음" 으로 확인. 본 PRD `00-overview` §5 AC4.7
(1~3단계 PRD 의 §AC / §I / §F 0건 침범) 의 글자 단위 정합 충족.

---

## 6. 임의 결정을 피한 운영 규칙

본 PRD 의 작성 원칙 (1~2단계 `07` §3 + 3단계 `prd-phase3/05` §4 동일 정신):

- §3 의 잠정 권고는 **임시 가정** 이다. PRD closeout 전에 사람이 8건을 잠금.
- §3 에 없는 새 결정이 필요해지면, **임의로 정하지 않고** 본 문서에 새 Q-LOAD-#
  를 추가한다 (자율 일탈 사전 승인 규칙).
- 본 문서의 항목을 잠금한 뒤에는 관련 4단계 PRD 문서 (`00`~`04`) 에 결정 결과를
  반영하고 본 문서에서는 "Resolved (yyyy-mm-dd 잠금: ...)" 로 표기. 1~3단계 패턴
  동일.
- §4 PRD 변경 제안은 본 PRD 가 직접 적용하지 않는다. 사람이 별도 PR 로 결정 후 적용.

---

## 7. 다음 단계 (PRD closeout + PLAN 진입 전 체크리스트)

1. 본 PRD 묶음 6 문서 (`README` + `00`~`05`) 사람 검토.
2. `00-decisions-needed.md` §🔴 5건 (Q-LOAD-1~5) — **이미 Resolved 2026-05-27**.
3. `00-decisions-needed.md` §🟡 8건 (Q-LOAD-6~13) 잠금 — 본 §3 통합 표가 단일
   출처.
4. 본 §4 PRD 변경 제안 15건 중 PRD closeout 전 권장 항목 선택 적용 (예: 본 PRD
   진입에 필요한 항목 0건 — 모두 PLAN 단계 또는 측정 완료 후 적용).
5. PLAN 단계 디렉터리 위치 결정 — Q-LOAD-3 (a) 정합으로 `docs/plan-phase4/` 잠정.
6. PLAN 단계에서 다음 산출물 작성:
   - `docs/plan-phase4/00-overview.md` + `00-decisions-needed.md` (PLAN 단계 결정 추적)
   - `docs/plan-phase4/01-milestones.md` (M-LOAD-1~N 마일스톤 분해)
   - `docker/k6/scenarios/*.js` (LP-1~LP-4 시나리오 파일)
   - `docker-compose.yml` 의 `k6` 서비스 추가 (Q-LOAD-12 / Q-LOAD-13 결정 후)
   - `.env.example` 의 k6 환경변수 추가
   - 측정 자동화 스크립트 (`scripts/run-load.sh` 등)
   - 결과 보고서 (`docs/prd-phase4/results/<LP-ID>_<date>.md`) — Q-LOAD-12 (a) 채택 시
   - IT-LOAD-N 통합 테스트 (Q-LOAD-13 (b)/(c)/(d) 채택 시)
   - SLO 재조정 PR (측정 완료 후 — C-LOAD-6 / C-LOAD-7 / C-LOAD-8 적용)
7. PLAN 완료 후 §4 PRD 변경 제안 중 "본 PRD 승인 + PLAN 완료 후" 항목을 별도 PR 로
   반영 (특히 C-LOAD-1 / C-LOAD-4 / C-LOAD-9 / C-LOAD-14).
