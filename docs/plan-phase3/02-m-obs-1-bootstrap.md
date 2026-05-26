# 02. M-OBS-1 — Bootstrap

> **PLAN 진입 조건:** 본 묶음(`docs/plan-phase3/`)이 승인되고, `00-decisions-needed.md`
> §3 매트릭스 M-OBS-1 행의 Q-OBS가 모두 Resolved여야 한다. **15건 전건 2026-05-27
> Resolved이므로 진입 가능.**
>
> **AI 협업 5원칙 적용:** 본 마일스톤은 prom-client 도입(CLAUDE.md §2 사전 잠금
> 이행)과 IT-R1 grep 룰 보강(C-MET-2 사전 이행)을 한다. 새 의존성은 prom-client
> **1건만** 추가하며, 다른 모든 의존성 추가는 거부한다(원칙 3 범위 통제).
>
> **본 마일스톤이 명시적으로 다루지 않는 것:** C1~C11/D1~D3/W1~W4 메트릭 자체의
> 갱신 로직(M-OBS-2/M-OBS-3에서). Grafana(M-OBS-4). alerting rule(M-OBS-5).

## 1. 목표 한 줄

prom-client를 도입하고, `packages/core/src/metrics.ts`를 "빈 export"에서 "Registry
핸들 + 도메인 무관 메트릭 factory"로 진화시키며(Q-ARCH-3 약속 이행), IT-R1
grep 룰을 `webhook_relay_` 접두 예외 처리하도록 보강하고(C-MET-2 사전 이행),
`SERVICE_MODE=worker` 분기에 별도 `/metrics` HTTP 서버 골격을 추가하여 빈
응답(200 + 표준 Content-Type)이 동작하는 상태로 종료한다.

## 2. 선행 의존

- **마일스톤:** 1~2단계 PLAN M1~M7 완료(현재 main 기준 완료된 상태).
- **결정 필요 항목:**
  - **Q-OBS-1** (a) 인증 없음 — `/metrics` 라우트 미들웨어 없이 등록.
  - **Q-OBS-3** (a) 워커 최소 HTTP 서버 — `WORKER_METRICS_PORT` (기본 3001) 도입.
  - **Q-OBS-10** (a) 압축 없음 — Fastify 기본 협상 수용.
  - **Q-OBS-14** (a) IT-R1 grep 예외 — `webhook_relay_` 접두만 예외 처리.
  - **Q-OBS-15** (a) `docs/plan-phase3/` — 본 PLAN 디렉터리 위치 확인.
- **1~2단계 결정 정합:** Q-ARCH-3 (a) "빈 파일/타입 인터페이스만"의 약속 이행
  ("3단계 PRD가 형태를 결정한다"). Q-ARCH-2 (c) IT-R1 통합 테스트의 의도를
  보존하면서 예외 룰만 추가.

## 3. 테스트 우선 시퀀스

본 마일스톤은 "실패하는 IT-OBS-N"을 도입하지 않는다(메트릭 wiring은 M-OBS-2부터).
대신 다음 두 가지를 **회귀 가드로** 도입한다.

1. **(테스트) IT-R1 보강 단언:** 기존 `IT-R1-domain-boundary` 통합 테스트(`packages/core/test/it-r1-domain-boundary.integration.test.ts`)
   의 grep 룰을 **단어 경계 + suffix 예외** 형식으로 갱신한다. 핵심 규칙:
   - `core/src/**/*.ts` 의 파일 텍스트에서 도메인 식별자 `webhook`, `delivery`,
     `http`, `fastify`, `receiver`, `_demo`, `Payload`가 **단어 단위로** 검출
     되면 실패. (예: `\bwebhook\b` 정규식 매칭.)
   - 단, `webhook_relay_` 로 시작하는 식별자(prom-client 메트릭 접두 — 애플리케이션
     식별자)는 **예외**로 처리. 예외 처리는 grep 결과의 라인을 다시 토큰화하여
     `webhook_relay_` 접두를 가진 토큰만 제거 후 잔여 매칭만 카운트.
   - 본 마일스톤에서 `core/metrics.ts`가 `webhook_relay_queue_depth` 등을 도입
     하기 직전에 갱신 → 처음 작성 시점에는 그린(아직 메트릭 이름 미도입). 메트릭
     이름 도입(같은 마일스톤 후속 단계) 후에도 그린.
2. **(테스트) UT (비-Redis):** `core/test/metrics.unit.test.ts` — `core/metrics.ts`
   가 export하는 함수/타입의 기본 동작 단언:
   - `getMetricsRegistry()` 가 prom-client `Registry` 인스턴스를 반환.
   - 동일 호출이 동일 인스턴스를 반환 (단일성 — `prd-phase3/02` §4.1 정합).
   - `collectDefaultMetrics()` 호출 후 registry에 `nodejs_*` 메트릭이 등장.
   - **본 단계에서는 C1~C11 자체는 정의하지 않는다** (M-OBS-2 책임).
3. **(테스트) 통합 — `/metrics` 라우트 골격:** `packages/demo/test/metrics-route.integration.test.ts`
   — Fastify 앱을 띄우고 `GET /metrics`가:
   - 상태 200 반환.
   - `Content-Type: text/plain; version=0.0.4; charset=utf-8` 정확히 포함.
   - 응답 본문이 prom-client 기본 메트릭(`process_*` 또는 `nodejs_*`)을 최소
     1건 포함.
   - 본 단계에서는 C1~C11 노출 단언 없음 (M-OBS-2 책임).
4. **(테스트) 통합 — worker `/metrics`:** `packages/demo/test/worker-metrics-route.integration.test.ts`
   — `SERVICE_MODE=worker`에서 동일하게 별도 포트로 200 + 기본 메트릭 노출.
   포트는 `WORKER_METRICS_PORT` 환경변수로 주입.

> 본 마일스톤의 위 4건은 **회귀 가드**이지 "실패 테스트 → 통과시키는 구현" 사이클은
> 아니다. M-OBS-2부터 본격적인 테스트 우선 시퀀스가 시작된다.

## 4. 구현 단계 (커밋 단위)

각 번호는 한 커밋에 적합한 크기다. Conventional Commits 접두어를 붙인다.

1. **`chore: add prom-client dependency to core package`**
   - `packages/core/package.json` `dependencies`에 `prom-client` (현재 안정 LTS
     버전) 추가. `pnpm install`.
   - 커밋 메시지에 정당성 명시: "CLAUDE.md §2 고정 스택 사전 잠금 이행. 3단계
     관측성 PRD 시작에 필요. `core`만 직접 의존. `demo`는 `core`를 통해 간접
     사용."
   - **금지:** 다른 패키지(예: `bull-board`, `@grafana/*`, `pino-pretty`) 추가.

2. **`refactor(it-r1): allow webhook_relay_ prefix in domain boundary grep`**
   - `packages/core/test/it-r1-domain-boundary.integration.test.ts` 갱신.
   - 새 매칭 알고리즘:
     ```
     for each .ts file in packages/core/src/**:
       for each line:
         tokens = line의 단어 토큰 (정규식 \b[A-Za-z_][A-Za-z0-9_]*\b)
         for each token:
           if token starts with "webhook_relay_": continue  # 예외
           if token (case-insensitive) ∈ BANNED_TOKENS_SET: fail with file/line context
     ```
   - `BANNED_TOKENS_SET = ["webhook", "delivery", "fastify", "receiver",
     "Payload", "_demo"]` (소문자 비교). `http`는 `https` 구분이 필요하므로 단어
     단위로 `http` 정확 일치만 잡고 `https`는 통과시킨다 — 알고리즘이 단어 토큰을
     검사하므로 자연스럽게 분리됨.
   - 처음 작성 시점에 그린 (`core/src/**`에 도메인 식별자 0건, `webhook_relay_*`
     도 아직 0건).
   - **AC:** 다음 가짜 데이터에서 정확히 거동:
     - `webhook_relay_queue_depth` → 통과 (예외).
     - `processWebhook()` → **실패** (`webhook` 단어 검출).
     - `httpStatus` → **실패** (`http` 단어 검출). `httpsAgent` → 통과.
     - `// WebhookDelivery: TODO` → **실패** (`webhook` 부분 일치 — 토큰화
       시 `Webhook`/`Delivery`가 단어로 분리되도록 PascalCase split 적용).

3. **`feat(core/metrics): evolve to prom-client Registry handle`**
   - `packages/core/src/metrics.ts`를 다음으로 갱신 (도메인 식별자 0건 확인 —
     IT-R1 그린 유지):
     ```ts
     import {
       Registry,
       collectDefaultMetrics as promCollectDefaultMetrics,
       register as defaultRegister,
     } from "prom-client";

     /**
      * Returns the single default prom-client Registry used by the app.
      * Phase 3 PRD `prd-phase3/02` §4.1 — single default registry.
      */
     export function getMetricsRegistry(): Registry {
       return defaultRegister;
     }

     /**
      * Enables collection of default Node.js / process metrics on the
      * single default registry. Idempotent — multiple calls are no-ops after
      * the first.
      */
     let defaultMetricsEnabled = false;
     export function enableDefaultMetrics(): void {
       if (defaultMetricsEnabled) return;
       promCollectDefaultMetrics({ register: defaultRegister });
       defaultMetricsEnabled = true;
     }
     ```
   - **본 단계에서는 C1~C11 메트릭을 정의하지 않는다** (M-OBS-2). 단,
     factory의 자리만 마련:
     ```ts
     // Phase 3 PRD `prd-phase3/01` §3.1 — metric definitions land in M-OBS-2.
     // Keep this file domain-agnostic (CLAUDE.md §3, IT-R1).
     ```
   - **금지 식별자:** `webhook`, `delivery`, `http`, `fastify`, `receiver`,
     `Payload`, `_demo`. (IT-R1 보강이 이미 가드 중.)

4. **`test(core/metrics): unit tests for registry + default metrics`**
   - `packages/core/test/metrics.unit.test.ts` 작성. §3 시퀀스 2번의 단언 4건
     수행. fake timer 미사용.

5. **`feat(demo/api): add GET /metrics route (api mode)`**
   - `packages/demo/src/api/metrics.ts` 신규 생성.
   - 의사 코드:
     ```ts
     import type { FastifyInstance } from "fastify";
     import { getMetricsRegistry, enableDefaultMetrics } from "@webhook-relay/core/metrics";

     export async function registerMetricsRoute(app: FastifyInstance): Promise<void> {
       enableDefaultMetrics();
       const registry = getMetricsRegistry();
       app.route({
         method: "GET",
         url: "/metrics",
         handler: async (_req, reply) => {
           const body = await registry.metrics();
           reply.header("content-type", registry.contentType);
           return body;
         },
       });
     }
     ```
   - `demo/src/server.ts` 의 `api`/`all` 모드 부트스트랩에서 `registerMetricsRoute(app)`
     호출.
   - **Q-OBS-1 (a):** 인증 미들웨어 없음. README 운영 노트 갱신은 C-MET-9/10/15와
     함께 별도 PR(본 PLAN 범위 밖).
   - **Q-OBS-2 (a):** 셧다운 진행 중 200 유지 — draining 미들웨어 분기에서
     `/metrics`를 제외 (M-OBS-4 IT-OBS-9에서 단언). 본 단계에서는 라우트 등록만
     하고 draining 분기는 이미 1~2단계가 `/dashboard`·`/_demo/receiver`·`/api/queue/stats`를
     200 유지로 처리하는 것과 동일 패턴 — 즉 별도 추가 코드 불필요.
   - **Q-OBS-10 (a):** Fastify 표준 동작 — gzip 미강제.
   - **금지:** 매직 스트링 — 라우트 경로 `/metrics`는 `demo/constants.ts`에 둔다
     (예: `ROUTE_METRICS = "/metrics"`).

6. **`feat(demo/server): add worker-mode metrics http server (Q-OBS-3 a)`**
   - `demo/src/server.ts` 의 `SERVICE_MODE=worker` 분기를 갱신:
     - 워커 모드에서도 Fastify 최소 인스턴스를 띄움. 등록 라우트는 **`GET
       /metrics` 하나뿐** (`/webhooks`, `/dashboard`, `/healthz` 등은 등록하지
       않음).
     - 포트는 `WORKER_METRICS_PORT` (기본 `3001`)에서 listen.
     - 환경변수 `WORKER_METRICS_PORT`를 `demo/config.ts` Zod 스키마에 추가
       (`z.coerce.number().int().positive().default(3001)`).
   - **`all` 모드:** 기존 그대로 `api` 라우트가 `/metrics`도 제공 (5번 단계 결과).
     별도 worker 포트는 띄우지 않음.
   - 그레이스풀 셧다운: 1~2단계 `core/shutdown.ts` 시퀀스가 이미 `httpServer.close()`
     를 호출하는 시점에 본 워커 메트릭 서버도 함께 close. 시퀀스 변경 없음.

7. **`test(demo): integration tests for /metrics route (api + worker modes)`**
   - `packages/demo/test/metrics-route.integration.test.ts` 작성 — §3 시퀀스
     3번 단언.
   - `packages/demo/test/worker-metrics-route.integration.test.ts` 작성 — §3
     시퀀스 4번 단언.
   - Testcontainers Redis는 부트스트랩에 필요 (BullMQ 큐 초기화). 기존 통합
     테스트 헬퍼 재사용.

8. **`chore(.env.example): document WORKER_METRICS_PORT`**
   - `.env.example` 의 환경변수 키 목록에 `WORKER_METRICS_PORT=3001` 추가.
   - 본 변경은 C-MET-7 의 일부지만 PLAN 진행에 직접 필요하므로 본 PLAN 안에서
     수행 (다른 C-MET-7 항목 `METRICS_BEARER_TOKEN`은 Q-OBS-1 (a) 결정에 따라
     도입하지 않음).
   - **주의:** `CLAUDE.md`, `README.md` 본문 갱신은 본 PLAN에서 하지 않는다.
     `.env.example`은 PRD `05` §8의 환경변수 키 등록처라 일관 갱신 — 본 PLAN
     범위 안으로 허용.

> **단계 8 이후 회귀 점검:** `pnpm install && pnpm typecheck && pnpm test:unit
> && pnpm test:integration`이 그린. 1~2단계 IT(IT-S1~S7, IT-S1b, IT-S2b, IT-S6b,
> IT-R1, UT-1~6) 전건 그린.

## 5. 생성/수정할 파일 목록 (절대경로)

### 생성

- `/Users/connor/biz/webhook-relay/packages/demo/src/api/metrics.ts`
- `/Users/connor/biz/webhook-relay/packages/core/test/metrics.unit.test.ts`
- `/Users/connor/biz/webhook-relay/packages/demo/test/metrics-route.integration.test.ts`
- `/Users/connor/biz/webhook-relay/packages/demo/test/worker-metrics-route.integration.test.ts`

### 수정

- `/Users/connor/biz/webhook-relay/packages/core/package.json` (prom-client 의존성
  추가)
- `/Users/connor/biz/webhook-relay/packages/core/src/metrics.ts` (빈 export →
  Registry 핸들 + factory)
- `/Users/connor/biz/webhook-relay/packages/core/test/it-r1-domain-boundary.integration.test.ts`
  (grep 룰 보강 — `webhook_relay_` 예외)
- `/Users/connor/biz/webhook-relay/packages/demo/src/server.ts` (worker 모드
  Fastify 분기 + `WORKER_METRICS_PORT` listen, api/all 모드에서 `registerMetricsRoute`
  호출)
- `/Users/connor/biz/webhook-relay/packages/demo/src/config.ts` (`WORKER_METRICS_PORT`
  Zod 스키마 추가)
- `/Users/connor/biz/webhook-relay/packages/demo/src/constants.ts` (`ROUTE_METRICS = "/metrics"`
  상수 추가)
- `/Users/connor/biz/webhook-relay/.env.example` (`WORKER_METRICS_PORT=3001`
  키 추가)
- `/Users/connor/biz/webhook-relay/pnpm-lock.yaml` (자동)

### 절대 만들지/수정하지 않는 것 (CLAUDE.md §6 + 본 작업 명세)

- `docs/prd/`, `docs/plan/`, `docs/adr/`, `docs/architecture.md`, `CLAUDE.md`,
  `README.md` — 모두 본 PLAN 범위 밖. C-MET-1~17 갱신은 별도 PR.
- `docs/prd-phase3/00.md`~`04.md` — 손대지 않음 (예외는 본 작업 명세 §6의 `05.md`
  헤더만).
- `packages/streams-internals/**` — 부록 트랙 격리.

## 6. 수용 기준 / Done 정의

- [ ] `pnpm install`이 0 에러 (prom-client 1건 추가 외 변경 없음).
- [ ] `pnpm typecheck` 0 에러.
- [ ] `pnpm test:unit` 그린 (신규 `metrics.unit.test.ts` 포함).
- [ ] `pnpm test:integration` 그린 (신규 `metrics-route.integration.test.ts`,
  `worker-metrics-route.integration.test.ts` 포함).
- [ ] `IT-R1-domain-boundary` 그린 (보강 룰 적용 후).
- [ ] `core/metrics.ts` 의 모든 식별자/주석/문자열에 도메인 식별자 0건.
- [ ] `docker compose config`가 유효 (변경 없음 — Grafana/Prometheus 컨테이너는
  M-OBS-4).
- [ ] `curl http://localhost:3000/metrics` (api 모드) 가 `200` + `text/plain;
  version=0.0.4; charset=utf-8` + `nodejs_*`/`process_*` 1건 이상 포함.
- [ ] `curl http://localhost:3001/metrics` (worker 모드 분리 시) 가 동일 응답.
- [ ] 1~2단계 IT 전건 그린 (IT-S1~S7, IT-S1b, IT-S2b, IT-S6b, UT-1~6).

## 7. PRD 역참조

- `prd-phase3/00-overview.md` §2 G3.2/G3.7 — prom-client 도입 및 `core/metrics.ts`
  진화.
- `prd-phase3/01-metrics-and-labels.md` §6.3 — Q-ARCH-3 (a)의 1~2단계→3단계
  진화 명세.
- `prd-phase3/01-metrics-and-labels.md` §6.4 — prom-client 의존성 도입 정당성.
- `prd-phase3/02-metrics-endpoint.md` §3 (라우트 명세), §4 (Registry 단일성),
  §5 (Q-OBS-1 잠정 인증 정책), §7.2 (Q-OBS-3 워커 모드 노출 방법).
- `prd-phase3/05-out-of-scope-and-open-questions.md` §3 C-MET-2 (IT-R1 grep
  예외 — 본 PLAN이 사전 이행).

## 8. 결정 의존

- **Q-OBS-1** (a) 인증 없음 — `/metrics` 라우트 미들웨어 미적용.
- **Q-OBS-3** (a) 워커 최소 HTTP 서버 — `WORKER_METRICS_PORT` 도입.
- **Q-OBS-10** (a) 압축 없음 — Fastify 기본 동작 수용.
- **Q-OBS-14** (a) IT-R1 grep 예외 — `webhook_relay_` 접두만 예외 처리.
- **Q-OBS-15** (a) `docs/plan-phase3/` — 본 PLAN 위치.
- **1~2단계:** Q-ARCH-3 (a) 약속 이행, Q-ARCH-2 (c) IT-R1 의도 보존.

> 모든 결정 2026-05-27 Resolved.

## 9. 회귀 점검

본 마일스톤이 끝나는 시점에 다음이 모두 그린:

- `pnpm test:unit` — UT-1~6 + 신규 `metrics.unit.test.ts`.
- `pnpm test:integration` — IT-S1, IT-S1b, IT-S2, IT-S2b, IT-S3, IT-S4, IT-S5,
  IT-S6, IT-S6b, IT-S7, IT-R1 (보강 적용), 신규 `metrics-route.integration.test.ts`,
  신규 `worker-metrics-route.integration.test.ts`.
- 데모 동작: `docker compose up` (기존 1~2단계 서비스 redis/api/worker) 후
  `curl POST /webhooks ...` 가 `202 + jobId` 응답 + 외부 수신자 도착. 신규로
  `curl GET /metrics` 도 200 응답.
- **부수 효과 0건 검증:** prom-client `inc()`/`observe()` 추가 호출 없음(본 마일스톤
  은 메트릭 wiring을 하지 않음). 따라서 핸들러/워커 hot path 변화 없음. IT-S3
  의 fake timer 단언/IT-S2 멱등성 단언이 동일하게 통과.

## 10. C-MET 적용 시점

본 마일스톤에서 **본 PLAN 내 직접 적용**:

| C-MET ID | 항목 | 본 마일스톤 적용 방식 |
|----------|------|------------------------|
| **C-MET-2** | IT-R1 grep 룰에 `webhook_relay_` 접두 예외 | §4 단계 2에서 `it-r1-domain-boundary.integration.test.ts` 갱신으로 사전 이행. PRD `architecture.md` §2 "도메인 식별자" 정의 본문 갱신은 별도 PR(사용자 결정). |

본 마일스톤에서 **별도 PR로 사용자 결정 위임**:

| C-MET ID | 항목 | 위임 이유 |
|----------|------|-----------|
| C-MET-1 | `prd/04` §7 표 "메트릭 정의(정의만) — 실제 노출은 3단계" 줄 갱신 | PRD 문서 갱신은 별도 PR. PLAN은 변경 제안만. |
| C-MET-3 | `architecture.md` §5 "보장하지 않는다 → 보장한다" 이동 | 본 PLAN 완료 후 별도 PR. |
| C-MET-6 | `architecture.md` §2 컴포넌트 표에 "Metrics Endpoint" 행 추가 | 별도 PR. |
| C-MET-7 | `.env.example`에 `WORKER_METRICS_PORT` 추가 | **§4 단계 8에서 PLAN 내 적용** (PLAN 진행에 필수). `METRICS_BEARER_TOKEN`은 Q-OBS-1 (a) 결정에 따라 도입 안 함. |

> 본 마일스톤에서 적용되지 않은 C-MET 17건은 `09-acceptance-gates.md` §6 표를
> 단일 출처로 한다.

---

## 11. 본 마일스톤 후 데모 상태

- 1~2단계 데모(`docker compose up` → `curl POST /webhooks`)는 그대로 동작.
- 추가로 `curl http://localhost:3000/metrics`(api/all 모드)와 `curl
  http://localhost:3001/metrics`(worker 모드 단독 인스턴스)가 200 + 표준
  Content-Type + 기본 prom-client 메트릭 응답.
- 도메인 메트릭(C1~C11, D1~D3, W1~W4)은 아직 등장하지 않음 — M-OBS-2/M-OBS-3
  에서 도입.
