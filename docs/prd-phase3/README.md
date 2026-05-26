# PRD Index — Phase 3 (Observability)

이 디렉터리는 본 저장소의 **3단계 범위 — 관측성(Observability)** 에 대한 제품 요구
문서(PRD) 묶음입니다. 1~2단계 PRD([`docs/prd/`](../prd/))가 "큐가 무엇을 보장하는가"를
정의한다면, 본 PRD는 **"그 보장이 실제로 충족되고 있음을 어떻게 외부에서 관측하는가"**
를 정의합니다.

> 단일 소스 오브 트루스 우선순위(엄수):
> 1. [`CLAUDE.md`](../../CLAUDE.md) — 본 PRD는 §2 기술 스택과 §3 폴더 경계를 어기지 않습니다.
> 2. [`docs/plan/00-decisions-needed.md`](../plan/00-decisions-needed.md) — 21건 Resolved 결정을 뒤집지 않습니다.
> 3. [`docs/prd/`](../prd/) (1~2단계 PRD) — 모든 §AC/§I/§F를 침범하지 않습니다.
> 4. [`docs/architecture.md`](../architecture.md) — 본 PRD가 향후 architecture에 반영될 항목을 정의합니다.
>
> 본 PRD가 위 우선순위와 충돌하면 본 PRD가 갱신 대상입니다.

구현 코드(테스트 포함)는 본 PRD가 승인된 뒤 **후속 PLAN 단계**(`docs/plan-phase3/`,
별도 PR)에서 작성합니다. 본 PRD 단계에서는 코드(소스 파일, `package.json`, `docker/`
JSON, `prometheus.yml` 등)를 작성/수정하지 않습니다.

---

## 본 PRD의 범위 한 줄 요약

> **prom-client로 큐/워커/도메인 메트릭을 정의하고, Fastify 위에 `/metrics`
> 엔드포인트로 Prometheus exposition format을 노출한다. 도메인 무관 메트릭은
> `core`가, 웹훅 도메인 메트릭은 `demo`가 정의한다. Grafana 대시보드 JSON과
> Prometheus alerting rule YAML을 `docker/grafana/`·`docker/prometheus/rules/`
> 자리에 코드로 버전 관리하고, SLO 임계값을 명시한다. 4단계(부하·측정·수평
> 확장)와 부록 트랙(Streams Internals)은 본 PRD에서 다루지 않는다.**

---

## 읽는 순서

| # | 파일 | 한 줄 설명 |
|---|------|------------|
| 00 | [`00-overview.md`](./00-overview.md) | 비전·목표/비목표·대상 사용자·성공 지표·1~2단계 PRD와의 정합·용어집 |
| 01 | [`01-metrics-and-labels.md`](./01-metrics-and-labels.md) | 메트릭 카탈로그(Counter/Gauge/Histogram), 명명 규칙, 라벨 설계, 카디널리티 예산 |
| 02 | [`02-metrics-endpoint.md`](./02-metrics-endpoint.md) | `/metrics` 엔드포인트 명세, prom-client Registry 구성, `core` vs `demo` 경계 |
| 03 | [`03-grafana-dashboards.md`](./03-grafana-dashboards.md) | Grafana 대시보드 구조, JSON 파일 위치, provisioning, 패널별 PromQL |
| 04 | [`04-slo-and-alerts.md`](./04-slo-and-alerts.md) | SLO 정의, 측정 윈도우, error budget, Prometheus alerting rule 형식 |
| 05 | [`05-out-of-scope-and-open-questions.md`](./05-out-of-scope-and-open-questions.md) | 본 PRD 밖 항목 + 오픈 퀘스천(Q-OBS-N) + PRD 변경 제안 통합 |

---

## 1~2단계 PRD와의 관계

본 PRD는 다음 항목들을 **자연스러운 진화**로 다룬다. **1~2단계의 어떤 §AC/§I/§F도
뒤집지 않는다.**

| 1~2단계 진술 | 본 PRD에서의 진화 |
|--------------|---------------------|
| PRD `00` §3 N1 "Prometheus/Grafana는 3단계" | 본 PRD가 그 3단계다. |
| PRD `02` §10 "본 단계의 구조화 로그 필드(`attempt`, `errorClass`, `httpStatus`)는 3단계 메트릭의 라벨 후보가 된다" | 본 PRD `01` §3 라벨 카탈로그가 이를 정식 라벨로 격상한다. 단, 카디널리티 위험이 있는 일부 필드(`idempotencyKey`)는 라벨로 두지 않는다. |
| PRD `04` §7 표 "메트릭 정의(정의만) — `core/metrics.ts` — 실제 노출은 3단계" | 본 PRD `02` §3 `core/metrics.ts`의 인터페이스 진화 명세. PLAN `Q-ARCH-3` (a) "빈 파일/타입 인터페이스만"을 본 PRD에서 "prom-client 도입 + 도메인 무관 메트릭 정의"로 진화시킨다. |
| PRD `06` §12 "Prometheus 메트릭 노출 엔드포인트(`/metrics`)와 라벨 설계는 후속 PRD" | 본 PRD `02`가 명세한다. |
| PRD `06` §6.2 "셧다운 진행 중 `/healthz` → 503, `/dashboard` → 200 유지" | 본 PRD `02` §6에서 `/metrics`의 셧다운 응답 정책을 추가로 명세한다(잠정 200 유지 권장, Q-OBS-2). |
| 결정 잠금 `Q-API-1` (b) "Bearer는 `/webhooks`에만" | 본 PRD `02` §5에서 `/metrics`의 인증 정책은 별도 결정(잠정 인증 없음 권장, Q-OBS-1). |

> 본 PRD가 1~2단계 PRD/architecture/README에 보강을 제안하는 항목은 각 phase3
> 문서의 **§10 "PRD 변경 제안"** 또는 [`05-out-of-scope-and-open-questions.md`](./05-out-of-scope-and-open-questions.md)
> §3 통합 표에 기록한다. **본 PRD는 1~2단계 문서를 직접 수정하지 않는다.**

---

## ADR 및 architecture와의 관계

- [ADR-001](../adr/ADR-001-bullmq-vs-streams-vs-kafka.md) — BullMQ 채택. 본 PRD의
  메트릭 라벨 일부(예: `queue`, `job_state`, `attempt`)는 BullMQ가 노출하는
  내부 상태 모델을 참조한다.
- [ADR-002](../adr/ADR-002-at-least-once-with-idempotency.md) — at-least-once +
  멱등성. 본 PRD `01` §3에서 `idempotencyKey`를 **라벨로 두지 않는** 결정의 근거.
- [`docs/architecture.md`](../architecture.md) §5 "보장하지 않는다 — Prometheus/
  Grafana 관측성(3단계 PRD)" 줄은 본 PRD 승인 이후 **"보장한다"로 갱신 권장**(본
  PRD `05` §3 "PRD 변경 제안" 항목).

---

## 4단계 / 부록 트랙과의 경계 (명시적 거부)

본 PRD는 다음을 **다루지 않는다**.

- **4단계 — 부하 / 측정 / 수평 확장:** 처리량·지연 분포 측정, 워커 수 변화에
  따른 스루풋 그래프, 셧다운 SLO 정량 검증, 카오스 시나리오 정량 분석. 본 PRD
  메트릭은 4단계 측정의 **기반**이 되지만, 측정 자체는 별도 PRD(`docs/prd-phase4/`
  자리)에서 다룬다.
- **부록 트랙 — `packages/streams-internals/`:** Raw Redis Streams로 큐 내부를
  직접 구현하는 학습용 모듈. 본 PRD는 임포트/참조/문서 인용 모두 금지(CLAUDE.md §1).
- **알람 라우팅 / 온콜 / 인시던트 프로세스:** Alertmanager 라우팅, PagerDuty/
  Slack 연동, 인시던트 런북. 본 PRD는 **알람 규칙(YAML)** 까지만 다룬다.
- **멀티-Prometheus federation / long-term storage(Thanos/Cortex/Mimir).**
- **분산 추적(distributed tracing, OpenTelemetry tracing).** 본 PRD는 메트릭만.

상세는 [`05-out-of-scope-and-open-questions.md`](./05-out-of-scope-and-open-questions.md) §1.

---

## AI 협업 5원칙 (CLAUDE.md §7) — 본 PRD에 적용

1. **설계는 사람이 먼저.** SLO 임계값·카디널리티 예산·메트릭 분류는 사람이 본 PRD
   §AC/§I로 잠근 뒤 PLAN 단계에서 구현으로 옮긴다.
2. **테스트 우선.** `/metrics` 응답 형식·라벨 값의 회귀는 통합 테스트로 검증한다
   (PLAN 단계 산출물, IT-OBS-N).
3. **범위 통제.** 본 PRD는 3단계만 다룬다. "있으면 좋을 것 같은" 메트릭/라벨/
   대시보드는 추가하지 않는다.
4. **불확실하면 묻기.** 트레이드오프는 [`05`](./05-out-of-scope-and-open-questions.md)
   §2의 **Q-OBS-N**에 선택지·잠정 기본값·차단되는 PLAN 영역과 함께 기록한다.
   임의 결정 금지.
5. **위반 보고.** 본 PRD가 1~2단계 PRD/CLAUDE.md를 위반하는 항목을 발견하면 직접
   고치지 않고 [`05`](./05-out-of-scope-and-open-questions.md) §3 "PRD 변경 제안"에
   기록한다.
