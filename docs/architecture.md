# Architecture — Reliable Webhook Queue

본 문서는 본 저장소의 **시스템 구조**와 **보장 항목**을 한 곳에 모은다.
PRD가 "무엇을 지킬 것인가", PLAN이 "어떤 순서로 만들 것인가"를 다룬다면, 본 문서는 **"지금 무엇이 어떻게 동작하는가"**를 다룬다.

> 단일 소스 오브 트루스 우선순위: `CLAUDE.md` > `docs/plan/00-decisions-needed.md`(결정 잠금) > `docs/prd/*` > 본 문서.
> 본 문서가 PRD/결정과 충돌하면 PRD/결정이 우선이며, 본 문서가 갱신 대상이다.

---

## 1. 시스템 한 줄

Redis(BullMQ) 기반의 **at-least-once 웹훅 전송 작업 큐**. 외부로의 전송이 실패하면 분류된 정책에 따라 지수 백오프로 재시도하고, 최대 재시도 초과 또는 재시도 불가 분류 시 DLQ로 격리한다. SIGTERM 수신 시 진행 중 작업을 마치고 그레이스풀하게 종료한다. 모든 상태는 Redis에 두며, 워커 인메모리 상태에 의존하지 않는다.

---

## 2. 컴포넌트 분해

| 컴포넌트 | 위치 | 책임 |
|----------|------|------|
| **HTTP API (Fastify)** | `packages/demo/src/api/` | 작업 등록(`POST /webhooks`), 데모 수신자(`POST /_demo/receiver`), 대시보드(`GET /dashboard`, `GET /api/queue/stats`), 헬스(`GET /healthz`) |
| **Producer (Queue)** | `packages/core/src/queue.ts`, `producer.ts` | BullMQ `Queue` 생성, 멱등성 키를 `jobId`로 사용해 작업 적재 |
| **Worker** | `packages/core/src/worker.ts` | BullMQ `Worker` 생성, 핸들러 주입(`<TData>`), 종단 실패 시 DLQ 적재 |
| **Retry Policy** | `packages/core/src/retry.ts` | 지수 백오프(`baseMs * 2^(attempt-1)`), `buildWorkerRetryOptions` |
| **Error Contracts** | `packages/core/src/errors.ts` | `RetriableError`, `NonRetriableError` 클래스 |
| **DLQ** | `packages/core/src/dlq.ts` | DLQ 큐 팩토리, `DlqJobData<TData>` 페이로드 + 마지막 에러 컨텍스트 보존 |
| **Shutdown Sequencer** | `packages/core/src/shutdown.ts` | draining → worker.close(false) race → http close → queue/dlq close → redis.quit |
| **Delivery Handler** | `packages/demo/src/handlers/deliver.ts`, `webhook-delivery.ts` | Node 내장 `fetch` + `AbortController` 타임아웃 + SSRF 가드 + HMAC 서명 + 응답 분류 |
| **Domain Schemas** | `packages/demo/src/domain/schemas.ts`, `idempotency-key.ts`, `hmac.ts` | Zod 경계 파싱, 멱등성 키 검증, HMAC-SHA256 결정성 서명 |
| **Config** | `packages/demo/src/config.ts` | 환경변수 Zod fail-fast 파싱(시크릿 ≥ 32 bytes) |
| **Receiver Store** | `packages/demo/src/receiver/store.ts` | 데모 수신자의 최근 N건 in-memory FIFO |
| **Service Mode** | `packages/demo/src/server.ts` `main()` | `SERVICE_MODE` env (`all` / `api` / `worker`)로 프로세스 모드 분기. `all` = 단일 프로세스(데모 기본값, IT-S7 자식 호환), `api` = Fastify 만, `worker` = BullMQ Worker 만. 동일 이미지를 `docker compose up --scale worker=N` 으로 수평 확장 |

### 패키지 경계 (CLAUDE.md §3)

- **`core/`** — 도메인(웹훅) **비의존**. 큐/워커/재시도/DLQ/셧다운 추상화만. `webhook`/`fastify`/`_demo` 같은 도메인 식별자가 등장하면 `IT-R1-domain-boundary` 통합 테스트가 즉시 실패한다(Q-ARCH-2 (c)).
- **`demo/`** — 도메인 + Fastify HTTP + 워커 부트스트랩. `core`에 단방향 의존.
- **`streams-internals/`** — **자리만 예약**(`.gitkeep`). 부록 트랙(Raw Redis Streams 직접 구현)이 메인 트랙 안정화 후 들어올 자리. 본 PRD 범위에서는 임포트/참조 금지.

---

## 3. 데이터 흐름

### 3.1 해피패스 (IT-S1)

```
client ──POST /webhooks────────────────────────────────────────────────────────┐
       (Authorization: Bearer <token>, Content-Type: application/json,         │
        body: { url, payload, idempotencyKey, headers? })                      │
                                                                               ▼
                                                       ┌────────────────────────────┐
                                                       │ api/webhooks.ts            │
                                                       │ 1) Bearer 검증 (401 if no) │
                                                       │ 2) Zod 파싱  (400 if no)   │
                                                       │ 3) draining (503 if yes)   │
                                                       │ 4) queue.add(jobId=idemKey)│
                                                       └──────────────┬─────────────┘
                                                                      │ BullMQ Queue
                                                                      ▼
                                                       ┌────────────────────────────┐
                                                       │ Redis (BullMQ list)        │
                                                       └──────────────┬─────────────┘
                                                                      │ Worker pickup
                                                                      ▼
                                                       ┌────────────────────────────┐
                                                       │ handlers/webhook-delivery  │
                                                       │ 1) WebhookJobDataSchema    │
                                                       │    재파싱 (경계 검증)        │
                                                       │ 2) deliver()                │
                                                       │    - fetch + AbortController│
                                                       │    - SSRF guard             │
                                                       │    - HMAC-SHA256 헤더 부착   │
                                                       │    - outgoing 헤더 블랙리스트│
                                                       │ 3) 응답 분류 (4 / 5 / 3xx)   │
                                                       └──────────────┬─────────────┘
                                                                      │ 2xx
                                                                      ▼
                                                       ┌────────────────────────────┐
                                                       │ BullMQ state: completed     │
                                                       │ 데모 수신자 store: +1       │
                                                       │ /api/queue/stats: completed +1 │
                                                       └────────────────────────────┘
```

### 3.2 재시도/DLQ (IT-S3, IT-S4, IT-S5)

```
                  ┌──────────────────┐
                  │ deliver() throws │
                  └────────┬─────────┘
                           │
         ┌─────────────────┼─────────────────────────┐
         │                 │                         │
   classify(httpStatus=5xx│timeout)            classify(httpStatus=4xx│3xx)
         │                                            │
         ▼                                            ▼
   RetriableError                              NonRetriableError
         │                                            │
   BullMQ가 attemptsMade++                    BullMQ Worker 가 즉시 UnrecoverableError 로
   다음 시도까지 delayForAttempt 만큼          변환 → attempts 자동 소진 → failed
   대기 (지수 백오프, jitter 없음)                       │
         │                                            │
   attemptsMade < attempts ?                          │
   ──── YES → retry                                   │
   ──── NO  ───────────────────┐                      │
                               ▼                      │
                       ┌──────────────────────────────┴────────────┐
                       │ Worker 의 on('failed') 훅                  │
                       │ DLQ Queue.add(DlqJobData{                  │
                       │   data: job.data,                          │
                       │   lastError: { class, httpStatus,           │
                       │                attemptsMade, message }      │
                       │ })                                          │
                       │ 원 큐에서는 removeOnFail: { count: 0 } 로     │
                       │ 즉시 제거 (DLQ 단방향, I2.4)                  │
                       └─────────────────────────────────────────────┘
```

### 3.3 Stalled 회수 (IT-S6)

```
┌─────────────────┐   ┌─────────────────┐
│ Worker A        │   │ Worker B        │
│ (작업 점유)      │   │ (idle)          │
└────────┬────────┘   └────────┬────────┘
         │                     │
   강제 종료(SIGKILL or force=true)
         │                     │
         ▼                     │
┌─────────────────────────────────────────┐
│ BullMQ stalled scanner                   │
│ lock 만료 + STALLED_INTERVAL_MS 후 감지   │
│ Job 의 lock 해제, waiting 으로 반환     │
└────────┬─────────────────────────────────┘
         │ Worker B pickup
         ▼
┌─────────────────────────────────────────┐
│ Worker B 가 동일 작업을 처리 → completed │
│ 수신자 1건 수신                          │
└─────────────────────────────────────────┘

자체 stalled-job 매니저 구현 금지 (F2.5).
BullMQ 의 stalledInterval / maxStalledCount 옵션에만 의존.
```

### 3.4 그레이스풀 셧다운 (IT-S7)

```
SIGTERM ──► handleSignal()
              │
              ▼
       gracefulShutdown(...):
       ┌──────────────────────────────────────┐
       │ 1) httpServer.setDraining(true)       │
       │    /webhooks → 503 ERR_SHUTTING_DOWN   │
       │    /healthz  → 503                     │
       │    /_demo/receiver, /dashboard → 200   │
       ├──────────────────────────────────────┤
       │ 2) worker.close({ force: false })      │
       │    Promise.race vs timeoutMs           │
       │    - 진행 중 작업이 끝날 때까지 대기    │
       ├──────────────────────────────────────┤
       │ 3-A) 타임아웃 안에 끝남                  │
       │      → result.timedOut = false          │
       │ 3-B) 타임아웃 도달                      │
       │      → onTimeout(remainingJobIds)       │
       │      → worker.close({ force: true })    │
       │      → result.timedOut = true            │
       ├──────────────────────────────────────┤
       │ 4) httpServer.close()                  │
       │ 5) queue.close(), dlqQueue.close()     │
       │ 6) redis.quit()                        │
       └──────────────────────────────────────┘
              │
              ▼
       process.exit(0 if !timedOut else 1)
       (Q-SEC-4 (b): 잔여 작업이 있었음을 모니터링 신호로)
```

---

## 4. 7개 시나리오 ↔ 불변식 ↔ 마일스톤 매핑

| 시나리오 | 마일스톤 | 보장하는 불변식 | 테스트 ID |
|----------|----------|----------------|-----------|
| 해피패스 | M2 | I2.1 (at-least-once 도달), I5.1 (경계 검증) | IT-S1 |
| 멱등성 | M3 | I2.2 (동일 키 1회 실행) | IT-S2 |
| 재시도 + 백오프 | M4 | I2.3 (분류 결정성), I6.1 (타임아웃 강제) | IT-S3 |
| 최대 재시도 초과 → DLQ | M5 | I2.4 (DLQ 단방향) | IT-S4 |
| 재시도 불가 → 즉시 DLQ | M4 + M5 | I2.3, I2.4 | IT-S5 |
| 워커 강제 종료 → 회수 | M6 | I2.5 (워커 사망에도 작업 유실 없음) | IT-S6 |
| SIGTERM → 그레이스풀 | M7 | I2.6, I6.3 | IT-S7 |

회귀 보호: `IT-R1-domain-boundary` (`packages/core/src/**`에 도메인 식별자 0건).

> 불변식 정의는 PRD `02-resilience.md` §8, PRD `06-security-and-ops.md` §11에서 확인.

---

## 5. 보장 항목 요약

본 시스템이 보장하는 것 / **보장하지 않는** 것을 명시한다.

### 보장한다
- ✅ **at-least-once 전달** — 워커가 도중에 죽어도 작업이 유실되지 않는다(I2.1, I2.5).
- ✅ **멱등성** — 동일 `idempotencyKey`로 N회 등록해도 실행은 정확히 1회(I2.2).
- ✅ **분류된 재시도** — 5xx/네트워크/timeout/408/425/429는 재시도, 4xx/3xx는 즉시 격리(I2.3).
- ✅ **DLQ 단방향** — 원 큐 → DLQ는 자동이지만, DLQ → 원 큐 재투입은 본 PRD 범위 밖(I2.4, Q-DLQ-1).
- ✅ **DLQ 보존 컨텍스트** — 페이로드 + `errorClass` + `httpStatus` + `attemptsMade` + `message`.
  보존 정책: 최근 10000건 / 14일(`DLQ_REMOVE_ON_FAIL_COUNT` / `DLQ_REMOVE_ON_FAIL_AGE_SECONDS`,
  `packages/demo/src/constants.ts`). 메인 큐의 `removeOnFail: { count: 0 }` 와 의도적으로 분리.
- ✅ **외부 송신 타임아웃** — `WEBHOOK_DELIVERY_TIMEOUT_MS`로 `AbortController` 적용(I6.1).
- ✅ **HMAC 서명** — HMAC-SHA256, 결정성(재시도 시 동일 서명).
- ✅ **그레이스풀 셧다운** — SIGTERM 시 진행 작업 완료 + 신규 요청 503(I2.6, I6.3).
- ✅ **시크릿 fail-fast** — `API_BEARER_TOKEN`, `WEBHOOK_HMAC_SECRET` ≥ 32 bytes, 부트스트랩에서 거부.

### 보장하지 않는다 (본 PRD 범위 밖)
- ❌ **exactly-once 전달** — 환상에 가깝다. 멱등성으로 수신자가 흡수.
- ❌ **HMAC replay 방어** — timestamp/nonce 미적용(Q-SEC-2 (a)). 후속 PRD.
- ❌ **SSRF DNS 검증** — hostname 문자열 검사만. 동적 DNS 우회 가능성 잔존. 후속 강화.
- ❌ **Bearer timing-safe 비교** — 현재 `===`. 운영 노출 전 `crypto.timingSafeEqual` 권장.
- ❌ **DLQ 자동 재투입** — Q-DLQ-1 (a). 격리만.
- ❌ **stalled-limit 초과 시 DLQ 이동** — `failed(job===undefined)` 케이스는 현재 silent return → 페이로드 손실 가능성. 후속 결정 + 정책 필요.
- ❌ **Prometheus/Grafana 관측성** — 3단계 PRD.
- ❌ **부하 측정, p50/p99, 수평 확장 SLO** — 4단계 PRD.

---

## 6. 결정 잠금 (21건 전건 Resolved)

본 시스템의 모든 핵심 의사결정은 `docs/plan/00-decisions-needed.md`에 Q-ID로 기록되어 있다.
대표 결정 8건만 본문에 인용 — 전체는 PLAN 참조.

| Q-ID | 결정 |
|------|------|
| Q-API-1 | API 인증 = **Bearer 공유 시크릿** (`API_BEARER_TOKEN`, ≥32 bytes) |
| Q-API-2 | 멱등성 재요청 응답 = **`202` + 동일 `jobId`** |
| Q-API-3 | outgoing 헤더 블랙리스트 = `Authorization`/`Cookie`/`Host`/`Content-Length`/`Transfer-Encoding` |
| Q-ARCH-1 | HTTP 클라이언트 = **Node 내장 `fetch`** (새 의존성 없음) |
| Q-RETRY-1 | 3xx = **`NonRetriableError`** (자동 리다이렉트 안 함) |
| Q-RETRY-3 | 백오프 jitter = **없음** (결정성 우선) |
| Q-SEC-1 | SSRF 방어 = **`ALLOW_PRIVATE_TARGETS` env 토글** (기본 `true`) |
| Q-SEC-4 | 셧다운 강제 종료 exit code = **`1`** (잔여 작업 신호) |

---

## 7. ADR

설계 핵심 결정의 컨텍스트·근거·트레이드오프는 별도 ADR로 보존한다. 코드와 함께 진화하지만, 결정 시점의 맥락은 그대로 두는 것이 원칙.

- [ADR-001 — BullMQ vs Raw Redis Streams vs Kafka](./adr/ADR-001-bullmq-vs-streams-vs-kafka.md)
- [ADR-002 — at-least-once + 멱등성 키 강제](./adr/ADR-002-at-least-once-with-idempotency.md)

추가 ADR이 필요한 결정(예: 재시도 분류 정책 D2, 그레이스풀 셧다운 시퀀스 D3)은 별도 PR로 보강 예정.

---

## 8. 관련 문서

- **PRD (요구사항 / 설계 의도):** [`prd/README.md`](./prd/README.md)
- **PLAN (마일스톤 / 결정 잠금 / 구현 순서):** [`plan/README.md`](./plan/README.md)
- **CLAUDE.md (규칙 단일 소스):** [`../CLAUDE.md`](../CLAUDE.md)
- **README (프로젝트 개요 + 운영 노트):** [`../README.md`](../README.md)
