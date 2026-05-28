# Reliable Webhook Queue

BullMQ(Redis) 기반의 **신뢰성 있는 웹훅 전송 작업 큐**.
전송 실패 시 지수 백오프로 재시도하고, 최대 재시도를 초과하면 DLQ로 격리하며,
처리 상태를 실시간 대시보드와 Prometheus 메트릭으로 관측합니다.

> 이 프로젝트의 목적은 "가장 빠른 큐"를 만드는 것이 아니라, 프로덕션급 작업 큐가
> 갖춰야 할 보장(전달 보장 · 멱등성 · 재시도 · DLQ · 그레이스풀 셧다운 · 관측성)을
> **검증된 라이브러리 위에서 올바르게 조립하는 판단력**을 보여주는 것입니다.

---

## 데모

> _(여기에 30초 데모 GIF: 작업 등록 → 처리 → 워커를 죽여도 자동 회수되는 장면 → 대시보드)_

---

## 빠른 시작

```bash
pnpm install
docker compose up
# API: http://localhost:3000
# 대시보드: http://localhost:3000/dashboard
# 메트릭: http://localhost:3000/metrics (api). worker /metrics 는 Prometheus 가
# 컨테이너 네트워크 worker:3001 으로 scrape (host port 매핑 없음, M-LOAD-5 fix
# db23169 — --scale worker=N 충돌 회피). 호스트 직접 확인: docker compose exec
# worker curl -sf http://localhost:3001/metrics
# Prometheus: http://localhost:9090
# Grafana: http://localhost:3002 (admin/admin — 데모 기본값)
```

기본 `docker compose up` 은 `api` 와 `worker` 를 각 1개, Redis 1개를 띄운다.
두 서비스는 동일 Docker 이미지를 공유하며 `SERVICE_MODE` 환경변수(`api` /
`worker`)로 모드를 분기한다. 워커 수평 확장은 다음과 같다.

```bash
docker compose up --scale worker=5 -d
```

웹훅 작업 하나 등록해 보기:

```bash
curl -X POST http://localhost:3000/webhooks \
  -H 'Content-Type: application/json' \
  -d '{ "url": "http://localhost:3000/_test/receiver", "payload": { "hello": "world" } }'
```

---

## 아키텍처

```
Producer ──add──> BullMQ Queue ──> Worker pool (수평 확장)
                                      │
                            성공: complete   실패: 재시도(지수 백오프)
                                      │                  │
                                  메트릭 기록      최대 초과 → DLQ
관측성: 처리량/지연/대기열 길이/DLQ → Prometheus → Grafana
```

> "Worker pool (수평 확장)" 은 `SERVICE_MODE=worker` 컨테이너의 실제 분리된
> 워커 풀이다. `docker compose up --scale worker=N` 으로 인스턴스를 늘린다.

| 컴포넌트 | 역할 |
|----------|------|
| Producer | 웹훅 작업 등록, 멱등성 키 부여 |
| Worker | 작업 소비, 웹훅 전송, 결과 처리 |
| Retry/DLQ | 백오프 재시도, 재시도 불가/초과 시 격리 |
| Observability | 메트릭 노출 및 대시보드 |

> 상세 다이어그램과 컴포넌트 설명은 `docs/architecture.md`.

---

## 설계 의사결정 (Design Decisions)

> 이 섹션이 이 저장소의 핵심입니다. 각 항목은 **문제 → 선택지 → 결정과 근거 → 한계**
> 형식으로 정리합니다. (현재는 뼈대이며, 구현과 함께 채워 나갑니다.)

### D1. 전달 보장: at-least-once + 멱등성
- **문제:** 워커가 작업을 처리하고 ACK하기 직전에 죽으면? 중복 전송 위험.
- **선택지:** exactly-once(환상에 가깝고 비용이 큼) vs at-least-once + 애플리케이션 멱등성.
- **결정:** at-least-once를 받아들이고, 모든 웹훅 작업에 `idempotencyKey`를 **필수**로 받아
  BullMQ의 `jobId` 시맨틱(동일 ID 중복 흡수)에 의존한다. 자체 키 저장소를 만들지 않는다.
- **근거:** 외부 HTTP 수신자가 우리 트랜잭션에 참여할 수 없으므로 exactly-once는 본질적으로
  달성 불가(Two Generals). 검증된 BullMQ 메커니즘 위에 추상화를 쌓는 것은 새 일관성 문제를
  만들 뿐이라 정책상 금지(`CLAUDE.md §7-3`). IT-S2가 동시 3회 등록 시 핸들러 호출 == 1을
  통합 테스트로 증명.
- **한계:** 멱등성 키 관리 책임이 작업 정의자(클라이언트)에게 있다. 잘못된 클라이언트가 매번
  새 키를 생성하면 막을 수 없다. 보완: 수신자 측에서도 자체 멱등성 흡수 권장(이중 안전망).
- **상세:** [ADR-002 — at-least-once + 멱등성 키 강제](./docs/adr/ADR-002-at-least-once-with-idempotency.md)

### D2. 재시도 전략과 DLQ
- **문제:** 일시적 실패(네트워크, 5xx)와 영구적 실패(4xx)를 같게 다루면 안 된다.
- **결정:** 재시도 가능/불가 에러를 `classifyDeliveryFailure({httpStatus?, cause?})`로 명시적
  분류. 가능 에러는 지수 백오프(`baseMs * 2^(attempt-1)`)로 N회 재시도, 초과 시 DLQ로 격리.
  불가 에러(`NonRetriableError`)는 BullMQ `UnrecoverableError`로 변환해 즉시 격리.
- **파라미터(기본값):** `WEBHOOK_MAX_ATTEMPTS=5`, `WEBHOOK_BACKOFF_BASE_MS=1000`, jitter 없음
  (결정성 우선 — IT-S3가 fake-timer 없는 wall-clock 단언으로 검증).
- **분류 규칙(Q-RETRY-1/2 잠금):** 5xx / 408 / 425 / 429 / timeout / DNS / ECONNREFUSED →
  Retriable. 4xx / 3xx → NonRetriable (자동 리다이렉트 안 함, SSRF/체인 우려).
- **DLQ 시맨틱:** 별도 큐(`<QUEUE_NAME>-dlq`)에 페이로드 + `lastError: { class, httpStatus,
  attemptsMade, message }` 보존. 원 큐는 `removeOnFail: { count: 0 }`로 즉시 제거(단방향
  보장, I2.4).
- **한계 1:** poison message가 DLQ에 쌓일 때의 운영 절차(재투입 / 분석 / 알람)는 본 PRD
  범위 밖(Q-DLQ-1 (a) "두지 않음"). 후속 PRD에서 다룬다.
- **한계 2:** `failed(job===undefined)`로 발화되는 stalled-limit 초과 케이스는 현재 silent
  return → 페이로드 손실 가능성 잔존. 후속 결정 + DLQ 이동 정책 필요.

### D3. 그레이스풀 셧다운
- **문제:** 무중단 배포/스케일 인 시 진행 중 작업이 잘리면 안 된다.
- **결정:** SIGTERM/SIGINT 수신 시 다음 시퀀스를 `core.gracefulShutdown(...)`이 수행한다.
  1. `httpServer.setDraining(true)` — `POST /webhooks`와 `GET /healthz`가 `503` 응답.
     `/dashboard`와 `/_demo/receiver`는 200 유지(관측성/데모 동작 보존).
  2. `worker.close({ force: false })` vs `SHUTDOWN_TIMEOUT_MS` race.
  3. 타임아웃 도달 시: `worker.getJobs(['active'])`로 잔여 ID 수집 →
     `onTimeout(remainingJobIds)` 호출 → 구조화 JSON 한 줄 로그.
  4. `httpServer.close()` → `queue.close()` → `dlqQueue.close()` → `redis.quit()`.
  5. `process.exit(0)` (정상 완료) 또는 `process.exit(1)` (잔여 작업 있었음, Q-SEC-4 (b)).
- **테스트:** IT-S7이 `child_process.spawn`으로 실제 자식 프로세스를 띄우고 실제 SIGTERM을
  전송한다(Q-OPS-2 (b)). 동일 프로세스 시뮬레이션이 아닌 "진짜 시그널" 검증.
- **한계:** 중복 SIGTERM은 무시(boolean guard). 운영자가 연속으로 SIGTERM을 보내도 강제
  종료 fast-path는 본 PRD 범위 밖. Node의 `SIGKILL`은 잡을 수 없다.

### D4. 기술 선택: 왜 BullMQ인가 (vs Raw Redis Streams, vs Kafka)
- **vs Raw Streams:** BullMQ는 내부적으로 Redis Streams 위에 구현되어 있으며,
  재시도·DLQ·스케줄링·stalled-job 회수를 직접 짜는 대신 검증된 추상화를 쓴다.
  본 PRD의 어필 포인트는 "원리를 직접 짤 수 있다"가 아니라 **"보장이 무엇이고 어떻게
  검증하는지를 안다"**이다(`CLAUDE.md §1`). "추상화의 비용"은 부록 트랙에서 동일 보장을
  Raw Streams로 직접 구현해 처리량/지연을 정량 비교할 예정.
- **vs Kafka:** 작업 큐(개별 작업의 신뢰성 있는 실행)와 이벤트 스트리밍(durable·replayable
  로그)은 다른 문제를 푸는 도구다. 웹훅 재시도 워크로드는 전형적 작업 큐 영역이며,
  Kafka의 브로커/파티션 운영 복잡성과 까다로운 재시도 모델은 이 규모에 과하다.
- **상세:** [ADR-001 — BullMQ vs Raw Redis Streams vs Kafka](./docs/adr/ADR-001-bullmq-vs-streams-vs-kafka.md)

---

## 운영 노트

본 저장소는 **데모/로컬 전제**로 작성되어 있습니다. 운영 환경에 그대로 배포하지 마세요.
운영 전환 전에 다음 항목을 별도 PR로 보강해야 합니다.

- **시크릿 관리:** `API_BEARER_TOKEN` / `WEBHOOK_HMAC_SECRET`은 32 bytes 이상이며,
  코드/리포지토리에 직접 두지 말 것. 발급은 `openssl rand -hex 32`. 운영에서는
  Docker secrets / Kubernetes Secret / AWS Secrets Manager 같은 비밀 관리 인프라 사용.
- **Bearer timing-safe 비교:** 현재는 `===`. 운영 노출 전 `crypto.timingSafeEqual`로
  교체(타이밍 공격 회피).
- **SSRF strict 모드:** `ALLOW_PRIVATE_TARGETS=false` 일 때 hostname 문자열 검사 + DNS 조회
  결과 IP 검사를 모두 적용한다(`packages/demo/src/handlers/deliver.ts` 의 `isPrivateUrl` +
  `isPrivateIp`). 동적 DNS(`evil.example.com` → `10.0.0.1`)도 차단. DNS lookup timeout 2초
  도달 시 보수적으로 거부. 운영에서는 `ALLOW_PRIVATE_TARGETS=false` 권장.
- **HMAC replay 방어:** 현재는 본문 HMAC만(timestamp/nonce 없음, Q-SEC-2 (a)). 운영에서
  replay 위협이 있다면 `X-Webhook-Timestamp` + nonce 도입을 별도 PR로.
- **API vs Worker 프로세스 분리:** 본 저장소는 단일 Docker 이미지 + `SERVICE_MODE`
  env(`all` / `api` / `worker`)로 두 역할을 분리할 수 있다. `docker-compose.yml` 은
  `api` 와 `worker` 를 별도 서비스로 띄우며, 워커만 `docker compose up --scale worker=N`
  으로 수평 확장한다. 운영에서는 워커를 별도 오토스케일링 그룹으로 운영해 부하 변동을
  흡수할 수 있다. (`SERVICE_MODE=all` 은 데모/단일 프로세스 기본값.)
- **Redis 운영:** 본 데모는 단일 Redis 인스턴스. HA가 필요하면 Redis Sentinel 또는
  Cluster 구성, BullMQ의 `connection` 옵션 갱신 필요.
- **DLQ 운영 절차:** 자동 재투입은 본 PRD 범위 밖(Q-DLQ-1). 운영자가 DLQ를 주기적으로
  검사하고, poison message는 페이로드 분석 후 수동으로 처리하거나 제거하는 절차 필요.
  DLQ 자체의 보존 정책은 기본 **14일 / 최근 10000건**(`packages/demo/src/constants.ts`의
  `DLQ_REMOVE_ON_FAIL_COUNT` / `DLQ_REMOVE_ON_FAIL_AGE_SECONDS`에서 조정). 메인 큐의
  실패 즉시 제거(`removeOnFail: { count: 0 }`)와는 의도적으로 분리되어 있다 — DLQ 는 검사 대상.
- **`removeOnComplete` 정책:** 완료 작업은 Redis 메모리 누적 방지를 위해 일정 개수/시간
  뒤 자동 제거. 본 저장소는 `count: 1000`, `age: 86400s`로 설정(`packages/demo/src/constants.ts`).
  관측성 요구가 강하다면 3단계 PRD에서 보관 기간을 늘리거나 별도 저장소로 옮길 수 있음.
- **BullMQ stalled recovery 와 attempts-per-job 메트릭:** 워커 강제 종료(IT-S6) 등으로
  BullMQ 의 stalled recovery 가 발화하면, 회수된 작업의 `attemptsMade` 가 증분되지 않는
  시맨틱(BullMQ 5.x) 때문에 `webhook_relay_delivery_attempts_per_job` 히스토그램이 해당
  작업에 대해 `+Inf` 버킷에 집계된다. IT-OBS-6.S6 가 이 동작을 +Inf 1건 단언으로 약화하여
  회귀 가드한다. 결정론적 attempts 분포는 IT-OBS-6.S3/4/5 가 보장한다. Grafana
  `04-shutdown` 대시보드의 "attempts-per-job under stalled recovery" 노트 패널에서도 동일
  내용을 cross-link 한다.
- **Grafana admin 기본값 변경(운영 노출 전 필수):** `docker-compose.yml` 의 `grafana`
  서비스가 `GF_SECURITY_ADMIN_USER=admin` / `GF_SECURITY_ADMIN_PASSWORD=admin` 을 데모
  기본값으로 둔다(Q-OBS-4 (a)). 운영 노출 전에 `.env` 또는 Docker secrets 로 강한 값을
  주입하고, Grafana 컨테이너 재기동. 외부 노출이라면 추가로 reverse proxy 의 TLS + 별도
  사용자 관리(SSO 등) 도입 권장.
- **SLO 임계 — 4단계 실측 기반 갱신 완료 (2026-05-28):** 3단계 PRD(`prd-phase3/04`) 의
  SLO 목표 숫자가 4단계 측정(`docs/prd-phase4/results/final_2026-05-28.md` §4.2) 기반
  으로 갱신:
  - SLO-1 가용성 5xx ≤ **0.5% 유지** (실측 0 → `prd-phase4/03` §4.5 변형)
  - SLO-2 등록 지연 p99 ≤ **7.5ms** (실측 nominal max 4.99ms × 1.5, Q-LOAD-9 (a))
  - SLO-3 전달 지연 p99 ≤ **14.9ms** (실측 nominal max 9.96ms × 1.5, Q-LOAD-9 (a))
  - SLO-4 DLQ 적재율 ≤ **1% 유지** (실측 0 → §4.5 변형)

  SLI PromQL 형태 + 측정 윈도우 (28d/7d/1d) + burn rate (14.4×/6×) 는 잠금된 패턴
  (I6.1, I6.2) — 본 갱신에서도 변경 0건. alerting rule YAML 의 임계 숫자는 commit
  `a338716` 으로 동시 갱신 (`docker/prometheus/rules/webhook-relay-latency.yaml`).
- **수평 확장 SLO-H-1 / SLO-H-2 — 4단계 실측 기반 1차 검증 (2026-05-28):** 4단계 PRD
  (`prd-phase4/04`) 가 새로 정의한 상대 SLO 의 본 시스템 측정 결과:
  - **SLO-H-1 (α=0.8 처리량 선형성):** nominal 영역 (R=100 LP-2) 의 capacity 미달
    영역이라 4 N (1/2/5/10) 모두 위반 (linearity = 1/N). **시스템적 한계** — 부하
    영역 의존성으로 SLO-H-1 의 의미 보존은 capacity 초과 영역의 측정 필요 (PRD
    §I4.22). 본 한계가 후속 PRD 진입 트리거 (Capacity 초과 영역 부하 측정 PRD).
  - **SLO-H-2 (β=1.2 p99 안정성):** 4 N 모두 통과 (max ratio +0.24%). **본 시스템의
    수평 확장 능력에 대한 정량적 약속의 1차 증거**. N=10 cgroup over-commit 영역
    (14 컨테이너 / 12 core) 도 p99 안정.
  - 자세한 측정 결과 = `docs/prd-phase4/results/horizontal-scaling_2026-05-28.md`
    + 종합 보고서 `docs/prd-phase4/results/final_2026-05-28.md` §5.

> 운영 전환 전에 검토할 항목 전체 목록은 `docs/architecture.md §5`의 "보장하지 않는다" 절
> 참조.

---

## 테스트

```bash
pnpm test            # 전체
pnpm test:unit       # 단위 (Redis 불필요)
pnpm test:integration # 통합 (Testcontainers로 실제 Redis 기동)
```

장애 복구·동시성 시나리오는 모킹이 아니라 **실제 Redis 컨테이너**로 검증합니다.
검증 시나리오 목록은 `CLAUDE.md` §5 참조.

현재 상태: **117 tests passed** (UT-1~7 + Redis backoff + IT-R1 + IT-S1~S7 + IT-S1b/S2b/S6b
+ M-OBS-1 메트릭 라우트 통합 테스트 등). 7개 핵심 시나리오 + 회귀 가드 전건 그린.

---

## 벤치마크

> _(채울 자리)_ 워커 수에 따른 처리량 변화, 처리 지연 분포(p50/p99)를 수치로 기록.

---

## AI-Assisted Development

이 프로젝트는 Claude Code와 함께 개발했으며, **설계와 검증의 책임은 사람에게 두는**
원칙으로 진행했습니다.

- 동시성·장애 복구처럼 까다로운 로직은 **불변식(invariant)을 먼저 정의**하고,
  핵심 시나리오의 **테스트를 먼저 작성**한 뒤 구현을 AI에 위임했습니다.
- AI가 생성한 코드는 엣지 케이스(워커 중도 사망, 중복 전송, poison message) 관점에서
  리뷰해 교정했습니다.
- 프로젝트 규칙(아키텍처 경계, 코딩 컨벤션, 테스트 정책, 범위 통제)을 `CLAUDE.md`에
  명문화해 AI가 일관되게 따르도록 강제했습니다.

> 요지는 "AI가 코드를 짜줬다"가 아니라 **"AI를 규율 있는 협업자로 다뤘다"**입니다.
> 규칙 정의 → 테스트 우선 → 위임 → 리뷰의 루프가 이 저장소 곳곳에 남아 있습니다.

---

## 로드맵

- [x] 1단계 — MVP: 작업 등록 → 워커 처리 → 대시보드 표시 _(IT-S1)_
- [x] 2단계 — 장애 복구: 멱등성, 백오프 재시도, DLQ, stalled-job 회수, 그레이스풀 셧다운
      _(IT-S2 ~ IT-S7)_
- [x] API/Worker 프로세스 분리 — `SERVICE_MODE` env(`all`/`api`/`worker`) +
      `docker compose up --scale worker=N`
- [x] **3단계 — 관측성: Prometheus 메트릭 + Grafana 대시보드** _(M-OBS-1~6 전건
      완료 + C-MET-1~17 정착)_
  - [x] **M-OBS-1 Bootstrap** — prom-client 도입, `core/metrics.ts` 진화(Q-ARCH-3 약속 이행),
        IT-R1 grep 룰 `webhook_relay_` 예외, `GET /metrics` 라우트 (api 모드 `3000` / worker
        모드 `WORKER_METRICS_PORT=3001`)
  - [x] **M-OBS-2 Core Metrics Wiring** — 도메인 무관 메트릭(C1~C11) instrumented
  - [x] **M-OBS-3 Demo Metrics Wiring** — 도메인 메트릭(D1~D3 / W1~W4) instrumented
  - [x] **M-OBS-4 Grafana Provisioning** — 대시보드 4종(overview/reliability/dlq/shutdown)
        + Prometheus/Grafana 컨테이너 (`docker compose up` 자동 provisioning)
  - [x] **M-OBS-5 SLO + Alerting Rules** — rule YAML 4종(가용성/p99 등록 지연/p99 전달
        지연/DLQ 적재율) + 10 alert + burn rate (14.4×/6×)
  - [x] **M-OBS-6 Refinement** — 카디널리티 모니터링 (IT-OBS-11 ≤ 1000) + 로그·메트릭
        라벨 정합 (IT-OBS-12)
- [x] **4단계 — 부하 테스트 + p50/p99 측정 + 수평 확장 SLO 검증** _(M-LOAD-1~6
      완료, 4단계 PLAN 묶음 closeout 2026-05-28)_
  - [x] **4단계 PRD** — Q-LOAD-1~13 전건 잠금 (`docs/prd-phase4/`)
  - [x] **4단계 PLAN** — C-LOAD-1~15 카탈로그 정착 (`docs/plan-phase4/`)
  - [x] **M-LOAD-1 Bootstrap** — `docker-compose.yml` k6 서비스 + cgroup 한정값
        (Q-LOAD-2) + 측정 호스트 메타데이터 헬퍼 (`docker/k6/scripts/collect-metadata.sh`)
  - [x] **M-LOAD-2 LP-1 baseline 측정** — LP-1 (R=10 RPS, P=small 1KB) k6 시나리오
        + 8 단계 측정 자동화 (`run-lp-1.sh`) + 결과 보고서
        (`docs/prd-phase4/results/LP-1_2026-05-27.md`). SLO 잠정값 전건 통과 +
        분산 ±5% 안.
  - [x] **M-LOAD-3 LP-2 nominal sustained 측정** — LP-2 (R=100 RPS, P=80/15/5,
        W=~32분) 4 변형 × 8 단계 자동화 (`run-lp-2.sh`) + variant-aware stub
        (`/_demo/receiver?variant=normal|s3|s4|s5`) + 결과 보고서
        (`docs/prd-phase4/results/LP-2_2026-05-27.md`). SLO 잠정값 + PLAN §3.3
        결과 무효 조건 보강 (W3 attempts ≈ 3.0 / SLO-4 DLQ 1.0 / C5
        non_retriable rate / D3 80/15/5) 전건 통과.
  - [x] **M-LOAD-4 LP-3 stress + LP-4 spike — knee point 1차 탐색** — LP-3
        (R=500 stress, P=large 64KB 고정, W=~32분) + LP-4 (base 100 → spike
        1000 × 30s → base 100) k6 시나리오 + 측정 자동화 (`run-lp-3.sh` /
        `run-lp-4.sh`) + 결과 보고서 (`docs/prd-phase4/results/LP-3_2026-05-27.md`
        + `LP-4_2026-05-28.md`). **LP-3 knee 명백 진입 — Bound = 단일 Redis
        인스턴스의 RDB snapshot fork-time 메모리 한계** (Q-LOAD-4 (a) 정합).
        LP-4 회복 시간 33.1초 정상 측정 + PRD §6.2 T3 트리거 미발화.
  - [x] **M-LOAD-5 수평 확장** — N ∈ {1, 2, 5, 10} × LP-2 nominal 측정.
        **SLO-H-1 (α=0.8) 4 N 위반 (부하 영역 의존성, PRD §I4.22 시스템적
        한계 식별)** + **SLO-H-2 (β=1.2) 4 N 통과** (max ratio +0.24%). 결과
        보고서 = `docs/prd-phase4/results/horizontal-scaling_2026-05-28.md`.
  - [x] **M-LOAD-6 Redis knee + 최종 종합 보고서 + SLO 임계 갱신** —
        M-LOAD-2~5 종합 분석 + Redis knee point 식별 (Bound = 단일 Redis
        fork-time 메모리, Q-LOAD-4 (a)) + HA / Cluster T1~T5 트리거 명문화.
        SLO 재조정 (Q-LOAD-9 (a) p99 × 1.5) 적용으로 `prd-phase3/04` §3.1
        갱신 commit `a338716`. 종합 보고서 = `docs/prd-phase4/results/final_2026-05-28.md`.
- [ ] (부록) Raw Redis Streams로 큐 내부 직접 구현 + 추상화 비용 벤치마크

---

## 라이선스

MIT _(예정)_
