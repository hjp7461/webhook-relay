# 01. Metrics & Labels — 메트릭 카탈로그·명명 규칙·라벨 설계·카디널리티 예산

> 담당 페르소나: **SRE/Observability Lead** + **Architect**(경계 강제)
> 본 문서는 본 PRD의 핵심 카탈로그다. 다른 phase3 문서는 본 문서가 정의한
> 메트릭 이름/라벨/타입을 참조한다.
> 구현 코드는 본 PRD가 승인된 뒤 **후속 PLAN 단계**에서 작성한다.

---

## 1. 컨텍스트 / 배경

메트릭은 한 번 노출되면 **운영자가 그것을 보고 의사결정을 내리는 계약**이 된다.
이름·라벨·집계 방식을 잘못 고르면 다음 문제가 발생한다.

- **카디널리티 폭주:** 라벨 값에 자유 문자열(예: `idempotencyKey`, `url`)을
  두면 Prometheus가 메모리·디스크를 폭주시킨다. 한 번 노출된 라벨은 되돌리기
  어렵다(대시보드·알람·계약).
- **잘못된 집계:** 분포가 필요한 곳에 Counter를 쓰면 p99 추정이 불가능. Summary는
  분위수가 사전 정의되어 집계 합산 불가 — 본 PRD는 Histogram을 우선한다.
- **도메인 누수:** `core`가 `webhook_*` 메트릭을 정의하면 CLAUDE.md §3 폴더 경계가
  깨진다.
- **재시작 시 의미 변동:** Counter는 워커 재시작 시 0으로 리셋. `rate()`/`increase()`로
  변화량을 보는 것이 표준. 본 PRD는 이 사실을 명시적으로 노출한다.

본 문서는 위 함정을 사전에 잠근다.

---

## 2. 목표 (Goals)

- **G1.1** 메트릭 명명 규칙(prom-client 컨벤션 + `webhook_relay_` 접두)을 잠근다.
- **G1.2** 메트릭 카탈로그(이름·타입·라벨·단위·헬프 텍스트·관련 IT 시나리오)를
  단일 표로 잠근다.
- **G1.3** 라벨 카디널리티 예산(메트릭당 ≤ 1000 조합)을 명시한다.
- **G1.4** `core` vs `demo` 메트릭 책임 분담을 잠근다(도메인 식별자 격리).
- **G1.5** 1~2단계 7개 IT 시나리오 ↔ 메트릭 매트릭스(IT-S → 어떤 메트릭이 어떻게
  움직이는가)를 명시한다.

---

## 3. 메트릭 카탈로그

### 3.0 명명 규칙

- **접두:** 모든 메트릭은 `webhook_relay_` 접두를 갖는다. Prometheus 컨벤션은
  `_<application>_<noun>_<unit>` 또는 `_<application>_<noun>_total`이다.
- **단위 접미:**
  - 시간: `_seconds` (밀리초 금지 — Prometheus 컨벤션은 SI 단위)
  - 바이트: `_bytes`
  - 개수: 누적 Counter는 `_total`, 순간 Gauge는 단위 접미 없음
- **소문자 + 언더스코어** 만 사용.
- **`core` 책임 vs `demo` 책임:** 메트릭 이름이 `webhook_relay_queue_*` /
  `webhook_relay_worker_*` 처럼 큐 일반 명사면 `core`. `webhook_relay_delivery_*` /
  `webhook_relay_api_*` 처럼 도메인이면 `demo`. 자세한 분담은 §6.

> **카탈로그 표 형식:** Type ∈ {Counter, Gauge, Histogram}. Pkg ∈ {`core`,
> `demo`}. 라벨 카디널리티는 §4 예산 표를 참조.

### 3.1 큐 / 워커 메트릭 (도메인 무관 — `core`)

| # | 이름 | Type | 단위 | Labels | 의미 / IT 매핑 |
|---|------|------|------|--------|----------------|
| C1 | `webhook_relay_queue_depth` | Gauge | jobs | `queue`, `job_state` | BullMQ 큐 상태별 작업 수 순간값. `job_state ∈ {waiting, active, delayed, completed, failed}` (BullMQ 상태 모델 그대로). DLQ 큐는 별도 `queue` 라벨 값으로 표현. **수집 방식:** scrape 시점에 `queue.getJobCounts()`를 호출하는 collector hook(prom-client `collect()`). IT-S1 / IT-S3 / IT-S4 매핑. |
| C2 | `webhook_relay_jobs_processed_total` | Counter | jobs | `queue`, `job_state` | 워커가 종단 처리한 작업 수. `job_state ∈ {completed, failed}`. Worker `'completed'`/`'failed'` 이벤트에서 증가. (NOTE: `attempt` 별 분해는 C3·C4에서 다룬다 — 본 메트릭은 종단 결과만.) IT-S1 / IT-S4 / IT-S5 매핑. |
| C3 | `webhook_relay_job_attempts_total` | Counter | attempts | `queue`, `outcome` | 시도 단위 누적. `outcome ∈ {success, retriable_error, non_retriable_error}`. 매 핸들러 호출 종료 시 1회 증가. 재시도 분포(시도 수)는 §C4 histogram으로. IT-S2 / IT-S3 / IT-S5 매핑. |
| C4 | `webhook_relay_worker_processing_duration_seconds` | Histogram | seconds | `queue`, `outcome` | 워커가 작업 1회를 처리한 wall-clock 시간(핸들러 시작 → 종단). `outcome` 라벨은 C3와 동일 enum. **버킷:** `[0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30]` (s). IT-S3 매핑(재시도 백오프와는 별개 — 본 메트릭은 한 시도의 처리 시간만). |
| C5 | `webhook_relay_dlq_jobs_total` | Counter | jobs | `reason` | DLQ로 이동한 작업 누적. `reason ∈ {max_attempts_exceeded, non_retriable, stalled_loss_recovered}`. (도메인 무관 분류 — 1~2단계 PRD `02` §F2.4 정합.) IT-S4 / IT-S5 / IT-S6b 매핑. |
| C6 | `webhook_relay_worker_active_jobs` | Gauge | jobs | (none) | 워커 프로세스 내부의 진행 중 작업 수(개별 워커 관점). 셧다운 진행 시 0으로 수렴해야 한다. **수집 방식:** worker.ts의 in-memory `activeJobs` 맵 크기에 hook. IT-S7 매핑. |
| C7 | `webhook_relay_redis_reconnects_total` | Counter | events | (none) | ioredis `reconnecting` 이벤트 발생 횟수. 즉시 재시도 폭주를 알람으로 감지. (1~2단계 PRD `06` §5 정합) |
| C8 | `webhook_relay_redis_up` | Gauge | bool | (none) | Redis 연결 상태(0/1). `up{job}`과 별개로 워커 관점의 연결 신호. |
| C9 | `webhook_relay_shutdown_state` | Gauge | enum | `state` | 셧다운 상태 머신. `state ∈ {running, draining, terminated}` 중 정확히 하나가 1, 나머지는 0. 시그널 핸들러에서 갱신. IT-S7 매핑. |
| C10 | `webhook_relay_shutdown_remaining_jobs` | Gauge | jobs | (none) | 셧다운 타임아웃 도달 직전에 set. 정상 종료 시 0. (1~2단계 PRD `06` §6.2 "잔여 작업 ID 로그"의 메트릭 짝.) IT-S7 매핑. |
| C11 | `webhook_relay_build_info` | Gauge | bool | `version`, `commit`, `node_version` | 빌드 메타. 항상 1. Grafana에서 버전 추적용. (운영 표준 패턴) |

### 3.2 HTTP API 메트릭 (`demo` — Fastify 도메인)

| # | 이름 | Type | 단위 | Labels | 의미 / IT 매핑 |
|---|------|------|------|--------|----------------|
| D1 | `webhook_relay_api_requests_total` | Counter | requests | `route`, `method`, `status_class` | Fastify 라우트별 요청 누적. `route` 라벨은 **명세된 경로 패턴**(예: `/webhooks`, `/_demo/receiver`, `/dashboard`, `/api/queue/stats`, `/healthz`, `/metrics`)으로만 한정 — 자유 path 금지(카디널리티 보호). `status_class ∈ {2xx, 3xx, 4xx, 5xx}` (raw status code 사용 금지 — §4 카디널리티 예산 참조). |
| D2 | `webhook_relay_api_request_duration_seconds` | Histogram | seconds | `route`, `method`, `status_class` | 라우트별 처리 시간. 버킷: `[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]` (s). API 응답 지연 SLO의 기반. |
| D3 | `webhook_relay_api_request_body_bytes` | Histogram | bytes | `route` | 요청 본문 크기 분포(페이로드 상한 위반 패턴 관찰용). 버킷: `[256, 1024, 4096, 16384, 65536, 262144]` (B). `WEBHOOK_MAX_PAYLOAD_BYTES` 상한 운영 신호. |

### 3.3 웹훅 도메인 메트릭 (`demo` — 외부 송신)

| # | 이름 | Type | 단위 | Labels | 의미 / IT 매핑 |
|---|------|------|------|--------|----------------|
| W1 | `webhook_relay_deliveries_total` | Counter | deliveries | `result`, `http_status_class`, `error_class` | 외부 HTTP 송신 결과 누적(시도 단위, 종단 작업 단위가 아님). `result ∈ {success, http_error, network_error, timeout, ssrf_blocked}`. `http_status_class ∈ {2xx, 3xx, 4xx, 5xx, none}` (`none`은 네트워크 에러로 응답 없음). `error_class ∈ {none, RetriableError, NonRetriableError}` (1~2단계 `RetriableError`/`NonRetriableError` 분류 그대로). IT-S1/S3/S5 매핑. |
| W2 | `webhook_relay_delivery_duration_seconds` | Histogram | seconds | `result` | 외부 HTTP 송신 wall-clock(`fetch` 호출 시작 → 응답 수신 또는 abort). 버킷: C4와 동일. timeout 케이스는 `result=timeout`에 적재 + duration = `WEBHOOK_DELIVERY_TIMEOUT_MS` 근방. |
| W3 | `webhook_relay_delivery_attempts_per_job` | Histogram | attempts | `outcome` | 작업이 종단 상태(completed/DLQ)에 도달할 때까지 소요된 시도 수 분포. **수집 시점:** Worker `'completed'`/`'failed'` 이벤트의 `attemptsMade`. `outcome ∈ {completed, dlq_max_attempts, dlq_non_retriable, dlq_stalled_loss}`. 버킷: `[1, 2, 3, 5, 8, 13, 21]` (정수). IT-S3/S4/S5 매핑. |
| W4 | `webhook_relay_receiver_received_total` | Counter | events | (none) | 데모 수신자(`POST /_demo/receiver`)가 받은 페이로드 누적. 해피패스 도착 증거. IT-S1 매핑. (1~2단계 PRD `01` §F1.3) |

> **Summary는 본 PRD에서 사용하지 않는다.** Summary는 분위수가 사전 정의되어
> 집계 합산 불가능 → 멀티 워커에서 p99를 합칠 수 없다. 본 시스템은 워커 수평
> 확장이 전제이므로 Histogram을 우선한다.

### 3.4 prom-client 기본 메트릭 (process / nodejs)

prom-client `collectDefaultMetrics()`는 다음을 기본 제공한다. **본 PRD는 기본
이름을 그대로 사용**(prom-client 컨벤션 보존):

- `process_cpu_user_seconds_total`, `process_cpu_system_seconds_total`
- `process_resident_memory_bytes`, `process_heap_bytes`
- `nodejs_eventloop_lag_seconds` (Histogram)
- `nodejs_active_handles_total`, `nodejs_active_requests_total`
- `nodejs_gc_duration_seconds`

운영 대시보드의 "리소스" 패널에서 사용(`03` §4.5).

---

## 4. 카디널리티 예산

### 4.1 원칙

- **메트릭 × 라벨 조합 ≤ 1000**: 단일 워커 프로세스 기준. 워커 N개 수평 확장
  시 Prometheus 입장에서는 `instance` 라벨이 추가되어 N배가 되지만, 본 예산은
  애플리케이션이 정의한 라벨에 한정.
- **라벨 값은 폐쇄 집합**: enum이 아닌 자유 문자열은 라벨로 두지 않는다.
- **새 라벨 추가 시 상한 추정 의무**: 상한이 산정되지 않으면 라벨로 두지 않는다.

### 4.2 라벨 값 enum 잠금

| 라벨 | 허용 값 | 상한 |
|------|---------|------|
| `queue` | `webhook-delivery`, `webhook-delivery-dlq` | 2 |
| `job_state` | `waiting`, `active`, `delayed`, `completed`, `failed` | 5 |
| `outcome` (C3/C4) | `success`, `retriable_error`, `non_retriable_error` | 3 |
| `outcome` (W3) | `completed`, `dlq_max_attempts`, `dlq_non_retriable`, `dlq_stalled_loss` | 4 |
| `reason` (C5) | `max_attempts_exceeded`, `non_retriable`, `stalled_loss_recovered` | 3 |
| `state` (C9) | `running`, `draining`, `terminated` | 3 |
| `result` (W1/W2) | `success`, `http_error`, `network_error`, `timeout`, `ssrf_blocked` | 5 |
| `http_status_class` | `2xx`, `3xx`, `4xx`, `5xx`, `none` | 5 |
| `error_class` | `none`, `RetriableError`, `NonRetriableError` | 3 |
| `route` | 명세된 경로 패턴 enum (§3.2 D1 참조) | 7 (현재 라우트 수) |
| `method` | `GET`, `POST` | 2 |
| `status_class` (D1/D2) | `2xx`, `3xx`, `4xx`, `5xx` | 4 |

### 4.3 라벨로 두지 않는 식별자 (명시적 금지)

다음은 운영 디버깅 시 유용해 보일 수 있으나 **라벨로 두지 않는다**. 필요하면
구조화 로그·트레이싱 영역(본 PRD 범위 밖)에서 다룬다.

- `idempotencyKey` — 클라이언트 자유 문자열, 무한 카디널리티 (ADR-002 정합)
- `jobId` — `idempotencyKey`와 동일(같은 값)
- `url` (외부 수신자 URL) — 자유 문자열
- `payload` 내용 자체 — 본문 누출 위험 (1~2단계 PRD `06` §10 시크릿 격리)
- `attempt` (시도 번호 raw 정수) — 무한히 증가하지는 않으나(`WEBHOOK_MAX_ATTEMPTS`
  상한, 기본 5) 라벨 폭을 작게 유지하기 위해 **Histogram bucket(W3)** 으로 분해
- `requestId` — 자유 문자열
- 호스트명/IP(외부 수신자) — 자유 문자열
- HTTP raw status code(예: `200`, `503`) — `status_class`/`http_status_class`로
  묶음 (Q-OBS-5 잠정 결정, [`05`](./05-out-of-scope-and-open-questions.md) 참조)

### 4.4 메트릭별 라벨 조합 상한 표

| 메트릭 | 라벨 조합 상한 | 예산(1000) 대비 |
|--------|----------------|------------------|
| C1 `queue_depth` | 2 × 5 = 10 | ✓ |
| C2 `jobs_processed_total` | 2 × 2 = 4 | ✓ |
| C3 `job_attempts_total` | 2 × 3 = 6 | ✓ |
| C4 `worker_processing_duration_seconds` | 2 × 3 × (10 버킷 + _sum/_count) ≈ 72 (시계열) | ✓ |
| C5 `dlq_jobs_total` | 3 | ✓ |
| C6 `worker_active_jobs` | 1 | ✓ |
| C9 `shutdown_state` | 3 | ✓ |
| D1 `api_requests_total` | 7 × 2 × 4 = 56 | ✓ |
| D2 `api_request_duration_seconds` | 7 × 2 × 4 × (10 + 2) ≈ 672 | ✓ (단일 메트릭 한계 근처 — 모니터링 필요) |
| D3 `api_request_body_bytes` | 7 × (6 + 2) = 56 | ✓ |
| W1 `deliveries_total` | 5 × 5 × 3 = 75 | ✓ |
| W2 `delivery_duration_seconds` | 5 × (10 + 2) = 60 | ✓ |
| W3 `delivery_attempts_per_job` | 4 × (7 + 2) = 36 | ✓ |

> D2가 단일 메트릭 카디널리티 한계에 가장 근접한다. PLAN 단계에서 통합 테스트
> (IT-OBS-N)가 실측치로 단언한다.

### 4.5 라벨 추가 절차 (운영 규칙)

새 라벨을 추가하려면:

1. 본 §4.2 표에 enum 잠금 행을 먼저 추가.
2. 메트릭별 라벨 조합 상한을 §4.4에 갱신.
3. 1000 예산 초과 시 거부.
4. CLAUDE.md §7-4(불확실하면 묻기) 적용 — 임의 추가 금지.

---

## 5. IT 시나리오 ↔ 메트릭 매트릭스

1~2단계 7개 IT 시나리오 + IT-R1이 실행될 때 본 PRD 메트릭이 어떻게 움직이는가.
PLAN 단계의 IT-OBS-N 테스트는 본 매트릭스를 단언한다.

| IT | 시나리오 한 줄 | 움직이는 메트릭 (예상 방향) |
|----|----------------|------------------------------|
| IT-S1 (해피패스) | 1건 등록 → 처리 → 수신자 도착 | D1 `route="/webhooks",status_class="2xx"` +1, C2 `job_state="completed"` +1, W1 `result="success",http_status_class="2xx",error_class="none"` +1, W2 (success 분포 +1 sample), W3 `outcome="completed"` (1 attempt bucket) +1, W4 +1 |
| IT-S2 (멱등성) | 동일 키 N회 → 1회 실행 | D1 `/webhooks,2xx` +N (모두 동일 jobId 응답), C3 `outcome="success"` +1, W1 `result="success"` +1, W4 +1 (등록 응답은 N건이지만 실제 송신은 1건) |
| IT-S3 (재시도+백오프) | 5xx K번 → K+1번째 200 | C3 `outcome="retriable_error"` +K, C3 `outcome="success"` +1, W1 `result="http_error",http_status_class="5xx"` +K, W1 `result="success"` +1, W3 `outcome="completed"` (K+1 attempts bucket) +1 |
| IT-S4 (max attempts → DLQ) | 항상 5xx | C3 `outcome="retriable_error"` +MAX_ATTEMPTS, C2 `job_state="failed"` +1, C5 `reason="max_attempts_exceeded"` +1, W3 `outcome="dlq_max_attempts"` +1 |
| IT-S5 (4xx 즉시 DLQ) | 첫 시도 4xx | C3 `outcome="non_retriable_error"` +1, C2 `job_state="failed"` +1, C5 `reason="non_retriable"` +1, W1 `error_class="NonRetriableError"` +1, W3 `outcome="dlq_non_retriable"` (1 attempt) +1 |
| IT-S6 (stalled 회수) | 워커 A 죽음 → B 회수 | C1 `job_state="active"` (A가 잡고 있을 때 +1, 회수 후 다시 +1), C2 `job_state="completed"` +1 (B가 처리), W3 `outcome="completed"` (attempts ≥ 2) +1 |
| IT-S6b (stalled-loss recovery) | `failed(job===undefined)` | C5 `reason="stalled_loss_recovered"` +1, W3 `outcome="dlq_stalled_loss"` +1 |
| IT-S7 (그레이스풀 셧다운) | SIGTERM | C9 `state=running→draining→terminated` 전이, C6 (active job 수 감소), D1 `route="/webhooks",status_class="5xx"` (503 응답) 증가, D1 `route="/healthz",status_class="5xx"` 증가, C10 (정상 종료 시 0, 타임아웃 시 양수) |
| IT-R1 (도메인 경계) | grep 회귀 | (메트릭 미검사. 단, 본 PRD가 `core` 메트릭 이름에 도메인 식별자를 두지 않음을 §6에서 강제하고, IT-R1의 grep 대상에 본 PRD 메트릭 모듈을 포함하도록 PRD 변경 제안 — `05` §3) |

### 5.1 매트릭스의 활용

- **PLAN 단계 IT-OBS-N**: 본 매트릭스 행을 그대로 테스트로 옮긴다. 통합 테스트
  실행 후 `/metrics` 스크레이프 → 메트릭 값 단언.
- **Grafana 대시보드 패널**: 본 매트릭스의 메트릭 컬럼이 대시보드 패널의 PromQL
  쿼리 소재(`03` §4 패널별 PromQL).
- **알람 규칙**: 본 매트릭스의 비정상 패턴(예: C5 `reason="max_attempts_exceeded"`
  증가율 > 임계)이 `04` §5 alerting rule의 소재.

---

## 6. `core` vs `demo` 메트릭 책임 분담 (도메인 격리 강제)

### 6.1 분담 원칙 (CLAUDE.md §3 정합)

- **`core`가 정의:** §3.1 큐/워커 메트릭 (C1~C11). 이름·라벨·헬프 텍스트에
  `webhook`/`fastify`/`_demo` 등 도메인 식별자가 등장하지 않는다.
  접두 `webhook_relay_*`의 `webhook_relay`는 **애플리케이션 식별자**(prom-client
  컨벤션의 prefix)이지 도메인 식별자가 아니다. 모호함을 피하기 위해 본 PRD는
  `core` 모듈 내부에서는 "도메인 식별자 = `webhook` / `delivery` /
  `fastify` / `receiver` / `_demo`" 로 정의한다 (`webhook_relay` 접두는 IT-R1
  grep 대상에서 **예외 처리**해야 함 — `05` §3 PRD 변경 제안 참조).
- **`http` 는 도메인 식별자 집합에서 제외 (2026-05-27 잠금):** 1~2단계 잔존
  식별자 `httpServer` (in `packages/core/src/shutdown.ts`) / `httpStatus`
  (in `packages/core/src/errors.ts`, `worker.ts`) 가 `core` 의 일반적 HTTP
  표준 어휘(웹훅 도메인이 아니라 RFC HTTP 의미)로 사용되며, rename 시 1~2단계
  공개 API 시그니처와 architecture.md §2 의 컴포넌트 표가 동시에 깨진다.
  따라서 본 PRD 는 `http` 를 BANNED_TOKENS_SET 에서 제외한 현 IT-R1 상태를
  **정식 정책**으로 잠근다 — `core` 내부에서 `http*` 식별자는 RFC HTTP 어휘에
  한해 허용한다. 웹훅 도메인 의미(`webhook`/`delivery`/`receiver`/`_demo`)는
  여전히 금지.
- **`demo`가 정의:** §3.2 HTTP API + §3.3 웹훅 도메인 메트릭 (D1~D3, W1~W4).
  Fastify/외부 수신자 의존이 있어 `core`에 둘 수 없다.
- **Registry 공유:** 단일 default registry. `core`와 `demo`가 각자 자기 메트릭을
  default registry에 등록 → `/metrics` 라우트는 single source로 노출. (자세한
  wiring은 [`02-metrics-endpoint.md`](./02-metrics-endpoint.md) §3.)

### 6.2 위반 시 검출 수단

- **IT-R1-domain-boundary 보강:** 현재 IT-R1은 `packages/core/src/**`에서 도메인
  식별자 0건을 단언한다. 본 PRD가 `core/metrics.ts`를 채우면서 도메인 식별자
  누수 가능성이 새로 생긴다. PLAN 단계에서 IT-R1을 다음으로 확장한다(또는
  IT-OBS-1로 신규 추가):
  - `core/metrics.ts` 의 메트릭 이름 정규식 `^webhook_relay_(queue|jobs|job|worker|dlq|redis|shutdown|build)_*` 만 허용.
  - 헬프 텍스트에 도메인 식별자 등장 금지.

### 6.3 `core/metrics.ts`의 1~2단계 → 3단계 진화

1~2단계 결정 잠금 `Q-ARCH-3` (a) "빈 파일/타입 인터페이스만"은 본 PRD에서 다음과
같이 진화한다 (결정을 뒤집는 것이 아니라, 그 결정이 명시한 "3단계 PRD가 형태를
결정한다"의 이행).

| 단계 | `core/metrics.ts` 내용 |
|------|------------------------|
| 1~2단계 (Resolved 결정) | 빈 파일 또는 미사용 타입 인터페이스만 |
| 3단계 (본 PRD) | prom-client 의존 도입 + §3.1 C1~C11 메트릭 정의 + Registry 노출 함수 + 명명 규칙 검증 헬퍼 |

### 6.4 prom-client 의존성 도입의 정당성

CLAUDE.md §2 "표준 라이브러리나 이미 있는 의존성으로 해결 가능하면 새 패키지를
추가하지 않는다"와 일견 충돌해 보이지만:

- CLAUDE.md §2 표는 prom-client를 **메트릭 항목의 고정 스택**으로 명시한다
  ("| 메트릭 | prom-client | Prometheus 포맷 노출 |").
- 따라서 본 PRD에서 prom-client를 도입하는 것은 **CLAUDE.md §2가 사전에 잠근
  결정의 이행**이지, 새 의존성 추가가 아니다.
- Grafana 대시보드 정의는 **JSON 파일**(`docker/grafana/dashboards/*.json`)로
  관리한다. Grafana 클라이언트 라이브러리(예: `@grafana/grafana-toolkit`,
  `grafana-dashboard-builder`)는 **도입하지 않는다** — JSON으로 충분하며
  CLAUDE.md §2 정합. ([`05`](./05-out-of-scope-and-open-questions.md) Q-OBS-7
  참조)

---

## 7. 메트릭 리셋 / 생명주기 정책

### 7.1 정책

- **Counter는 워커 프로세스 생명주기 동안만 유효.** 워커 재시작 시 0으로 리셋.
  Prometheus는 `rate()`/`increase()`로 변화량을 계산하므로 운영 영향 없음.
  본 PRD는 이 사실을 헬프 텍스트와 대시보드 패널 주석에 명시한다(`03` §3).
- **Gauge는 항상 "현재 상태"를 표현.** 워커 재시작 시 collector가 다시 채운다
  (C1 `queue_depth`는 collect hook으로 매 scrape 시 재조회).
- **C11 `build_info`는 항상 1**(메타 패턴). 버전 추적용.
- **자체 누적 저장 금지:** Counter 값을 Redis 등에 영속화하지 않는다(prom-client
  관행에서 벗어남). 워커 수평 확장 시 `instance` 라벨로 합산되며, 이것이
  Prometheus 표준이다.

### 7.2 셧다운 진행 중 메트릭

- C9 `shutdown_state` 가 `draining` → `terminated`로 전이.
- C6 `worker_active_jobs` 가 0으로 수렴 (정상) 또는 양수 잔존 (타임아웃).
- C10 `shutdown_remaining_jobs` 가 종단 직전에 set.
- `/metrics` 엔드포인트는 셧다운 진행 중에도 **200 유지**를 잠정 권장(
  [`02-metrics-endpoint.md`](./02-metrics-endpoint.md) §6 + [`05`](./05-out-of-scope-and-open-questions.md)
  Q-OBS-2).

---

## 8. 비기능 요구사항

| 분류 | 요구 |
|------|------|
| **성능** | 메트릭 갱신은 hot path 비용 ≤ 1µs/event 수준(prom-client `inc()`/`observe()`의 표준 성능). C1 `queue_depth`의 `getJobCounts()`는 scrape 시점에만 호출(매 작업마다 호출 금지). |
| **보안** | 메트릭 라벨·헬프 텍스트에 시크릿(`API_BEARER_TOKEN`, `WEBHOOK_HMAC_SECRET`)·페이로드 본문·URL 자체를 노출하지 않는다(1~2단계 PRD `06` §10 I6.1 정합). |
| **카디널리티** | §4 예산 준수. 메트릭당 ≤ 1000 라벨 조합. |
| **결정성** | 라벨 enum은 §4.2 표에 닫혀 있다. 코드의 자유 문자열 라벨 금지(PLAN 단계에서 lint/test 강제). |
| **호환성** | Prometheus exposition format `version=0.0.4` 표준. prom-client가 자동 생성. |
| **관측성(스스로)** | 메트릭 자체의 회귀를 IT-OBS-N으로 검증(PLAN). 카디널리티 폭주 단언 포함. |

---

## 9. 수용 기준 (AC)

- **AC3.1** §3 카탈로그의 모든 메트릭 이름·타입·라벨이 PLAN 단계 구현과 **글자
  단위로 일치**한다(매직 스트링 금지 — `constants.ts`에 단일 소스).
- **AC3.2** 라벨 값 enum이 §4.2 표대로 코드에 잠긴다(자유 문자열 라벨 미사용).
- **AC3.3** `core/metrics.ts`의 메트릭 이름/헬프 텍스트에 도메인 식별자가
  검출되지 않는다(IT-R1 보강으로 강제 — §6.2).
- **AC3.4** `/metrics` 스크레이프 시 §3 카탈로그 메트릭이 전건 등장한다(빌드
  시점에 0이라도 메트릭 자체는 노출 — prom-client `Counter.inc(0)` 패턴 또는
  `Counter` 정의만으로도 노출됨을 PLAN 단계에서 확인).
- **AC3.5** PLAN 단계의 IT-OBS-N이 §5 매트릭스의 모든 행을 단언한다.
- **AC3.6** 카디널리티 예산 위반 시 PLAN 단계 빌드/테스트가 실패한다(IT-OBS-카디널리티-가드).

---

## 10. 불변식 (Invariants)

- **I3.1 (메트릭 이름 안정성)** 본 PRD가 잠근 메트릭 이름은 **추가는 가능하나
  삭제·이름 변경 불가**. 운영자/대시보드/알람이 의존하기 때문. 변경이 필요하면
  새 메트릭을 추가하고 구 메트릭을 한 마이너 버전 이상 유지한다.
- **I3.2 (라벨 enum 폐쇄성)** 라벨 값은 §4.2 표의 enum 집합 밖으로 나가지
  않는다. 새 값을 추가하려면 §4.5 절차를 따른다.
- **I3.3 (도메인 격리)** `core`의 메트릭 이름·헬프 텍스트는 도메인 식별자
  (`webhook` / `delivery` / `http` / `fastify` / `receiver` / `_demo`)를
  포함하지 않는다(CLAUDE.md §3 강화). 단, 접두 `webhook_relay`는 애플리케이션
  식별자로 IT-R1 grep 예외(PRD 변경 제안 §10 참조).
- **I3.4 (카디널리티 예산)** §4.4의 메트릭별 상한과 §4.1의 메트릭당 1000 예산을
  위반하지 않는다.
- **I3.5 (메트릭은 hot path를 막지 않는다)** 메트릭 갱신은 동기적/비차단이며
  스크레이프 호출이 핸들러 응답을 막지 않는다(`getJobCounts()`는 collect 시점만).

---

## 11. 리스크 / 오픈 퀘스천

다음 항목은 본 PRD에서 잠정 기본값을 두되, 사람 결정을 [`05-out-of-scope-and-open-questions.md`](./05-out-of-scope-and-open-questions.md)
§2의 **Q-OBS-N**에 위임한다.

- **R3.1** raw HTTP status code를 라벨로 둘지(현재: `status_class`로 묶음) — 5xx
  세부 분석 손실 vs 카디널리티 보호. → **Q-OBS-5**.
- **R3.2** `attempt` 번호를 별도 라벨로 둘지(현재: W3 histogram bucket으로 분해)
  → **Q-OBS-6**.
- **R3.3** `route` 라벨 값에 동적 path parameter가 들어올 위험(현재: 본 PRD는
  동적 path 없음). 미래 라우트 추가 시 가이드 필요. → **Q-OBS-8**.
- **R3.4** Histogram 버킷이 운영 데이터에 적합한지(현재: 본 PRD가 잠정 잠금).
  운영 측정 후 재조정 가능 — 단 버킷 변경은 시계열 재시작과 같으므로 신중.
  → **Q-OBS-9**.

---

## 12. PRD 변경 제안

본 문서 작성 중 1~2단계 PRD/architecture/README에 보강이 필요하다고 판단한
항목. **본 PRD는 임의로 다른 문서를 수정하지 않는다.** 결정은 사람이 별도 PR로.

> 본 문서의 보강 제안은 [`05-out-of-scope-and-open-questions.md`](./05-out-of-scope-and-open-questions.md)
> §3 통합 표에 함께 기록한다. 본 §은 그 표를 가리키는 포인터다.

대표 항목 미리보기 (전체는 `05` §3):

- **C-MET-1:** `docs/prd/04-architecture-boundaries.md` §7 표의 "메트릭 정의(정의만)
  — `core/metrics.ts` — 실제 노출은 3단계" 줄을 "3단계 PRD에서 prom-client
  도입 + 도메인 무관 메트릭 정의"로 갱신 제안.
- **C-MET-2:** `IT-R1-domain-boundary`의 grep 대상에서 `webhook_relay_` 접두
  (애플리케이션 식별자)를 예외 처리하는 정책 명시 제안 (architecture.md §2
  도메인 식별자 정의 갱신).
- **C-MET-3:** `docs/architecture.md` §5 "보장하지 않는다 — Prometheus/Grafana
  관측성(3단계 PRD)" 줄을 본 PRD 승인 후 "보장한다"로 갱신 제안.
