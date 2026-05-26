# 04. M-OBS-3 — Demo Metrics Wiring

> **PLAN 진입 조건:** M-OBS-2 완료(C1~C11 노출). Q-OBS-5, Q-OBS-8, Q-OBS-9 Resolved
> (2026-05-27).
>
> **AI 협업 5원칙 적용:** 본 마일스톤은 PRD `prd-phase3/01` §3.2/§3.3 의 D1~D3,
> W1~W4 카탈로그를 코드로 옮기고, PRD §5 의 "IT 시나리오 ↔ 메트릭 매트릭스"를
> **IT-OBS-6 으로 단언**한다 (원칙 2: 테스트 우선).

## 1. 목표 한 줄

PRD `prd-phase3/01` §3.2 의 HTTP API 메트릭(D1~D3) 과 §3.3 의 웹훅 도메인 메트릭
(W1~W4) 을 `demo/` 의 적합한 위치에 정의·instrumented하고, 1~2단계 7개 IT 시나리오
실행 시 PRD §5 매트릭스가 단언하는 메트릭 변화를 IT-OBS-6 로 검증한다. 라벨
enum 은 `demo/constants.ts`에 단일 출처로 잠금.

## 2. 선행 의존

- **마일스톤:** M-OBS-2.
- **결정 필요 항목:**
  - **Q-OBS-5** (a) `status_class` enum — D1/D2/W1 의 status 라벨은 `2xx`/`3xx`/`4xx`/`5xx`/`none`
    만 사용. raw code 사용 금지.
  - **Q-OBS-8** (a) 정적 path만 — D1/D2 의 `route` 라벨은 명세된 7개 경로
    enum만.
  - **Q-OBS-9** (b) 히스토그램 버킷 잠정 잠금 — D2/D3/W2/W3 버킷 PRD 표 그대로.
- **1~2단계 결정 정합:** Q-API-3 outgoing 헤더 블랙리스트 (메트릭이 그것을
  관찰하지는 않음 — 라벨로 노출 금지). Q-SEC-1 SSRF (W1 `result="ssrf_blocked"`
  enum 정합). Q-RETRY-1 3xx = NonRetriableError (W1 `error_class` enum 정합).

## 3. 테스트 우선 시퀀스 (실패 → 통과)

### IT-OBS-4 — Demo API 메트릭 카탈로그 전건 노출

`packages/demo/test/it-obs-4-demo-api-catalog.integration.test.ts`:

- api 모드 부트스트랩 + 1회 `POST /webhooks` 호출.
- `GET /metrics` 응답 본문에 다음이 모두 등장:
  - `webhook_relay_api_requests_total` (D1, 라벨 `route="/webhooks"`, `method="POST"`,
    `status_class="2xx"` 행 존재)
  - `webhook_relay_api_request_duration_seconds_bucket` (D2)
  - `webhook_relay_api_request_body_bytes_bucket` (D3)
- D1 의 `route` 라벨이 enum 7종 (`/webhooks`, `/_demo/receiver`, `/dashboard`,
  `/api/queue/stats`, `/healthz`, `/metrics`, `/dashboard/...` 등 PRD `01` §3.2
  D1 정합) 만 등장하는지 단언.

### IT-OBS-5 — Demo 웹훅 도메인 메트릭 카탈로그 전건 노출

`packages/demo/test/it-obs-5-demo-webhook-catalog.integration.test.ts`:

- api + worker 모드 부트스트랩 + Testcontainers Redis.
- 1회 happy-path 실행 (IT-S1 fixture 재사용).
- `GET /metrics` 응답 본문에 다음 모두 등장:
  - `webhook_relay_deliveries_total` (W1)
  - `webhook_relay_delivery_duration_seconds_bucket` (W2)
  - `webhook_relay_delivery_attempts_per_job_bucket` (W3)
  - `webhook_relay_receiver_received_total` (W4)
- W1 의 `result` enum 5종(`success`/`http_error`/`network_error`/`timeout`/`ssrf_blocked`)
  중 본 시나리오에서 등장 가능한 값만 등장하는지 (`success`).
- W1 의 `error_class` enum 3종 (`none`/`RetriableError`/`NonRetriableError`)
  단언.

### IT-OBS-6 — IT 시나리오 ↔ 메트릭 매트릭스 단언 (핵심)

PRD `prd-phase3/01` §5 표의 행을 **IT 시나리오별로 별도 통합 테스트**로 옮긴다.
각 시나리오는 1~2단계 IT-S* fixture/helper를 재사용한다.

`packages/demo/test/it-obs-6-scenario-matrix.integration.test.ts` (또는 시나리오별
분리 파일):

| 하위 케이스 | 시나리오 | 단언 |
|--------------|----------|-------|
| IT-OBS-6.S1 | IT-S1 (해피패스) | D1 `route="/webhooks",status_class="2xx"` +1, C2 `job_state="completed"` +1, W1 `result="success",http_status_class="2xx",error_class="none"` +1, W2 sample +1, W3 `outcome="completed"` 1-attempt bucket +1, W4 +1 |
| IT-OBS-6.S2 | IT-S2 (멱등성, N=3) | D1 `/webhooks,2xx` +3, C3 `outcome="success"` +1, W1 `result="success"` +1, W4 +1 |
| IT-OBS-6.S3 | IT-S3 (재시도+백오프, K=2 5xx 후 200) | C3 `outcome="retriable_error"` +2, C3 `outcome="success"` +1, W1 `result="http_error",http_status_class="5xx"` +2, W1 `result="success"` +1, W3 `outcome="completed"` 3-attempts bucket +1 |
| IT-OBS-6.S4 | IT-S4 (max attempts → DLQ, MAX=5) | C3 `outcome="retriable_error"` +5, C2 `job_state="failed"` +1, C5 `reason="max_attempts_exceeded"` +1, W3 `outcome="dlq_max_attempts"` +1 |
| IT-OBS-6.S5 | IT-S5 (4xx 즉시 DLQ) | C3 `outcome="non_retriable_error"` +1, C2 `job_state="failed"` +1, C5 `reason="non_retriable"` +1, W1 `error_class="NonRetriableError"` +1, W3 `outcome="dlq_non_retriable"` 1-attempt bucket +1 |
| IT-OBS-6.S6 | IT-S6 (stalled 회수) | C2 `job_state="completed"` +1, W3 `outcome="completed"` attempts ≥ 2 bucket +1 |
| IT-OBS-6.S6b | IT-S6b (stalled-loss recovery) | C5 `reason="stalled_loss_recovered"` +1, W3 `outcome="dlq_stalled_loss"` +1 |
| IT-OBS-6.S7 | IT-S7 (그레이스풀 셧다운) | C9 `state=running→draining→terminated` 전이, C6 감소, D1 `route="/webhooks",status_class="5xx"` 증가(503 응답), D1 `route="/healthz",status_class="5xx"` 증가, C10 (정상 종료 시 0) |

각 하위 케이스는:
1. 시나리오 실행 전 `/metrics` 스크레이프 → baseline.
2. 시나리오 실행 (1~2단계 helper).
3. 시나리오 실행 후 `/metrics` 스크레이프 → delta 계산.
4. PRD `prd-phase3/01` §5 표의 delta 단언.

**구현 노트:**
- 메트릭 파싱은 간단한 텍스트 파서 (prom-client 텍스트 → `Map<string, number>`).
  새 의존성 도입 금지 — 직접 줄 단위 파싱.
- 시나리오 격리 — 각 하위 케이스는 별도 Redis prefix + 별도 Fastify 인스턴스
  (필요시 별도 default registry 클리어를 위해 `prom-client` `register.clear()`
  를 setup에서 호출 — 단, 1~2단계 IT 회귀 우려가 있으므로 본 IT-OBS-6 전용
  fixture에서만 사용).

### UT — Demo 메트릭 정의 단위 테스트

`packages/demo/test/metrics-d-w-catalog.unit.test.ts`:

- D1~D3, W1~W4 메트릭 객체의 이름/라벨/버킷이 PRD 표와 정확히 일치.
- 라벨 enum 이 `demo/constants.ts` 의 상수 객체와 정합.

## 4. 구현 단계 (커밋 단위)

1. **`test(obs): add failing IT-OBS-4, IT-OBS-5, IT-OBS-6.*, UT for demo metrics`**
   - §3의 모든 테스트 작성. 빨강 상태 확인.

2. **`feat(demo/constants): lock label enums for D1-D3 + W1-W4`**
   - `demo/src/constants.ts` 에 라벨 enum 상수 추가:
     - `STATUS_CLASS_2XX = "2xx"`, ... `STATUS_CLASS_NONE = "none"`.
     - `ROUTE_ENUM`: 7개 라우트 경로 상수.
     - `DELIVERY_RESULT_*`: `success`, `http_error`, `network_error`, `timeout`,
       `ssrf_blocked`.
     - `ERROR_CLASS_*`: `none`, `RetriableError`, `NonRetriableError`.
   - 매직 스트링 금지 — 모든 라벨 값은 본 상수 모듈에서 import.

3. **`feat(demo/metrics): define D1-D3 + W1-W4 catalog`**
   - `packages/demo/src/metrics.ts` 신규 생성. 도메인 무관 `core/metrics.ts`
     와 별도. default registry에 등록.
   - **금지:** `core/metrics.ts` 에 D/W 메트릭을 추가하지 않는다 (CLAUDE.md §3,
     IT-R1).

4. **`feat(demo/api): wire D1/D2 via Fastify hooks (onRequest, onResponse)`**
   - Fastify plugin 형태로 onRequest→onResponse 측정.
   - `route` 라벨은 Fastify `request.routeOptions.url`(또는 등가)을 그대로 사용
     하되, `demo/constants.ts` 의 `ROUTE_ENUM` 에 없으면 라벨로 등록하지 않음
     (카디널리티 보호 — Q-OBS-8 (a)).

5. **`feat(demo/api): wire D3 (request body bytes) via preHandler hook`**
   - 본 hook 은 `POST /webhooks` 와 `POST /_demo/receiver` 등 body 가 있는
     라우트에만 동작. 다른 라우트에서는 skip.

6. **`feat(demo/handlers): wire W1/W2 in deliver() wrapper`**
   - `demo/handlers/deliver.ts` 또는 `demo/handlers/webhook-delivery.ts` 의
     `fetch()` 호출 시작 → 종료 시점에 W2 `startTimer()`/`endTimer()`.
   - 결과 분류 후 W1 `inc({result, http_status_class, error_class})`.
   - **부수 효과 0건 검증:** `fetch()` 의 await 흐름에 메트릭이 끼어들지 않음
     (try/finally 패턴).

7. **`feat(demo/handlers): wire W3 (attempts per job) on completed/failed events`**
   - Worker `'completed'` / `'failed'` 이벤트에서 `job.attemptsMade` 값을 W3
     histogram `observe()`. outcome 라벨 4종 매핑.

8. **`feat(demo/receiver): wire W4 on POST /_demo/receiver`**
   - `demo/api/receiver.ts` 또는 `demo/receiver/store.ts` 진입점에서 `inc()`.

9. **`refactor(demo/handlers): map deliver() error → W1 labels (result, error_class)`**
   - SSRF 차단 → `result="ssrf_blocked"`. timeout(AbortController) → `result="timeout"`.
     fetch 네트워크 에러 → `result="network_error"`. http 응답 4xx/3xx →
     `result="http_error", error_class="NonRetriableError"`. http 응답 5xx →
     `result="http_error", error_class="RetriableError"`. 성공 →
     `result="success", error_class="none"`.

10. **`docs(.env.example)` 변경 없음** — D/W 메트릭은 환경변수 추가하지 않음.

> **단계 9 이후 회귀 점검:** IT-OBS-4/5/6.* + UT 그린. 1~2단계 IT(IT-S1~S7,
> IT-S1b, IT-S2b, IT-S6b, IT-R1) + UT-1~6 전건 그린.

## 5. 생성/수정할 파일 목록 (절대경로)

### 생성

- `/Users/connor/biz/webhook-relay/packages/demo/src/metrics.ts`
- `/Users/connor/biz/webhook-relay/packages/demo/src/api/metrics-plugin.ts` (또는
  등가 — Fastify plugin)
- `/Users/connor/biz/webhook-relay/packages/demo/test/metrics-d-w-catalog.unit.test.ts`
- `/Users/connor/biz/webhook-relay/packages/demo/test/it-obs-4-demo-api-catalog.integration.test.ts`
- `/Users/connor/biz/webhook-relay/packages/demo/test/it-obs-5-demo-webhook-catalog.integration.test.ts`
- `/Users/connor/biz/webhook-relay/packages/demo/test/it-obs-6-scenario-matrix.integration.test.ts`

### 수정

- `/Users/connor/biz/webhook-relay/packages/demo/src/constants.ts` (라벨 enum
  상수 추가)
- `/Users/connor/biz/webhook-relay/packages/demo/src/server.ts` (api 모드에서
  metrics-plugin 등록)
- `/Users/connor/biz/webhook-relay/packages/demo/src/handlers/deliver.ts` 또는
  `webhook-delivery.ts` (W1/W2 wiring)
- `/Users/connor/biz/webhook-relay/packages/demo/src/api/receiver.ts` (W4
  wiring)
- (다른 핸들러/라우트 파일에서 import 라인 추가)

### 절대 만들지/수정하지 않는 것

- `core/` 디렉터리는 본 마일스톤에서 변경하지 않음 (도메인 격리).
- Grafana/Prometheus 컨테이너는 M-OBS-4.
- PRD/architecture/CLAUDE.md/README 본문 손대지 않음.

## 6. 수용 기준 / Done 정의

- [ ] IT-OBS-4, IT-OBS-5 그린.
- [ ] IT-OBS-6.S1 ~ S7 (S6b 포함) 그린 — PRD `prd-phase3/01` §5 매트릭스 전건
  단언 (`AC3.5`).
- [ ] `metrics-d-w-catalog.unit.test.ts` 그린.
- [ ] `/metrics` 응답에 D1~D3, W1~W4 전건 등장.
- [ ] 라벨 enum 이 `demo/constants.ts` 단일 출처에 잠금 (자유 문자열 라벨 0건,
  `AC3.2`).
- [ ] `IT-R1` 그린 — `core/` 에 도메인 식별자 추가 0건 (본 마일스톤은 `demo/`
  변경만).
- [ ] 1~2단계 IT(IT-S1~S7, IT-S1b, IT-S2b, IT-S6b) + UT-1~6 모두 그린 — **부수
  효과 0건 회귀**.
- [ ] hot path 메트릭 갱신이 동기/비차단 (await 없음). IT-S3 fake timer 단언이
  변경되지 않음.
- [ ] `pnpm typecheck` 0 에러.

## 7. PRD 역참조

- `prd-phase3/01-metrics-and-labels.md` §3.2 (D1~D3), §3.3 (W1~W4), §4.2 (라벨
  enum), §5 (IT 매트릭스), §9 AC3.1~3.6.
- `prd-phase3/02-metrics-endpoint.md` §4.3 (D/W 갱신 시점 표), §8 (`core`/`demo`
  경계 — 본 마일스톤이 `demo` 측만 변경).

## 8. 결정 의존

- **Q-OBS-5** (a) status_class enum — raw code 라벨 금지.
- **Q-OBS-6** (a) attempt histogram bucket — W3 정의.
- **Q-OBS-8** (a) 정적 path만 — D1/D2 route 라벨 enum.
- **Q-OBS-9** (b) 히스토그램 버킷 잠정 잠금.
- **1~2단계:** Q-API-3 (블랙리스트), Q-SEC-1 (SSRF), Q-RETRY-1/2 (분류) 정합.

## 9. 회귀 점검

- IT-S1~S7, IT-S1b, IT-S2b, IT-S6b — 본 마일스톤이 IT-OBS-6 으로 단언하므로
  자동으로 회귀 보호.
- IT-R1 — 본 마일스톤은 `demo/` 만 수정하므로 `core/` 도메인 식별자 0건 유지.
- UT-1~6 — 변경 없음.
- 통합 테스트 격리: 각 IT-OBS-6 하위 케이스는 별도 Redis prefix + 별도 Fastify
  인스턴스 + `prom-client` registry clear (본 fixture 안에서만, 1~2단계 IT 가
  격리된 Redis prefix 를 쓰는 패턴과 동일).

## 10. C-MET 적용 시점

본 마일스톤에서 **본 PLAN 내 직접 적용**:

| C-MET ID | 항목 | 적용 방식 |
|----------|------|-----------|
| (없음) | — | 코드 wiring만. C-MET 갱신 대상 문서는 모두 별도 PR. |

본 마일스톤에서 **별도 PR로 위임**:

| C-MET ID | 항목 | 위임 이유 |
|----------|------|-----------|
| C-MET-9 | `README.md` 빠른 시작에 Prometheus URL 추가 | M-OBS-4에서 컨테이너 추가 후 별도 PR. |
| C-MET-10 | `README.md` 운영 노트에 "Grafana admin 기본값 변경" | M-OBS-4 이후 별도 PR. |
| C-MET-17 | `prd/03-test-strategy.md` 에 IT-OBS-N 시나리오 정의 | 본 마일스톤이 IT-OBS-1~6 도입하나 PRD 갱신은 별도 PR. |

## 11. 본 마일스톤 후 데모 상태

- `docker compose up` 후 `curl POST /webhooks` 처리 후 `curl GET /metrics` 가
  C1~C11 + D1~D3 + W1~W4 전건 노출 (라벨 값 정상 갱신).
- 외부 수신자에 1건 도착 후 W4 = 1.
- 1~2단계 7개 IT 시나리오를 수동 실행해도 `/metrics` 값이 PRD `01` §5 매트릭스대로
  움직임.
- Grafana/Prometheus 컨테이너는 아직 없음 — M-OBS-4 에서 등장.
