# 00. Overview — Phase 3 (Observability)

> 담당 페르소나: **PM(총괄)** · SRE/Observability Lead 보조
> 본 문서는 3단계 PRD 묶음의 진입점이다. 구현 코드는 후속 PLAN 단계에서 작성한다.

---

## 1. 컨텍스트 / 배경

1~2단계 PRD는 본 시스템이 충족해야 할 **보장**(at-least-once, 멱등성, 분류된
재시도, DLQ 단방향, stalled 회수, 그레이스풀 셧다운)을 정의했고, 7개 통합
시나리오(IT-S1~S7) + IT-R1 회귀 보호로 그 보장을 **테스트로** 증명했다.

그러나 "테스트가 그린"이 곧 "운영 중에도 보장이 지켜진다"를 의미하지는 않는다.
운영자는 다음을 **실시간으로** 알아야 한다.

- 큐가 얼마나 적체되고 있나? (`waiting` / `active` / `delayed`)
- 워커가 작업을 얼마나 빠르게 처리하나? (처리량, 처리 지연 분포)
- 어떤 에러 분류가 늘고 있나? (`RetriableError` vs `NonRetriableError`)
- DLQ가 얼마나 빠르게 쌓이고 있나? (poison message 패턴 신호)
- 외부 수신자 HTTP 응답 분포는? (4xx/5xx 비율, timeout 빈도)
- 셧다운 진행 중인가? draining 중에 신규 요청이 거부되고 있나?

본 PRD(3단계)는 이 질문들에 답할 수 있는 **메트릭 / 대시보드 / SLO**를 정의한다.
"숫자가 예쁘면 합격"이 아니라, **운영자가 30초 안에 비정상 상황을 발견할 수 있는
관측 표면**을 확보하는 것이 목표다.

> 3단계의 어필 포인트는 "Grafana 화면이 예쁘다"가 아니라, **"보장이 무엇인지
> 알고, 그것이 깨질 때 어떤 메트릭이 어떻게 움직이는지 사전에 매핑해 둔다"**
> 이다(CLAUDE.md §1 정합).

---

## 2. 목표 (Goals)

본 PRD(3단계)의 목표:

- **G3.1** Prometheus가 scrape 가능한 `/metrics` 엔드포인트를 Fastify 위에 노출
  한다. Content-Type은 표준 `text/plain; version=0.0.4; charset=utf-8`.
- **G3.2** prom-client를 도입해(CLAUDE.md §2 고정 스택) Counter/Gauge/Histogram
  메트릭을 정의한다. 도메인 무관 메트릭은 `core`가, 도메인(웹훅) 메트릭은 `demo`가
  정의하는 경계(CLAUDE.md §3)를 본 PRD가 강제한다.
- **G3.3** 1~2단계의 7개 IT 시나리오 각각에 대해, 시나리오가 운영 중에 발생했을 때
  **어떤 메트릭이 어떻게 움직이는지** 사전에 매핑한다(IT-S → 메트릭 매트릭스,
  `01` §5).
- **G3.4** Grafana 대시보드 JSON을 `docker/grafana/dashboards/`에 코드로 버전
  관리하고, provisioning 스크립트로 컨테이너 기동 시 자동 import한다.
- **G3.5** SLO 4종(가용성 / 등록 지연 / 전달 지연 / DLQ 적재율)을 정의하고,
  대응하는 Prometheus alerting rule YAML을 `docker/prometheus/rules/`에 둔다.
- **G3.6** 메트릭 라벨의 **카디널리티 예산**을 명시한다(라벨 조합 ≤ 1000 / 메트릭).
  `idempotencyKey` 등 폭주 위험이 있는 식별자는 라벨로 두지 않는다.
- **G3.7** `core/metrics.ts`의 `Q-ARCH-3` (a) "빈 파일/타입 인터페이스만" 결정을
  본 PRD에서 **"prom-client 도입 + 도메인 무관 메트릭 정의 + Registry 노출"** 로
  자연스럽게 진화시킨다(1~2단계 결정을 뒤집지 않고, 그 결정이 명시한 "3단계
  PRD가 형태를 결정한다"의 약속을 이행).

---

## 3. 비목표 (Non-Goals)

본 PRD에서 명시적으로 **다루지 않는 것**:

- **N3.1** 부하 테스트, p50/p99 정량 측정의 SLO 검증, 워커 수 변화에 따른
  처리량 그래프 (4단계 — 별도 PRD).
- **N3.2** Alertmanager 라우팅, PagerDuty/Slack 연동, 온콜 로테이션, 인시던트
  런북. 본 PRD는 **알람 규칙(YAML)** 까지만 다룬다.
- **N3.3** 멀티-Prometheus federation, long-term storage (Thanos/Cortex/Mimir),
  remote write 정책.
- **N3.4** 분산 추적 (distributed tracing, OpenTelemetry tracing/log).
- **N3.5** 로그 수집/집계 (Loki, ELK). 본 PRD는 메트릭 + 대시보드 + 알람 규칙만.
- **N3.6** 자체 메트릭 라이브러리 구현. prom-client 외 새 의존성 도입 금지
  (CLAUDE.md §2).
- **N3.7** 부록 트랙 (`packages/streams-internals/`)의 메트릭 — 메인 트랙
  안정화 후 별도 작업.
- **N3.8** UI 폴리싱(Grafana 테마, 사용자 권한, 외부 노출). 대시보드는 로컬
  데모/리뷰어 화면 수준.

---

## 4. 대상 사용자

| 사용자 | 사용 시나리오 | 본 PRD가 제공해야 할 가치 |
|--------|----------------|---------------------------|
| **운영자 / 온콜** | 큐가 적체되거나 DLQ가 쌓일 때 30초 안에 인지하고, 어느 단계(등록/처리/외부 송신)에서 문제가 생겼는지 식별한다 | 메트릭 + 대시보드 + 알람 규칙이 단일 화면에서 추적 가능 |
| **포트폴리오 리뷰어 / 면접관** | "이 사람은 보장과 관측을 어떻게 매핑했나?" — IT 시나리오와 메트릭의 1:1 매핑(`01` §5)을 본다 | 7개 IT 시나리오 → 메트릭 → 대시보드 패널 → 알람의 사슬이 일관됨 |
| **본인(메인 개발자)** | AI와 협업하며 3단계를 구현한다. `core/metrics.ts`의 `Q-ARCH-3` 자리를 어떻게 채울지가 명확해야 한다 | 본 PRD가 인터페이스·라벨·카디널리티 예산을 잠근 단일 소스 |
| **데모 클라이언트(가상)** | (해당 없음 — 본 PRD는 외부 API를 늘리지 않는다) | — |

---

## 5. 성공 지표

본 PRD의 성공은 "수치"가 아니라 **검증 가능한 도달 상태**로 정의한다 (1~2단계
PRD `00` §5 형식 정합).

- **S3.1** `curl http://localhost:3000/metrics`가 `200`과 표준 Prometheus
  exposition format(`text/plain; version=0.0.4`)을 응답한다.
- **S3.2** Prometheus 컨테이너가 `docker compose up` 후 본 서비스를 scrape하고,
  `01` §3의 메트릭 카탈로그 전건이 `up{job="webhook-relay"}=1` 옆에서 조회 가능
  하다.
- **S3.3** Grafana 컨테이너가 기동되면 `docker/grafana/dashboards/`의 JSON이
  자동 import되어, 4개 대시보드(개요 / 신뢰성 / DLQ / 셧다운)가 즉시 보인다.
- **S3.4** 7개 IT 시나리오 각각에 대해, `01` §5의 매트릭스가 정의한 메트릭이
  실제로 시나리오 실행 중에 변화한다(통합 테스트 IT-OBS-N으로 검증 — PLAN 단계).
- **S3.5** `core` 패키지에 `webhook`/`http`/`fastify`/`_demo` 같은 도메인
  식별자가 메트릭 이름·라벨에 등장하지 않는다(IT-R1-domain-boundary 회귀 보호
  지속).
- **S3.6** 라벨 조합 카디널리티가 메트릭당 ≤ 1000(`01` §4 예산)을 위반하지
  않는다 (운영 중 측정으로 검증, 잠정 PLAN 단계 단언).

---

## 6. 트랙 구분 (CLAUDE.md §1 반영 — 본 PRD에 재확인)

- **메인 트랙 — 본 PRD 범위:** BullMQ 기반 메인 트랙의 **관측성 계층**.
- **부록 트랙 — 본 PRD 범위 밖:** `packages/streams-internals/`의 메트릭은
  본 PRD가 다루지 않는다. 메인 트랙이 안정화된 뒤 별도 PRD에서 다룬다.

> 본 PRD의 모든 요구사항은 메인 트랙에만 적용된다. 부록 트랙 메트릭 라벨이나
> 비교 벤치마크는 본 PRD에서 **추가하지 않는다**.

---

## 7. 용어집 (Glossary)

| 용어 | 정의 |
|------|------|
| **메트릭(Metric)** | 시계열 수치 데이터. Counter/Gauge/Histogram/Summary 중 본 PRD는 앞 3종만 사용. |
| **Counter** | 단조 증가 수치(예: 처리한 작업 수, 발생한 에러 수). 워커 재시작 시 0으로 리셋. Prometheus는 `rate()`/`increase()`로 변화량을 계산. |
| **Gauge** | 임의로 오르내릴 수 있는 순간값(예: 큐 길이, draining 상태 0/1). |
| **Histogram** | 관측값의 버킷별 카운트 + sum + count. p50/p99 같은 분위수를 `histogram_quantile()`로 추정. (Summary는 본 PRD에서 사용하지 않음 — 집계 합산 불가 이슈) |
| **Registry** | prom-client의 메트릭 컬렉션 컨테이너. 본 PRD는 단일 default registry를 사용하되, `core`와 `demo`가 각자 메트릭을 등록한다. |
| **Label** | 메트릭에 부착되는 키-값 차원(dimension). 예: `queue="webhook-delivery"`, `http_status_class="5xx"`. |
| **Cardinality(카디널리티)** | 메트릭 × 라벨 조합 수. 라벨 값이 무한히 늘면 Prometheus 메모리/디스크 폭주. 본 PRD는 메트릭당 ≤ 1000 예산. |
| **Scrape** | Prometheus가 `/metrics` 엔드포인트를 주기적으로 가져오는 동작. 본 PRD 권장 interval: 15s. |
| **Exposition Format** | Prometheus의 표준 텍스트 형식. `text/plain; version=0.0.4; charset=utf-8`. |
| **SLO (Service Level Objective)** | 시스템이 일정 윈도우 동안 충족해야 할 목표(예: "28일 가용성 99.5%"). |
| **SLI (Service Level Indicator)** | SLO를 측정하기 위해 관측하는 지표(예: 5xx 응답 비율). 본 PRD는 SLI ↔ 메트릭의 매핑을 `04` §3에 명시. |
| **Error Budget** | SLO와 실측의 격차로 정의되는 "허용 가능한 실패 예산". 예: 가용성 99.5%면 28일 동안 약 3.36시간 다운 허용. |
| **Alerting Rule** | Prometheus 서버가 평가하는 조건식. 매칭되면 Alertmanager로 알람 발화. 본 PRD는 YAML 파일까지만 다룬다(라우팅 제외). |
| **Cardinality Budget** | 메트릭당 허용하는 최대 라벨 조합 수. 본 PRD는 1000으로 잠근다. |

---

## 8. 본 PRD의 운영 원칙

1~2단계 PRD `00` §8 원칙을 본 PRD에서 그대로 계승하고, 관측성 특화 원칙을 추가한다.

- **테스트 우선 (계승):** 메트릭 회귀/카디널리티 폭주 방지 테스트를 구현 전에
  작성한다(PLAN 단계 IT-OBS-N).
- **경계에서 검증 (계승):** 메트릭 라벨 값은 `core`/`demo` 경계에서 정해진
  enum/허용 집합으로 제한한다(자유 문자열 금지 — 카디널리티 보호).
- **에러 분류 명시 (계승):** 1~2단계의 `RetriableError`/`NonRetriableError`
  분류를 본 PRD의 `error_class` 라벨로 그대로 사용한다(축 추가하지 않음).
- **구조화 로깅 (계승):** 본 PRD는 로깅을 갱신하지 않는다. 단, 메트릭 라벨과
  로그 컨텍스트가 **같은 이름**을 쓰도록 권장(`01` §3.2).
- **부록 트랙 보호 (계승):** `packages/streams-internals/`는 본 PRD에서 임포트
  하지 않는다.
- **카디널리티 우선 (신규):** 새 라벨을 추가하기 전에 **상한 추정**을 한다.
  상한이 산정되지 않으면 라벨로 두지 않는다(예: `idempotencyKey`, `jobId`, `url`).
- **`core` 도메인 격리 (신규):** `core`가 정의하는 메트릭 이름·라벨·헬프
  텍스트에 `webhook`/`http`/`fastify`/`_demo` 등 도메인 식별자가 등장하지
  않는다. 위반 시 IT-R1-domain-boundary 회귀 보호의 grep 대상에 자동 포함되어야
  한다(`01` §6 § §AC3.5).

---

## 9. 1~2단계 PRD와의 정합성 점검 (충돌 없음 선언)

본 PRD 작성 중 1~2단계 PRD/architecture/README의 어떤 §AC/§I/§F도 침범하지 않는다.
세부 매핑은 [`README.md`](./README.md) "1~2단계 PRD와의 관계" 표 참조. 본 §은
정합 보증선언이다.

- **1~2단계 §AC 보존:** `IT-S1`~`IT-S7`, `IT-R1` 모두 본 PRD 도입 이후에도
  그린이어야 한다. 본 PRD가 메트릭 호출을 추가하면서 핸들러의 동기 동작·응답
  타이밍을 변화시켜선 안 된다(메트릭 부수 효과로 retry/idempotency 검증이
  깨지면 안 됨).
- **1~2단계 §I 보존:** 특히 I2.7(`core`가 도메인 식별자 미사용)를 본 PRD가
  강화한다(메트릭 이름·라벨 검사 추가).
- **1~2단계 결정 잠금 21건 보존:** 모든 Q-IDs는 본 PRD에 의해 변경되지 않는다.
  Q-ARCH-3 (a)는 "본 PRD가 형태를 결정한다"의 약속을 이행하는 것이지 결정을
  뒤집는 것이 아니다.

---

## 10. PRD 변경 제안

본 PRD 작성 중 1~2단계 PRD/architecture/README에 **보강을 권장**하는 항목이
발견되면 본 §에 형식대로 기록한다. **PRD는 임의로 직접 수정하지 않는다.** 결정은
사람이 별도 PR로.

> 본 문서(`00-overview.md`)에서 발견된 보강 제안: **없음**(본 문서는 본 PRD
> 묶음의 진입점일 뿐 외부 문서를 침범하지 않는다).

> 본 PRD 묶음 전체의 보강 제안은 [`05-out-of-scope-and-open-questions.md`](./05-out-of-scope-and-open-questions.md)
> §3에 통합 기록.

---

## 11. 다음 단계

본 PRD 묶음을 모두 검토한 뒤:

1. [`05-out-of-scope-and-open-questions.md`](./05-out-of-scope-and-open-questions.md)
   §2의 **Q-OBS-N** 결정을 사람이 잠근다.
2. **PLAN 단계** (`docs/plan-phase3/`, 별도 PR)에서 다음을 작성한다:
   - `core/metrics.ts`의 인터페이스 정의 (도메인 무관 Counter/Gauge/Histogram)
   - `demo/metrics.ts`의 도메인 메트릭 정의(웹훅 전송 결과 분포 등)
   - `/metrics` 라우트와 prom-client Registry wiring
   - `docker/grafana/dashboards/*.json` + provisioning YAML
   - `docker/prometheus/rules/*.yaml` + scrape 설정 갱신
   - IT-OBS-1~N (PLAN 단계에서 명세) — 메트릭 회귀/카디널리티 보호 통합 테스트
3. 모든 IT가 그린이 된 뒤 `docs/architecture.md` §5의 "Prometheus/Grafana
   관측성(3단계 PRD)" 줄을 "보장한다"로 갱신하는 별도 PR을 제안한다([`05`](./05-out-of-scope-and-open-questions.md)
   §3 참조).
