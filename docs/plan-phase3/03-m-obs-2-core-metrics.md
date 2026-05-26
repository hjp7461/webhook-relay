# 03. M-OBS-2 — Core Metrics Wiring

> **PLAN 진입 조건:** M-OBS-1 완료(prom-client 도입 + `core/metrics.ts` 진화 +
> IT-R1 보강 + `/metrics` 라우트 골격). 본 마일스톤에 의존하는 Q-OBS-6, Q-OBS-9
> 모두 Resolved (2026-05-27).
>
> **AI 협업 5원칙 적용:** 본 마일스톤은 PRD `prd-phase3/01` §3.1 의 메트릭
> 카탈로그 C1~C11을 **글자 단위로** 코드에 옮긴다 (원칙 1: 설계는 사람이 먼저).
> 메트릭 이름·라벨·헬프 텍스트를 임의로 변경하지 않는다.

## 1. 목표 한 줄

PRD `prd-phase3/01` §3.1 의 도메인 무관 메트릭 C1~C11 (Counter/Gauge/Histogram)
을 `core/` 모듈의 적합한 위치에 정의·instrumented하고, `/metrics` 응답에 카탈로그
전건이 등장하도록 한다. 핸들러/워커 hot path에 부수 효과 없음(prom-client 표준
비차단 호출만).

## 2. 선행 의존

- **마일스톤:** M-OBS-1.
- **결정 필요 항목:**
  - **Q-OBS-6** (a) histogram bucket으로 `attempt` 분해 — C3 라벨에 `attempt`
    추가하지 않음.
  - **Q-OBS-9** (b) 잠정 잠금 + 4단계 실측 후 재조정 — `prd-phase3/01` §3 표의
    버킷을 그대로 채택.
- **1~2단계 결정 정합:** Q-ARCH-3 (a) 약속 이행 (메트릭 정의 진입), Q-ARCH-4 (a)
  `<TData>` 1개 제네릭 유지 (`core` 메트릭은 도메인 무관 시그니처).

## 3. 테스트 우선 시퀀스 (실패 → 통과)

본 마일스톤의 1단계는 **실패하는 IT-OBS-1~3 작성**이다.

### IT-OBS-1 — `/metrics` 응답 형식 & Content-Type

`packages/demo/test/it-obs-1-metrics-response.integration.test.ts`:

- Fastify api 모드 부트스트랩 + Testcontainers Redis.
- `GET /metrics`:
  - 상태 `200`.
  - 헤더 `content-type` 가 정확히 `text/plain; version=0.0.4; charset=utf-8`
    포함.
  - 응답 본문이 prom-client exposition format을 따르는지 정규식 단언 (예: 매
    `# HELP ...` 라인 뒤에 `# TYPE ...` 라인 + 메트릭 샘플).

> M-OBS-1에서 이미 골격 단언은 했으나, IT-OBS-1은 **C 카탈로그 등장 전 단언**
> 이다 — 본 단계에서 그린 유지가 요구됨.

### IT-OBS-2 — Core 메트릭 카탈로그 전건 노출

`packages/demo/test/it-obs-2-core-catalog.integration.test.ts`:

- Fastify api 모드 + worker 1 인스턴스 부트스트랩 + Testcontainers Redis.
- 1회 happy-path 작업 등록·처리 (helper 재사용 — IT-S1 fixture와 동일).
- `GET /metrics` 응답 본문에 다음 메트릭 이름이 모두 등장하는지 단언 (substring
  검색):
  - `webhook_relay_queue_depth` (C1)
  - `webhook_relay_jobs_processed_total` (C2)
  - `webhook_relay_job_attempts_total` (C3)
  - `webhook_relay_worker_processing_duration_seconds` (C4 — `_bucket`, `_sum`,
    `_count` 모두 등장 단언)
  - `webhook_relay_dlq_jobs_total` (C5)
  - `webhook_relay_worker_active_jobs` (C6)
  - `webhook_relay_redis_reconnects_total` (C7)
  - `webhook_relay_redis_up` (C8)
  - `webhook_relay_shutdown_state` (C9 — `state` 라벨 enum 3개 모두 등장)
  - `webhook_relay_shutdown_remaining_jobs` (C10)
  - `webhook_relay_build_info` (C11 — 값 1)
- **본 단계에서는 메트릭 값의 정확한 단언은 IT-OBS-6 (M-OBS-3) 책임.** IT-OBS-2
  는 "메트릭이 노출되고 있다"만 확인.

### IT-OBS-3 — Core 도메인 격리 (IT-R1 보강 확인)

`packages/core/test/it-obs-3-core-domain-isolation.integration.test.ts`:

- `packages/core/src/**/*.ts` 의 모든 파일 텍스트를 다시 스캔.
- 각 파일에서 prom-client 메트릭 이름 도입을 검출 (예: `new Counter({ name: "..." })`).
- 검출된 이름이 모두 정규식 `^webhook_relay_(queue|jobs|job|worker|dlq|redis|shutdown|build)_*`
  에 매치되는지 단언 (PRD `prd-phase3/01` §6.2 정합).
- 또한 같은 파일의 헬프 텍스트(`help: "..."`)에 도메인 식별자(`webhook`(단어
  단위), `delivery`, `fastify`, `receiver`, `_demo`)가 등장하지 않는지 단언
  (IT-R1 보강이 이미 통과 보장하지만, 본 IT-OBS-3은 `help:` 필드를 추가로
  검사).

### UT — 메트릭 모듈 단위 테스트

`packages/core/test/metrics-c-catalog.unit.test.ts`:

- `core/metrics.ts` 에서 export하는 메트릭 객체가 `prom-client` 의 정확한 타입
  (`Counter`, `Gauge`, `Histogram`)을 갖는지 단언.
- 라벨 이름이 PRD `prd-phase3/01` §3.1 표와 정확히 일치 (C3 라벨이 `["queue",
  "outcome"]` 등).
- 히스토그램 버킷이 PRD 잠금 값과 일치 (C4: `[0.01, 0.05, 0.1, 0.25, 0.5, 1,
  2.5, 5, 10, 30]`).

## 4. 구현 단계 (커밋 단위)

1. **`test(obs): add failing IT-OBS-1, IT-OBS-2, IT-OBS-3 + UT for core metrics`**
   - §3의 4건 테스트 모두 작성. 이 시점에는 IT-OBS-2가 빨강(메트릭 미도입), UT도
     빨강(메트릭 미export). 테스트 우선 원칙 준수.

2. **`feat(core/metrics): define C1-C11 catalog (queue depth, jobs, dlq, etc.)`**
   - `packages/core/src/metrics.ts` 에 PRD `prd-phase3/01` §3.1 표의 C1~C11을
     `Counter`/`Gauge`/`Histogram` 객체로 정의. `name`/`help`/`labelNames`/
     `buckets`는 **PRD 표와 글자 단위 일치**.
   - 모든 객체는 default registry에 등록 (prom-client `new Counter(...)` 기본 동작).
   - `core/constants.ts` (없으면 신규 생성, 단 비-도메인) 에 메트릭 이름/라벨
     상수를 단일 출처로 둔다 (매직 스트링 금지 — CLAUDE.md §4).
   - **검수:** 모든 식별자가 IT-R1 보강 룰에 통과하는지(`webhook_relay_` 접두만
     예외) 본 커밋 전 로컬 확인.

3. **`feat(core/queue): wire C1 (queue_depth) + C7/C8 (redis health) collectors`**
   - C1 — `queue.getJobCounts()` 호출을 prom-client `Gauge` 의 `collect()` hook
     으로 등록. scrape 시점에만 호출. `core/queue.ts` 에서 큐 인스턴스를 등록
     함수에 주입.
   - C7 — ioredis `reconnecting` 이벤트 리스너에서 `inc()`.
   - C8 — ioredis `connect`/`ready` → 1, `end`/`error` → 0 갱신.
   - **hot path 무영향:** `getJobCounts()`는 scrape 시점에만 호출(prom-client
     `collect()` 콜백 안에서).

4. **`feat(core/worker): wire C2/C3/C4/C6 from worker events`**
   - C2 — Worker `'completed'`/`'failed'` 이벤트에서 `inc({queue, job_state})`.
   - C3 — 핸들러 wrapper의 try/catch/finally에서 outcome 라벨로 `inc({queue,
     outcome})`. outcome 분류는 `core/errors.ts` 의 `RetriableError`/`NonRetriableError`
     인스턴스 검사로(도메인 무관).
   - C4 — `startTimer({queue, outcome})` → 핸들러 종료 시 `endTimer()`.
   - C6 — 핸들러 진입 시 `inc()`, 종단 시 `dec()`.
   - **부수 효과 0건 검증:** 동기·비차단. 메트릭 갱신이 핸들러의 `await deliver()`
     앞·뒤에서 동기적으로 동작 → 1~2단계 `IT-S3` (fake timer)/`IT-S2` 멱등성
     단언에 영향 없음.

5. **`feat(core/worker): wire C5 (dlq_jobs_total) on DLQ.add path`**
   - DLQ 적재 직전 (`core/worker.ts` 또는 별도 DLQ 모듈) `inc({reason})` —
     `reason` 분류는 도메인 무관 enum (`max_attempts_exceeded`/`non_retriable`/
     `stalled_loss_recovered`).

6. **`feat(core/shutdown): wire C9 (shutdown_state) + C10 (remaining_jobs)`**
   - C9 — `core/shutdown.ts` 의 셧다운 시퀀스 단계별 전이에서 enum gauge 갱신
     (한 state만 1, 나머지 0 — prom-client `set` 호출 3회 또는 헬퍼).
   - C10 — 셧다운 타임아웃 도달 직전 set. 정상 종료 시 0.

7. **`feat(demo/bootstrap): wire C11 (build_info) at boot`**
   - `demo/src/server.ts` 부트스트랩에서 `webhook_relay_build_info{version, commit,
     node_version}` 을 set(1).
   - `version`/`commit` 은 환경변수 또는 `package.json` 에서. 빌드 메타 패턴.
   - **본 메트릭은 `core` 가 아닌 `demo` 에서 set** — 그러나 메트릭 정의 자체는
     `core/metrics.ts` (도메인 무관). `demo` 가 정의된 객체의 라벨 값만 주입.

8. **`refactor(demo/api/metrics): ensure /metrics returns full catalog`**
   - M-OBS-1 단계 5의 라우트 핸들러는 변경 없음 — registry가 새로 등록된 메트릭을
     자동 노출. 단, IT-OBS-2 그린 확인 후 작은 정리만.

> **단계 8 이후 회귀 점검:** IT-OBS-1/2/3 + UT 그린. 1~2단계 IT(IT-S1~S7,
> IT-S1b, IT-S2b, IT-S6b, IT-R1 보강 적용, UT-1~6) 전건 그린.

## 5. 생성/수정할 파일 목록 (절대경로)

### 생성

- `/Users/connor/biz/webhook-relay/packages/core/src/constants.ts` (없으면) —
  메트릭 이름/라벨 상수 단일 출처. **본 파일은 도메인 무관** 식별자만.
- `/Users/connor/biz/webhook-relay/packages/core/test/metrics-c-catalog.unit.test.ts`
- `/Users/connor/biz/webhook-relay/packages/demo/test/it-obs-1-metrics-response.integration.test.ts`
- `/Users/connor/biz/webhook-relay/packages/demo/test/it-obs-2-core-catalog.integration.test.ts`
- `/Users/connor/biz/webhook-relay/packages/core/test/it-obs-3-core-domain-isolation.integration.test.ts`

### 수정

- `/Users/connor/biz/webhook-relay/packages/core/src/metrics.ts` (C1~C11 정의 +
  registry 등록)
- `/Users/connor/biz/webhook-relay/packages/core/src/queue.ts` (C1 collect hook,
  C7/C8 이벤트 리스너)
- `/Users/connor/biz/webhook-relay/packages/core/src/worker.ts` (C2/C3/C4/C5/C6
  wiring)
- `/Users/connor/biz/webhook-relay/packages/core/src/shutdown.ts` (C9/C10 wiring)
- `/Users/connor/biz/webhook-relay/packages/demo/src/server.ts` (C11 set at boot)

### 절대 만들지/수정하지 않는 것

- 어떤 도메인 식별자도 `core/` 에 추가하지 않는다 (IT-R1/IT-OBS-3 가드).
- D1~D3, W1~W4 메트릭은 M-OBS-3 책임.
- Grafana/Prometheus 컨테이너는 M-OBS-4.
- PRD/architecture/CLAUDE.md/README 본문 손대지 않음.

## 6. 수용 기준 / Done 정의

- [ ] IT-OBS-1, IT-OBS-2, IT-OBS-3 그린.
- [ ] `metrics-c-catalog.unit.test.ts` 그린.
- [ ] `/metrics` 응답에 C1~C11 메트릭 이름 전건 등장 (값이 0이라도 정의는 노출).
- [ ] `IT-R1-domain-boundary` 그린 (core에 도메인 식별자 0건, `webhook_relay_`
  접두만 예외).
- [ ] PRD `prd-phase3/01` §3.1 의 메트릭 이름/라벨/버킷이 코드와 글자 단위 일치
  (`AC3.1`).
- [ ] 1~2단계 IT(IT-S1~S7, IT-S1b, IT-S2b, IT-S6b) + UT-1~6 모두 그린 — **부수
  효과 0건 회귀 보호**.
- [ ] 핸들러/워커 hot path에 await 추가 없음 (`prom-client` 메트릭 갱신은 모두
  동기·비차단).
- [ ] `pnpm typecheck` 0 에러.

## 7. PRD 역참조

- `prd-phase3/01-metrics-and-labels.md` §3.1 (C1~C11 카탈로그), §3.4 (default
  metrics), §6.1 (core 책임), §6.3 (Q-ARCH-3 진화), §9 (AC3.1~3.6), §10 (I3.1~3.5).
- `prd-phase3/02-metrics-endpoint.md` §4.3 (메트릭 갱신 시점 표).

## 8. 결정 의존

- **Q-OBS-6** (a) histogram bucket으로 `attempt` 분해 — C3에 `attempt` 라벨
  없음.
- **Q-OBS-9** (b) 히스토그램 버킷 잠정 잠금 — C4 버킷 PRD 표 그대로.
- **1~2단계:** Q-ARCH-3 (a) 약속 이행, Q-RETRY-1/2/3 (a) 결정성 우선 (메트릭
  부수 효과로 결정성 위반 금지).

## 9. 회귀 점검

- IT-S1 (해피패스), IT-S1b — 그린 유지 + IT-OBS-6에서 메트릭 갱신 확인 예정
  (본 마일스톤 단계에서는 IT-OBS-2 substring 등장만 확인).
- IT-S2 (멱등성), IT-S2b — 메트릭 갱신이 idempotency 검증을 깨지 않음.
- IT-S3 (재시도+백오프) — fake timer 단언이 메트릭 부수 효과에 영향받지 않음
  (메트릭은 동기 + 시간 의존 없음).
- IT-S4 (max attempts → DLQ) — C5 increment 확인 (IT-OBS-6 책임).
- IT-S5 (4xx 즉시 DLQ) — C5 `non_retriable` 카운트 (IT-OBS-6 책임).
- IT-S6 (stalled), IT-S6b (stalled-loss recovery) — C5 `stalled_loss_recovered`
  enum 동작.
- IT-S7 (그레이스풀 셧다운) — C9/C10 전이 확인 (IT-OBS-6 책임). 본 마일스톤은
  메트릭이 존재만 함을 단언.
- IT-R1 — 보강 룰 통과 + `webhook_relay_*` 접두는 예외.
- UT-1~6 — 변경 없음.

## 10. C-MET 적용 시점

본 마일스톤에서 **본 PLAN 내 직접 적용**:

| C-MET ID | 항목 | 적용 방식 |
|----------|------|-----------|
| (없음) | — | 본 마일스톤은 코드 wiring만. C-MET 갱신 대상 문서(PRD/architecture/README/CLAUDE.md)는 모두 별도 PR. |

본 마일스톤에서 **별도 PR로 위임**:

| C-MET ID | 항목 | 위임 이유 |
|----------|------|-----------|
| C-MET-1 | `prd/04` §7 표 갱신 | 본 마일스톤이 그 약속을 이행하면서 발생. PRD 갱신은 별도 PR. |
| C-MET-6 | `architecture.md` §2 컴포넌트 표에 "Metrics Endpoint" 행 | M-OBS-1에서 라우트 등장. 별도 PR. |

## 11. 본 마일스톤 후 데모 상태

- `docker compose up` 후 `curl POST /webhooks` 처리 후 `curl GET /metrics` 가
  C1~C11 메트릭(라벨 enum 정상 등장)을 모두 노출.
- 도메인 메트릭(D1~D3, W1~W4)은 아직 없음 — M-OBS-3에서 등장.
- Grafana/Prometheus 컨테이너는 아직 없음 — M-OBS-4에서 등장. 본 마일스톤
  종료 시점에 메트릭은 노출되어 있지만 **scrape하는 주체는 없음**(curl로 수동
  확인).
