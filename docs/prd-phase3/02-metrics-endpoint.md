# 02. Metrics Endpoint — `/metrics` 명세 · Registry · `core`/`demo` 경계

> 담당 페르소나: **API Designer** + **Architect**(경계 강제) + **SRE/Observability Lead**
> 본 문서는 `/metrics` 엔드포인트의 외부 계약과 내부 wiring을 잠근다.
> 구현 코드는 본 PRD가 승인된 뒤 **후속 PLAN 단계**에서 작성한다.

---

## 1. 컨텍스트 / 배경

본 PRD `01-metrics-and-labels.md`이 메트릭 카탈로그를 잠갔다면, 본 문서는 그
카탈로그를 **어떻게 외부에 노출하는가**를 잠근다.

- 어느 라우트로? `/metrics` (Prometheus 관행)
- 어느 패키지가? `demo` (Fastify 위) — 단, prom-client `Registry`와 메트릭 정의
  자체는 `core`/`demo` 분담(`01` §6).
- 인증은? — 결정 잠금 `Q-API-1` (b)는 `/webhooks`에만. `/metrics`는 별도 결정
  필요 → **Q-OBS-1** (잠정 인증 없음 권장, 내부망 전제).
- 셧다운 중에는? — 1~2단계 PRD `06` §6.2가 `/healthz`=503, `/dashboard`=200을
  잠갔다. `/metrics`는 별도 결정 → **Q-OBS-2** (잠정 200 유지 권장).
- Prometheus는 어떻게 scrape하는가? `docker/prometheus.yml` 갱신 명세.

---

## 2. 목표 (Goals)

- **G2.1** `/metrics` 라우트 명세(메서드/경로/Content-Type/응답 본문 형식)를 잠근다.
- **G2.2** prom-client `Registry` 구성과 `core`/`demo` 메트릭 wiring을 잠근다.
- **G2.3** Prometheus scrape 설정(`docker/prometheus.yml`)의 잠정 형태와 권장
  scrape interval을 명세한다.
- **G2.4** 셧다운 진행 중 `/metrics` 응답 정책을 명세한다(Q-OBS-2 잠정 결정).
- **G2.5** `core`의 `metrics.ts`가 `demo`(특히 Fastify)에 의존하지 않는 wiring
  형태를 잠근다(I4.1·I4.2 보존 — CLAUDE.md §3).

---

## 3. `/metrics` 라우트 외부 명세

### 3.1 요청

- **메서드/경로:** `GET /metrics`
- **요청 헤더:** Prometheus가 보내는 표준 `Accept: text/plain; version=0.0.4; ...`
  를 수신. 본 PRD는 헤더 협상을 강제하지 않는다(prom-client 기본 동작 수용).
- **인증:** **잠정 인증 없음** (내부망 전제, **Q-OBS-1** 결정 보류). README의
  "운영 노트"에 외부 노출 시 위험 명시.
- **메서드 외 요청 (POST/PUT/...):** Fastify 표준대로 `404` 또는 `405` 반환.
  본 PRD는 강제하지 않는다(Fastify 기본 동작 수용).

### 3.2 성공 응답

- **상태:** `200 OK`
- **Content-Type:** `text/plain; version=0.0.4; charset=utf-8` (Prometheus
  exposition format 표준. prom-client `register.contentType` 가 정확한 헤더
  값을 제공.)
- **본문:** prom-client `register.metrics()` 출력 그대로.
  예시 형식 (실제 값은 PLAN 단계에서 결정):
  ```
  # HELP webhook_relay_jobs_processed_total Jobs processed terminally by workers.
  # TYPE webhook_relay_jobs_processed_total counter
  webhook_relay_jobs_processed_total{queue="webhook-delivery",job_state="completed"} 1234
  webhook_relay_jobs_processed_total{queue="webhook-delivery",job_state="failed"} 5
  ...
  ```

### 3.3 에러 응답

본 PRD 범위에서 `/metrics`는 일반적으로 실패하지 않는다. 다만:

- **500 Internal Server Error** — prom-client 직렬화 실패 등(이론적). 응답 본문은
  공통 에러 형식(1~2단계 PRD `05` §4.4 ERR_INTERNAL).
- **503 Service Unavailable** — Q-OBS-2가 (b) "503으로 거부"로 결정되면 적용.
  현재 잠정 권장은 **(a) 200 유지**.

### 3.4 응답 크기 / 압축

- 본 PRD는 `gzip` 압축을 강제하지 않는다. Fastify의 표준 `Accept-Encoding`
  협상 동작을 수용. 메트릭이 수십 KB 수준일 것으로 예상하며, 압축 도입은 후속
  결정(Q-OBS-10).

---

## 4. prom-client Registry 구성

### 4.1 기본 전략 — 단일 default registry

prom-client는 라이브러리 import 시점에 default registry(전역 `Registry`)를
자동 생성한다. 본 PRD는 **단일 default registry**를 사용한다(멀티 registry 도입
하지 않음 — 단순성 우선).

- `core/metrics.ts`가 `01` §3.1 메트릭(C1~C11)을 default registry에 등록.
- `demo/metrics.ts`가 `01` §3.2~3.3 메트릭(D1~D3, W1~W4)을 default registry에
  등록.
- `demo/api/metrics.ts`(라우트)가 default registry의 `metrics()`를 호출해 응답.

### 4.2 wiring 형태 (`core` 비도메인 보존)

`core/metrics.ts`는 다음을 제공한다(시그니처는 PRD 수준 — 구현은 PLAN):

- 메트릭 객체 export (C1~C11 각각)
- `getMetricsRegistry(): Registry` — default registry 핸들을 반환하는 함수
  (또는 `prom-client`를 그대로 재export). `demo`가 이 핸들로 `metrics()`를 호출.
- `collectDefaultMetrics()` 토글 헬퍼 (PLAN 단계에서 호출 시점 결정 — 일반적으로
  부트스트랩에서 1회).

`demo`는 다음을 한다:

- import `core/metrics`. 자기 도메인 메트릭(D1~D3, W1~W4)을 추가 등록.
- Fastify 라우트 `GET /metrics` 핸들러에서 `register.metrics()`를 await하고
  Content-Type 헤더와 함께 응답.

> **금지 사항:** `core/metrics.ts`가 Fastify/도메인 객체를 import하지 않는다.
> 메트릭 갱신 hook(예: C1 `queue_depth`의 collect)은 `core`가 BullMQ `Queue`
> 인스턴스만 받아 작동하도록 한다(도메인 식별자 미사용).

### 4.3 메트릭 갱신 시점 (호출 지점)

| 메트릭 | 갱신 시점 | 호출자 |
|--------|-----------|--------|
| C1 `queue_depth` | scrape 시점 (`collect()` hook) | `core` collector + BullMQ `getJobCounts()` |
| C2 `jobs_processed_total` | Worker `'completed'`/`'failed'` 이벤트 | `core` worker 이벤트 핸들러 |
| C3 `job_attempts_total` | 핸들러 호출 종료 (try/catch finally) | `core` worker가 wrapper로 감쌈 |
| C4 `worker_processing_duration_seconds` | 핸들러 호출 시작 → 종료 (`startTimer()`) | `core` worker wrapper |
| C5 `dlq_jobs_total` | DLQ.add 직전 | `core` worker의 DLQ 적재 경로 |
| C6 `worker_active_jobs` | 진입 +1 / 종단 -1 | `core` worker |
| C7 `redis_reconnects_total` | ioredis `reconnecting` 이벤트 | `core/queue.ts` |
| C8 `redis_up` | ioredis `connect`/`end`/`error` 이벤트 | `core/queue.ts` |
| C9 `shutdown_state` | 셧다운 시퀀스 전이 (`core/shutdown.ts`) | `core/shutdown.ts` |
| C10 `shutdown_remaining_jobs` | 셧다운 타임아웃 직전 | `core/shutdown.ts` |
| C11 `build_info` | 부트스트랩 시 1회 | `demo` 부트스트랩 |
| D1 `api_requests_total` | Fastify `onResponse` hook | `demo` Fastify plugin |
| D2 `api_request_duration_seconds` | Fastify `onRequest`→`onResponse` | `demo` Fastify plugin |
| D3 `api_request_body_bytes` | Fastify `preHandler` | `demo` Fastify plugin |
| W1 `deliveries_total` | `deliver()` 종단 (try/catch) | `demo/handlers/deliver.ts` wrapper |
| W2 `delivery_duration_seconds` | `deliver()` 시작→종단 | `demo/handlers/deliver.ts` wrapper |
| W3 `delivery_attempts_per_job` | Worker `'completed'`/`'failed'` 이벤트의 `attemptsMade` | `demo` worker 이벤트 핸들러 |
| W4 `receiver_received_total` | `POST /_demo/receiver` 핸들러 | `demo/api/receiver.ts` |

> 모든 메트릭 갱신 호출은 **비차단** + **동기**. await 금지(hot path).

---

## 5. 인증 정책 (Q-OBS-1 잠정 결정)

### 5.1 옵션

- **(a) 인증 없음** — 내부망/Prometheus가 같은 네트워크에서 scrape하는 표준
  관행. 본 PRD 잠정 권장.
- **(b) 별도 토큰** — `METRICS_BEARER_TOKEN` 환경변수로 별도 시크릿(`Q-SEC-3`
  ≥ 32 bytes 동일).
- **(c) 동일 Bearer** — `API_BEARER_TOKEN` 재사용. Prometheus scrape 설정 복잡.

### 5.2 잠정 결정 (Q-OBS-1)

**(a) 인증 없음**, 단:

- README "운영 노트"에 "외부 노출 시 (b)로 격상 권장" 명시.
- `docs/architecture.md` §5 "보장하지 않는다" 절에 "/metrics 인증 — 본 PRD
  범위에서는 내부망 전제" 명시 권장(`05` §3 PRD 변경 제안).
- 운영 격상 시 별도 토큰(b)이 동일 Bearer(c)보다 안전(권한 분리).

### 5.3 사람 결정 위임

본 결정은 [`05-out-of-scope-and-open-questions.md`](./05-out-of-scope-and-open-questions.md)
§2 **Q-OBS-1**에서 결정 잠금 대기. 임의 결정 금지(CLAUDE.md §7-4).

---

## 6. 셧다운 진행 중 `/metrics` 정책 (Q-OBS-2 잠정 결정)

### 6.1 1~2단계 기준 (재확인)

| 라우트 | 평시 | draining | 출처 |
|--------|------|----------|------|
| `POST /webhooks` | 202 | **503** ERR_SHUTTING_DOWN | PRD `06` §6.2 |
| `GET /healthz` | 200 | **503** | PRD `06` §6.2 (Q-SEC-5 (a)) |
| `GET /dashboard` | 200 | **200 유지** | PRD `06` §6.2 |
| `POST /_demo/receiver` | 200 | **200 유지** | PRD `06` §6.2 |
| `GET /api/queue/stats` | 200 | **200 유지** | PRD `06` §6.2 |

### 6.2 `/metrics`의 잠정 결정

**(a) 200 유지 권장.** 근거:

- 셧다운 진행 상태(C9 `shutdown_state=draining`, C6 `worker_active_jobs`,
  C10 `shutdown_remaining_jobs`)를 외부에서 관측해야 셧다운 SLO를 평가할 수 있다.
- `/healthz`=503으로 LB/오케스트레이터가 트래픽을 제거 → `/metrics`는 운영자
  관측 용도이므로 다른 신호 경로(Prometheus scrape는 별도 IP/포트 정책 가능).
- prom-client는 셧다운과 무관하게 동작한다(라이브러리 내부 상태만).

### 6.3 트레이드오프 / 사람 결정 위임

**(b) 503으로 거부**의 이점:

- "셧다운 중인 인스턴스에 메트릭 의존하지 않는다"는 명확한 신호.
- 단점: 셧다운 진행 자체를 외부에서 관측 불가.

본 결정은 [`05`](./05-out-of-scope-and-open-questions.md) §2 **Q-OBS-2**에서
사람 결정 위임. 잠정 (a). 임의 결정 금지.

### 6.4 종료 후 `/metrics`

`httpServer.close()` 이후에는 Fastify가 응답하지 않는다(연결 거부). 이것은
의도된 동작이며 Prometheus는 `up{job}=0`을 기록한다(표준).

---

## 7. Prometheus scrape 설정

### 7.1 `docker/prometheus.yml` 잠정 형태

본 PRD는 `docker/prometheus.yml`의 정확한 YAML을 잠그지 않는다(PLAN 단계).
다만 다음 항목은 명세한다.

- **global.scrape_interval:** `15s` (권장). 본 PRD 메트릭의 갱신 주기와 SLO
  측정 윈도우(`04` §4)에 적합.
- **global.evaluation_interval:** `15s` (scrape interval과 동일 권장).
- **scrape_configs:**
  - `job_name: "webhook-relay-api"`
    - `static_configs.targets: ["api:3000"]` (docker-compose 네트워크 호스트명)
    - `metrics_path: /metrics`
    - `scrape_timeout: 10s`
  - `job_name: "webhook-relay-worker"`
    - `static_configs.targets: ["worker:3001"]` (worker가 `/metrics`만 노출할
      별도 포트가 필요한 경우 — **Q-OBS-3** 잠정 결정 참조)
- **rule_files:** `["/etc/prometheus/rules/*.yaml"]` (`04` §5의 alerting rule을
  마운트).

### 7.2 워커 프로세스의 `/metrics` 노출 방법 (Q-OBS-3)

**문제:** `SERVICE_MODE=worker` 컨테이너는 Fastify를 띄우지 않는다(1~2단계
architecture §2 표 참조). 따라서 `/metrics`도 노출되지 않는다.

**옵션:**

- **(a) 워커도 최소 HTTP 서버를 띄워 `/metrics`만 노출** — 새 포트 1개 추가
  (예: `WORKER_METRICS_PORT=3001`). Fastify 재사용 가능.
- **(b) Prometheus pushgateway 사용** — push 모델. 새 컴포넌트 추가, 운영 복잡.
- **(c) API 인스턴스만 메트릭 노출** — 워커 메트릭이 누락된다(부적합).

**잠정 권장:** **(a) 워커도 최소 HTTP 서버**. 환경변수 `WORKER_METRICS_PORT`
(기본 3001) 신규 추가. Fastify는 이미 의존성에 있어 추가 비용 없음.

본 결정은 [`05`](./05-out-of-scope-and-open-questions.md) §2 **Q-OBS-3**에서
사람 결정 위임.

### 7.3 scrape interval 권장값 근거

- 15s — 본 PRD SLO 측정 윈도우(`04`)와 정합. 너무 짧으면(5s) 부하 증가, 너무
  길면(60s) 알람 지연.
- 운영자가 변경하려면 `docker/prometheus.yml`에서만 수정. 본 PRD는 이 값을
  scrape 측 책임으로 둔다(애플리케이션은 영향 없음).

---

## 8. `core` vs `demo` 경계 — 본 라우트의 적용

### 8.1 경계 보존

- `GET /metrics` 라우트는 **Fastify 라우트**이므로 `demo/api/`에 위치.
- 라우트 핸들러는 `core/metrics.ts`의 `getMetricsRegistry()`를 호출해 메트릭
  문자열을 얻는다.
- `core/metrics.ts`는 Fastify·`demo`를 import하지 않는다(I4.1 보존).

### 8.2 위반 검출

PLAN 단계의 IT-R1 보강(`01` §6.2)이 다음을 검출:

- `packages/core/src/**` 의 어떤 파일도 `fastify`/`Fastify`/`webhook`/`delivery`
  /`receiver` 식별자를 import 하거나 헬프 텍스트에 포함하지 않는다.
- 단, **`webhook_relay_` 접두**는 prom-client 메트릭의 애플리케이션 식별자로
  IT-R1 grep 예외 처리(`01` §10 I3.3, `05` §3 PRD 변경 제안 C-MET-2 참조).

---

## 9. 비기능 요구사항

| 분류 | 요구 |
|------|------|
| **성능** | `/metrics` 응답 생성 시간 ≤ 100ms (메트릭 수 < 200, 시계열 < 5000 가정). `getJobCounts()`는 BullMQ가 Redis MULTI로 처리 — 표준 비용. |
| **보안** | 인증 정책은 Q-OBS-1. 응답 본문에 시크릿·페이로드 본문·URL이 포함되지 않는다(`01` §10 I3.3 메트릭 라벨 격리). |
| **신뢰성** | Prometheus가 1회 scrape 실패해도 다음 scrape에서 회복(stateless). 본 PRD는 `/metrics`의 retry 책임을 Prometheus 측에 둔다. |
| **결정성** | 동일 시점 scrape는 동일 응답(prom-client 표준). 단, C1 `queue_depth`는 라이브 Redis 조회이므로 미세 차이 가능 — 운영 영향 없음. |
| **호환성** | Prometheus exposition format `version=0.0.4`. |

---

## 10. 수용 기준 (AC)

- **AC4.1** `curl http://localhost:3000/metrics`가 `200`과 표준 Content-Type
  헤더를 응답한다.
- **AC4.2** 응답 본문에 `01` §3 카탈로그의 메트릭 전건이 등장한다(빌드 시점에
  값이 0이라도 메트릭 정의는 노출됨).
- **AC4.3** `core/metrics.ts`가 `demo`/Fastify를 import하지 않는다(IT-R1 보강
  단언).
- **AC4.4** 셧다운 진행 중 `/metrics`가 잠정 `200`을 유지한다(Q-OBS-2 결정에
  따라 갱신 가능).
- **AC4.5** Prometheus 컨테이너가 `docker compose up` 후 본 서비스를 scrape하고
  `up{job="webhook-relay-api"}=1` 및 `up{job="webhook-relay-worker"}=1`이 관측
  된다(Q-OBS-3 결정에 의존).
- **AC4.6** 응답 본문에 시크릿·페이로드 본문·URL 자체가 등장하지 않는다(`01`
  §10 I3.3 보존).

---

## 11. 불변식 (Invariants)

- **I4.1 (Registry 단일성)** 단일 default registry만 사용한다. 멀티 registry로
  분기하지 않는다(단순성, 운영 혼동 방지).
- **I4.2 (`core` 비도메인)** `core/metrics.ts`가 Fastify/도메인 식별자를 import
  하지 않는다(CLAUDE.md §3, 1~2단계 PRD I4.1·I4.2 강화).
- **I4.3 (인증 결정 보류)** `Q-OBS-1` 결정 잠금 전에는 인증 없이 노출되되,
  README의 "운영 노트"에 위험이 명시되어 있다.
- **I4.4 (셧다운 관측 보존)** 셧다운 진행 중 메트릭 노출이 가능해야 운영자가
  draining 진행을 관측할 수 있다(잠정 (a) 200 유지 — Q-OBS-2 결정 보류 시).
- **I4.5 (hot path 무영향)** 메트릭 갱신은 `POST /webhooks` 응답 시간을
  유의하게(>1ms) 증가시키지 않는다(prom-client 표준 성능).

---

## 12. 리스크 / 오픈 퀘스천

- **R4.1** **Q-OBS-1** — `/metrics` 인증 정책 (`05` §2 위임)
- **R4.2** **Q-OBS-2** — 셧다운 중 `/metrics` 응답 정책 (`05` §2 위임)
- **R4.3** **Q-OBS-3** — 워커 프로세스 `/metrics` 노출 방법 (`05` §2 위임)
- **R4.4** **Q-OBS-10** — gzip 응답 압축 도입 여부 (`05` §2 위임)
- **R4.5** `collectDefaultMetrics()` 호출 시점·범위 (API/worker 양쪽? worker만?)
  → PLAN 단계 결정. 본 PRD는 "양쪽 호출"을 잠정 권장.

---

## 13. PRD 변경 제안

본 문서 작성 중 1~2단계 PRD/architecture/README에 보강이 필요하다고 판단한
항목. **본 PRD는 임의로 다른 문서를 수정하지 않는다.** 결정은 사람이 별도 PR로.

전체는 [`05-out-of-scope-and-open-questions.md`](./05-out-of-scope-and-open-questions.md)
§3 통합 표 참조. 본 문서 발견 항목:

- **C-MET-4:** `docs/prd/05-api-and-contracts.md` §4(또는 §6)에 "`GET /metrics`
  엔드포인트" 명세 추가 제안. 본 PRD `02`가 그 명세를 정의하므로 단순히 cross-link
  로 충분.
- **C-MET-5:** `docs/prd/06-security-and-ops.md` §6.2 표에 `/metrics` 행을 추가
  하는 갱신 제안 (Q-OBS-2 결정 잠금 후 반영).
- **C-MET-6:** `docs/architecture.md` §2 컴포넌트 표에 "Metrics Endpoint" 행 추가
  제안 (위치: `packages/demo/src/api/metrics.ts`).
- **C-MET-7:** `.env.example`에 `WORKER_METRICS_PORT`, (조건부) `METRICS_BEARER_TOKEN`
  추가 제안 (Q-OBS-1·Q-OBS-3 결정 잠금 후).
- **C-MET-8:** `docker-compose.yml`의 worker 서비스에 `/metrics`용 포트 추가
  (Q-OBS-3이 (a)로 잠겼을 때만).
