# 05. Out of Scope & Open Questions — 3단계 PRD의 명시적 비범위 + Q-OBS-N + PRD 변경 제안

> 담당 페르소나: **PM**
> 본 문서는 본 PRD에서 다루지 않는 것과, 본 PRD 작성 중 임의 결정 대신 사람에게
> 미룬 결정을 한 곳에 모은다. 1~2단계 PRD `07-out-of-scope-and-future.md` §2
> 형식을 따른다.

---

## 1. 명시적 Out of Scope

본 PRD(3단계 관측성)는 다음 항목을 **다루지 않는다**. 후속 PRD에서 별도로 다룬다.

### 1.1 4단계 — 부하 / 측정 / 수평 확장

- 처리량(throughput), p50/p99 정량 측정의 SLO 검증
- 워커 수 변경에 따른 스루풋 그래프
- 그레이스풀 셧다운의 정량 SLO 검증 ("30초 이내에 99%가 종료된다")
- 카오스 시나리오의 정량 분석 (`packages/demo/src/chaos.ts` 정식 활용)
- 본 PRD가 정의한 SLO **목표 숫자의 실측 기반 갱신**

본 PRD는 4단계 측정의 **기반 메트릭과 SLO 형태**를 잠그는 역할만 한다. 숫자
재조정은 4단계 PRD(`docs/prd-phase4/` 자리, 본 PRD가 만들지 않음)에서 수행.

### 1.2 부록 트랙 — Streams Internals

- `packages/streams-internals/`의 메트릭
- 추상화 비용 벤치마크(BullMQ vs raw streams)의 관측성 통합
- 본 PRD 범위에서는 **임포트·참조·문서 인용 모두 금지**. 폴더 자리만 보존.
  (CLAUDE.md §1 정합)

### 1.3 알람 라우팅 / 온콜 / 인시던트 프로세스

- Alertmanager 설정(`alertmanager.yml`)
- PagerDuty / Slack / Email / OpsGenie 라우팅
- 온콜 로테이션 정책
- 인시던트 런북 (`runbook_url` 본문은 본 PRD에서 비워 둠)
- Post-mortem 프로세스

본 PRD는 **알람이 발화되는 조건(Prometheus alerting rule YAML)** 까지만 다룬다.

### 1.4 멀티-Prometheus federation / long-term storage

- Thanos / Cortex / Mimir / VictoriaMetrics
- Remote write 정책
- 멀티 region scrape
- 장기 보존 정책 (default Prometheus 2주 → 1년+)

본 PRD는 단일 Prometheus 컨테이너 + 기본 보존 기간만 다룬다.

### 1.5 분산 추적 / 로그 집계

- OpenTelemetry tracing
- Distributed tracing (Jaeger / Tempo / Zipkin)
- Loki / ELK / Datadog 로그 집계
- 구조화 로그 ↔ 메트릭 ↔ 트레이스 상관관계 (correlation IDs)

본 PRD는 **메트릭만** 다룬다. 로그는 1~2단계 PRD `05-api-and-contracts.md`
§9의 구조화 로깅 정책 그대로 유지(변경하지 않음).

### 1.6 자체 메트릭 라이브러리 / 새 의존성

- prom-client 외 메트릭 라이브러리 도입 금지
- Grafana dashboard-as-code 라이브러리(grafonnet, jsonnet, terraform-grafana
  등) 도입 금지 — 본 PRD는 GUI export → JSON PR 워크플로우 (Q-OBS-7).
- CLAUDE.md §2 고정 스택 외 새 npm 의존성 금지

### 1.7 UI 폴리싱

- Grafana 테마 / 사용자 권한 모델 / SSO
- 대시보드 외부 노출 보안
- Grafana 알람 UI(본 PRD는 Prometheus alerting rule만 사용)

---

## 2. 오픈 퀘스천 (Q-OBS-N) — 결정 보류

> **사용법:** 1~2단계 PRD `07` §2 형식을 따른다.
> 형식: **Q-#** — 질문 / **Options** — 선택지 / **Provisional** — 잠정 기본값(임의
> 결정 아님, PLAN 진입 전에 사람이 잠근다) / **막히는 PLAN 영역** / **결정자: 사람**
>
> **운영 규칙:** PLAN 단계의 어떤 마일스톤도 자기에 해당하는 Q-OBS가 모두
> Resolved 가 되기 전에는 구현 코드를 작성하지 않는다(1~2단계 PLAN
> `00-decisions-needed.md` §3 정합).

### 2.1 우선순위 표 (가장 시급한 항목)

| 우선 | Q-ID | 한 줄 질문 | 잠정 기본값 | 막히는 영역 |
|-----|------|------------|--------------|-------------|
| ★★★ | Q-OBS-1 | `/metrics` 인증 정책 (없음 vs 별도 토큰 vs 동일 Bearer) | (a) 인증 없음 + README 경고 | PLAN: `/metrics` 라우트 핸들러 구현, `docker-compose.yml` 환경변수 |
| ★★★ | Q-OBS-3 | `SERVICE_MODE=worker` 컨테이너의 `/metrics` 노출 방법 | (a) 워커 최소 HTTP 서버 추가 (`WORKER_METRICS_PORT=3001`) | PLAN: worker 부트스트랩 변경, prometheus.yml scrape targets |
| ★★★ | Q-OBS-2 | 셧다운 진행 중 `/metrics` 응답 정책 | (a) 200 유지 | PLAN: 셧다운 시퀀스에서 metrics 라우트 draining 처리 |
| ★★☆ | Q-OBS-5 | HTTP raw status code를 라벨로 둘지 (현재 status_class로 묶음) | (a) status_class enum 유지 | PLAN: `01` 라벨 카탈로그 코드화 |
| ★★☆ | Q-OBS-11 | SLO 목표 숫자(99.5% / 0.5s / 5s / 1%) 확정 시점 | (a) 잠정값 확정 + 4단계 실측 후 재조정 | PLAN: alerting rule YAML 작성 |

### 2.2 결정 항목 전체

#### Q-OBS-1 — `/metrics` 엔드포인트 인증 정책

- **Options:**
  - (a) 인증 없음 (내부망 전제)
  - (b) 별도 토큰 (`METRICS_BEARER_TOKEN`, ≥ 32 bytes — Q-SEC-3 정합)
  - (c) 동일 Bearer (`API_BEARER_TOKEN` 재사용)
- **트레이드오프:**
  - (a) — Prometheus scrape 표준 관행. 외부 노출 시 위험.
  - (b) — 권한 분리 우수. 환경변수 추가, scrape 설정 복잡.
  - (c) — 환경변수 단일. 권한 분리 없음.
- **Provisional:** **(a) 인증 없음** + README "운영 노트"에 외부 노출 시 (b)로
  격상 권장 명시.
- **막히는 PLAN:** `/metrics` 라우트 핸들러, `docker-compose.yml` 환경변수,
  `.env.example`.
- **결정자:** 사람. 임의 결정 금지.

#### Q-OBS-2 — 셧다운 진행 중 `/metrics` 응답 정책

- **Options:**
  - (a) 200 유지 (관측 보존)
  - (b) 503으로 거부 (셧다운 명확 신호)
- **트레이드오프:**
  - (a) — 셧다운 진행 상태(C9 `shutdown_state=draining`, C10 `shutdown_remaining_jobs`)를
    외부에서 관측 가능. 1~2단계 PRD `06` §6.2의 `/dashboard`/`/_demo/receiver`
    /`/api/queue/stats`도 200 유지 패턴과 일관.
  - (b) — 셧다운 중인 인스턴스에 메트릭 의존하지 않음을 명확히. 단점: 셧다운
    SLO 측정 불가.
- **Provisional:** **(a) 200 유지**.
- **막히는 PLAN:** `core/shutdown.ts`의 draining 토글이 `/metrics`에 영향을
  주는지 결정. 1~2단계 PRD `06` §6.2 표 갱신 필요(Q-OBS-2 결정 후).
- **결정자:** 사람.

#### Q-OBS-3 — `SERVICE_MODE=worker` 컨테이너 `/metrics` 노출 방법

- **Options:**
  - (a) 워커 프로세스에도 최소 HTTP 서버 추가 (Fastify 재사용, 새 환경변수
    `WORKER_METRICS_PORT`, 기본 3001)
  - (b) Prometheus Pushgateway 사용 (push 모델, 새 컴포넌트)
  - (c) API 인스턴스만 메트릭 노출 (워커 메트릭 누락 — 부적합)
- **트레이드오프:**
  - (a) — Fastify 이미 의존성에 있음. 작은 변경. 워커가 HTTP 노출하므로 보안
    경계 한 줄 추가.
  - (b) — 추가 컴포넌트(Pushgateway). 운영 복잡. 멀티 워커에서 메트릭 충돌
    위험(인스턴스 식별 필요).
  - (c) — 핵심 워커 메트릭(C2 `jobs_processed_total`, C6 `worker_active_jobs`,
    C9 `shutdown_state`) 누락 → 본 PRD 무력화. **부적합.**
- **Provisional:** **(a) 워커 최소 HTTP 서버**.
- **막히는 PLAN:** `demo/server.ts`의 `SERVICE_MODE=worker` 분기,
  `docker-compose.yml`의 worker 서비스 포트, prometheus.yml scrape targets.
- **결정자:** 사람.

#### Q-OBS-4 — Grafana 인증 정책 (admin/admin 데모 vs 환경변수 주입)

- **Options:**
  - (a) Grafana admin/admin 기본값 (데모 전제)
  - (b) `GF_SECURITY_ADMIN_PASSWORD`를 환경변수로 강제
- **Provisional:** **(a)** + README 운영 노트에 변경 권장 명시.
- **막히는 PLAN:** `docker-compose.yml`의 Grafana 환경변수, `.env.example`.
- **결정자:** 사람.

#### Q-OBS-5 — HTTP raw status code를 라벨로 둘지

- **Options:**
  - (a) `status_class` enum (2xx/3xx/4xx/5xx/none) — 본 PRD 잠정 채택
  - (b) raw status code (200, 503, ...) — 카디널리티 약 60개 추가
- **트레이드오프:**
  - (a) — 카디널리티 보호. 5xx 세부 분석 손실.
  - (b) — 5xx 분포 추적 가능(예: 502 vs 503 vs 504). 카디널리티 증가.
- **Provisional:** **(a) status_class enum**.
- **막히는 PLAN:** `01` 라벨 카탈로그 코드화, D1/W1 메트릭 라벨 결정.
- **결정자:** 사람.

#### Q-OBS-6 — `attempt` 번호를 별도 라벨로 둘지

- **Options:**
  - (a) histogram bucket (W3 `delivery_attempts_per_job`)으로 분해 — 본 PRD
    잠정 채택
  - (b) Counter 라벨에 `attempt` 추가 (예: C3 `job_attempts_total{attempt="3"}`)
- **트레이드오프:**
  - (a) — 라벨 폭 작게 유지. 분포는 histogram quantile로 추정.
  - (b) — 각 시도별 추적 정밀. `attempt` 라벨이 `WEBHOOK_MAX_ATTEMPTS`(5)로
    상한이 있어 카디널리티 위험 작음.
- **Provisional:** **(a) histogram bucket**.
- **막히는 PLAN:** C3·W3 메트릭 정의.
- **결정자:** 사람.

#### Q-OBS-7 — Grafana dashboard-as-code 라이브러리 도입 여부

- **Options:**
  - (a) GUI export → JSON PR (새 의존성 없음)
  - (b) `grafonnet` / `jsonnet` 도입 (새 의존성)
- **트레이드오프:**
  - (a) — CLAUDE.md §2 정합. 본 PRD에 가장 잘 맞음.
  - (b) — 대시보드 변경의 diff 가독성 좋음. 새 의존성·학습 비용.
- **Provisional:** **(a) GUI export**.
- **막히는 PLAN:** `docker/grafana/dashboards/*.json` 파일 생성 방식.
- **결정자:** 사람.

#### Q-OBS-8 — `route` 라벨에 동적 path가 추가될 때 가이드

- **Options:**
  - (a) 본 PRD는 동적 path 없음 (모든 라우트가 정적 — `01` §3.2). 미래 라우트
    추가 시 PRD 변경 제안 필수.
  - (b) Fastify route schema에서 자동으로 path 추출 (위험 — `/items/123` 같은
    값이 라벨로 들어가면 카디널리티 폭주).
- **트레이드오프:**
  - (a) — 안전. 운영 규칙으로 강제.
  - (b) — 자동. 위험 큼.
- **Provisional:** **(a) 정적 path만 + 운영 규칙**.
- **막히는 PLAN:** Fastify metrics plugin의 라벨 추출 로직.
- **결정자:** 사람.

#### Q-OBS-9 — Histogram 버킷의 잠금 vs 운영 후 재조정

- **Options:**
  - (a) 본 PRD가 잠금 (`01` §3 표) — 운영 후 버킷 변경은 시계열 재시작과
    동등하므로 신중.
  - (b) 운영 측정 후 4단계 PRD에서 재조정 (잠정 잠금 후 갱신).
- **트레이드오프:**
  - (a) — 안정성. 운영 실측이 버킷 분포와 안 맞을 위험.
  - (b) — 운영 정확. 버킷 변경 시 PromQL `histogram_quantile` 추정 정확성 영향.
- **Provisional:** **(b) 잠정 잠금 + 4단계 실측 후 재조정**.
- **막히는 PLAN:** Histogram 정의(`01` §3 C4/D2/D3/W2/W3).
- **결정자:** 사람.

#### Q-OBS-10 — `/metrics` 응답 gzip 압축 도입 여부

- **Options:**
  - (a) 압축 없음 (Fastify 표준 `Accept-Encoding` 협상에 위임)
  - (b) gzip 강제
- **트레이드오프:**
  - (a) — 단순. 메트릭 크기가 작을 때(< 100 KB) 압축 이득 작음.
  - (b) — 네트워크 효율. 본 PRD 데모 규모에서는 과잉.
- **Provisional:** **(a) 압축 없음**.
- **막히는 PLAN:** `/metrics` 라우트 핸들러.
- **결정자:** 사람.

#### Q-OBS-11 — SLO 목표 숫자 확정 시점

- **Options:**
  - (a) 본 PRD에 잠정값(99.5% / 0.5s / 5s / 1%)을 잠그고, 4단계 PRD에서 실측
    기반 갱신
  - (b) 본 PRD에서 잠정값 없이 4단계까지 미정 표기
- **트레이드오프:**
  - (a) — alerting rule을 PLAN 단계에서 작성 가능. 추후 숫자만 갱신.
  - (b) — alerting rule을 4단계까지 작성 불가 → 관측성 미완.
- **Provisional:** **(a) 잠정값 + 4단계 재조정**.
- **막히는 PLAN:** `docker/prometheus/rules/*.yaml` 작성, README 운영 노트.
- **결정자:** 사람.

#### Q-OBS-12 — Multi-window multi-burn-rate 표준값 (14.4×/6×) 채택

- **Options:**
  - (a) 14.4× (5m+1h, page) / 6× (30m+6h, ticket) — Google SRE Workbook 표준
  - (b) 다른 burn rate 조합
- **Provisional:** **(a) 표준값 채택**.
- **막히는 PLAN:** alerting rule YAML 작성.
- **결정자:** 사람.

#### Q-OBS-13 — `reason="non_retriable"` (4xx 즉시 DLQ)를 SLO-4에 포함할지

- **Options:**
  - (a) 포함 (현재 본 PRD 채택) — DLQ 적재율은 운영 신호(poison message 비율)
  - (b) 제외 — 클라이언트 책임 분리
- **트레이드오프:**
  - (a) — DLQ 적재 자체가 운영자에게 의미 있는 신호. 단순.
  - (b) — 본 시스템의 안정성 SLO와 클라이언트 책임 SLO를 분리.
- **Provisional:** **(a) 포함**.
- **막히는 PLAN:** `04` §5.2.3 DLQ alerting rule PromQL.
- **결정자:** 사람.

#### Q-OBS-14 — `webhook_relay_` 접두를 IT-R1 grep 예외로 둘지

- **Options:**
  - (a) IT-R1의 도메인 식별자 grep 대상에서 `webhook_relay_` 접두를 예외 처리
    (애플리케이션 식별자) — 본 PRD 잠정 채택
  - (b) `core/metrics.ts`의 메트릭 접두를 `core_` / `queue_` 로 변경하여 도메인
    식별자를 회피
- **트레이드오프:**
  - (a) — Prometheus 컨벤션(애플리케이션 식별자 접두) 정합. IT-R1 가드 한 줄
    추가.
  - (b) — IT-R1 단순. 메트릭 이름 컨벤션 부자연(`core_*` 접두는 운영자가
    "core 모듈"로 오해 가능).
- **Provisional:** **(a) IT-R1 예외**. 1~2단계 architecture.md §2 "도메인
  식별자" 정의 갱신 권장(아래 §3 PRD 변경 제안 C-MET-2).
- **막히는 PLAN:** `01` §6.2 IT-R1 보강 코드.
- **결정자:** 사람.

#### Q-OBS-15 — Phase 3 PLAN 디렉터리 위치

- **Options:**
  - (a) `docs/plan-phase3/` (별도 디렉터리)
  - (b) `docs/plan/` 에 M8+ 마일스톤으로 통합
- **트레이드오프:**
  - (a) — 1~2단계 PLAN과 분리되어 추적 명확.
  - (b) — 단일 PLAN 묶음으로 일관.
- **Provisional:** **(a) `docs/plan-phase3/`**.
- **막히는 PLAN:** PLAN 묶음 부트스트랩.
- **결정자:** 사람.

### 2.3 총계

- 결정 필요 항목 총 **15건** (Q-OBS-1 ~ Q-OBS-15).
- 분류:
  - 엔드포인트 / 인증 — 3건 (Q-OBS-1, Q-OBS-2, Q-OBS-3)
  - 대시보드 / 인프라 — 2건 (Q-OBS-4, Q-OBS-7)
  - 라벨 / 카디널리티 — 3건 (Q-OBS-5, Q-OBS-6, Q-OBS-8)
  - 메트릭 형태 — 2건 (Q-OBS-9, Q-OBS-10)
  - SLO / 알람 — 3건 (Q-OBS-11, Q-OBS-12, Q-OBS-13)
  - 운영 / 추적성 — 2건 (Q-OBS-14, Q-OBS-15)
- 최우선 5건: Q-OBS-1, Q-OBS-3, Q-OBS-2, Q-OBS-5, Q-OBS-11.

---

## 3. PRD 변경 제안 (통합 표)

본 PRD 작성 중 1~2단계 PRD/architecture/README/CLAUDE.md에 **보강을 권장**하는
항목. **본 PRD는 임의로 다른 문서를 수정하지 않는다.** 결정은 사람이 별도 PR로.

각 phase3 문서(`01`~`04`)의 §10/§11/§12/§13 "PRD 변경 제안" 절은 본 표를 가리킨다.

| ID | 대상 문서 | 갱신 제안 | 이유 / 결정자 |
|----|-----------|-----------|----------------|
| **C-MET-1** | `docs/prd/04-architecture-boundaries.md` §7 표 "메트릭 정의(정의만) — `core/metrics.ts` — 실제 노출은 3단계" | "3단계 PRD에서 prom-client 도입 + 도메인 무관 메트릭 정의 + Registry 노출"로 갱신 | Q-ARCH-3 (a) 결정이 약속한 "3단계 PRD가 형태를 결정한다"의 이행 결과 반영. 결정자: 사람. |
| **C-MET-2** | `docs/architecture.md` §2 "패키지 경계" + `docs/prd/04-architecture-boundaries.md` §2 G4.1 | "도메인 식별자(`webhook`/`delivery`/`http`/`fastify`/`receiver`/`_demo`) 정의 + 접두 `webhook_relay`는 prom-client 애플리케이션 식별자로 IT-R1 grep 예외"를 명시 | Q-OBS-14 결정 (a) 채택 시 필수. 결정자: 사람. |
| **C-MET-3** | `docs/architecture.md` §5 "보장하지 않는다" | "Prometheus/Grafana 관측성(3단계 PRD)" 줄을 "보장한다"로 이동 (본 PRD 승인 + PLAN 완료 후) | 본 PRD가 3단계를 완성하면 자연스러운 갱신. 결정자: 사람. |
| **C-MET-4** | `docs/prd/05-api-and-contracts.md` §4 또는 §6 | `GET /metrics` 엔드포인트 명세를 추가 — 또는 본 PRD `02-metrics-endpoint.md`로 cross-link만 추가 | 1~2단계 API 카탈로그가 외부 엔드포인트 단일 소스가 되도록. 결정자: 사람. |
| **C-MET-5** | `docs/prd/06-security-and-ops.md` §6.2 표 | `/metrics` 행 추가 (Q-OBS-2 결정 후 — 200 유지 또는 503) | 셧다운 라우트 정책 단일 표 정합. 결정자: 사람. |
| **C-MET-6** | `docs/architecture.md` §2 컴포넌트 표 | "Metrics Endpoint" 행 추가 (`packages/demo/src/api/metrics.ts`) | 본 PRD가 새 컴포넌트 추가. 결정자: 사람. |
| **C-MET-7** | `.env.example` | `WORKER_METRICS_PORT` (Q-OBS-3 (a) 시), `METRICS_BEARER_TOKEN` (Q-OBS-1 (b) 시) 추가 | 결정 잠금 후. 결정자: 사람. |
| **C-MET-8** | `docker-compose.yml` worker 서비스 | `/metrics`용 포트 추가 (Q-OBS-3 (a) 잠금 시) | 결정 잠금 후. 결정자: 사람. |
| **C-MET-9** | `README.md` 빠른 시작 | "Prometheus: http://localhost:9090" 추가 | 본 PRD가 Prometheus 컨테이너 추가. 결정자: 사람. |
| **C-MET-10** | `README.md` 운영 노트 | "Grafana admin 기본값 변경" 항목 추가 | Q-OBS-4 (a) 채택 시. 결정자: 사람. |
| **C-MET-11** | `docs/architecture.md` §2 컴포넌트 표 | "Prometheus" / "Grafana" 행 추가 | 본 PRD가 새 컨테이너 추가. 결정자: 사람. |
| **C-MET-12** | `docker/grafana/.gitkeep` | PLAN 단계에서 실제 파일 추가 후 제거 가능 | 형식 정리. 결정자: 사람. |
| **C-MET-13** | `docs/architecture.md` §5 "보장한다" | SLO-1~4 항목 추가 (본 PRD 승인 + PLAN 완료 후) | 결정자: 사람. |
| **C-MET-14** | `docs/prd/06-security-and-ops.md` 운영 노트 절 | "알람 라우팅·온콜은 본 PRD 범위 밖" 명시 | 본 PRD §5.4 정합. 결정자: 사람. |
| **C-MET-15** | `README.md` 운영 노트 | "SLO 임계는 잠정값이며 4단계 실측 후 재조정" 명시 | Q-OBS-11 결정 정합. 결정자: 사람. |
| **C-MET-16** | `CLAUDE.md` §3 폴더 구조 | `docker/prometheus/rules/` 추가 명시 | 본 PRD가 새 자리 사용. 결정자: 사람. |
| **C-MET-17** | `docs/prd/03-test-strategy.md` 또는 새 phase3 test-strategy | IT-OBS-N(메트릭 회귀/카디널리티 가드) 시나리오 정의 | PLAN 단계 산출물이지만 PRD 정합 필요. 결정자: 사람. |

> 위 17건은 본 PRD 작성 중 PM이 식별한 보강 후보의 **전부**다. PLAN 단계에서
> 추가 발견 시 같은 표에 행을 추가한다.

---

## 4. 임의 결정을 피한 운영 규칙

본 PRD의 작성 원칙(1~2단계 PRD `07` §3과 동일 정신):

- §2의 Provisional은 **임시 가정**이다. PLAN 단계 진입 전에 사람이 각 항목을
  확정한다.
- §2에 없는 새 결정이 필요해지면, **임의로 정하지 않고** 본 문서에 새 Q-OBS-#
  를 추가한다.
- 본 문서의 항목을 PLAN 단계에서 확정한 뒤에는 관련 phase3 PRD 문서(`00`~`04`)에
  결정 결과를 반영하고 본 문서에서는 "Resolved (PLAN 단계에서 확정: ...)"로
  표기한다. 1~2단계 PRD `07`/`docs/plan/00-decisions-needed.md`와 동일 패턴.
- §3 PRD 변경 제안은 본 PRD가 직접 적용하지 않는다. 사람이 별도 PR로 결정 후
  적용.

---

## 5. 다음 단계 (PLAN 진입 전 체크리스트)

1. 본 PRD 묶음 5개 문서 모두 사람 검토.
2. `05` §2 Q-OBS-1~15 결정 잠금 (특히 최우선 5건: Q-OBS-1, Q-OBS-3, Q-OBS-2,
   Q-OBS-5, Q-OBS-11).
3. `05` §3 C-MET-1~17 중 본 PRD 진입에 필요한 항목 별도 PR로 반영 (특히
   C-MET-1, C-MET-2, C-MET-4, C-MET-5는 PLAN 진입 전 권장).
4. PLAN 단계 디렉터리 위치 결정 (Q-OBS-15 — 잠정 `docs/plan-phase3/`).
5. PLAN 단계에서 다음 산출물 작성:
   - `core/metrics.ts` 인터페이스 + 메트릭 정의 (C1~C11)
   - `demo/metrics.ts` 메트릭 정의 (D1~D3, W1~W4)
   - `demo/api/metrics.ts` Fastify 라우트
   - `worker` 모드의 `/metrics` 노출 (Q-OBS-3 결정 후)
   - `docker/prometheus.yml` scrape 설정
   - `docker/prometheus/rules/*.yaml` (4종)
   - `docker/grafana/provisioning/*.yaml` (2종)
   - `docker/grafana/dashboards/*.json` (4~5종)
   - `docker-compose.yml`에 Prometheus + Grafana 서비스 추가
   - IT-OBS-N 통합 테스트 (메트릭 회귀, 카디널리티 가드, IT-S1~S7 시 메트릭
     단언)
6. PLAN 완료 후 §3 PRD 변경 제안 중 "본 PRD 승인 + PLAN 완료 후" 항목을 별도
   PR로 반영 (특히 C-MET-3, C-MET-13).
