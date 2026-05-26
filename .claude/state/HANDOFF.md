# Handoff Snapshot

> **자동 생성/갱신 파일.** `/save-state` 명령이 갱신하고, `/load-state` 명령이 읽는다.
> 본 파일은 **시점 스냅샷**이지 단일 출처가 아니다. 새 세션은 항상 본 파일을 1차 컨텍스트로 받되, **git/PLAN/테스트로 재검증**한 뒤 작업을 시작한다.

---

## Meta

- **Last updated:** 2026-05-27 (M-OBS-3 완료 직후, `/save-state` 슬래시 명령으로 갱신)
- **At commit:** `f060620`
- **Branch:** `main`
- **Sync:** `origin/main` 대비 **ahead 10 / behind 0** — push 필요
- **Working tree:** clean

---

## Status Overview

- **typecheck:** ✅ 0 errors
- **tests:** ✅ **30 files / 159 passed** / 0 errors / 0 unhandled rejections (이전 25/132 → 신규 +5 files / +27 tests)
- **core boundary grep:** ✅ 0 hits (`webhook|delivery|fastify|receiver|_demo|Payload` 단어 단위; `webhook_relay_*` 접두는 IT-R1 보강 예외)
- **CI workflow:** `.github/workflows/test.yml` (unit + integration 분리)
- **누적 commit:** `a035dce`(초기) 이후 110+ commits

---

## Track 진행도

| 트랙 | 상태 | 비고 |
|------|------|------|
| 1단계 MVP (IT-S1) | ✅ 완료 | M1 Bootstrap, M2 MVP |
| 2단계 장애 복구 (IT-S2~S7) | ✅ 완료 | M3 멱등성, M4 재시도+분류+HMAC, M5 DLQ, M6 stalled 회수, M7 그레이스풀 셧다운 |
| 후속 정산 | ✅ 완료 | Bearer timing-safe, SSRF DNS, PORT=0, DLQ retention, Redis backoff, stalled-loss recovery (IT-S6b), 멱등성×재시도 회귀(IT-S2b), PRD 정합 패치 |
| API/Worker 분리 | ✅ 완료 | `SERVICE_MODE` env + docker compose `api`/`worker` + `--scale worker=N` |
| Handoff 메커니즘 | ✅ 완료 | `/load-state` + `/save-state` + `.claude/state/HANDOFF.md` 3파일 분리 |
| 3단계 관측성 | 🟡 진행 중 | **M-OBS-1, M-OBS-2, M-OBS-3 완료**, M-OBS-4~6 대기 |
| 4단계 부하·측정 | ⏳ 미착수 | PRD/PLAN 미작성 |
| 부록 트랙 (Streams Internals) | ⏳ 미착수 | `packages/streams-internals/` 자리만 예약 |

---

## 3단계 마일스톤 진행도

| ID | 이름 | 상태 | 핵심 |
|----|------|------|------|
| **M-OBS-1** | Bootstrap | ✅ 완료 | prom-client 도입, `core/metrics.ts` 진화(Q-ARCH-3 약속 이행), IT-R1 grep `webhook_relay_` 예외, `/metrics` 라우트(api 3000 / worker `WORKER_METRICS_PORT=3001`) |
| **M-OBS-2** | Core Metrics Wiring | ✅ 완료 | C1~C11 카탈로그 PRD §3.1 글자 단위 정합. queue/worker/shutdown 에 비차단 wiring. IT-OBS-1/2/3 + UT(metrics-c-catalog) 그린 |
| **M-OBS-3** | Demo Metrics Wiring | ✅ **완료** | D1~D3 / W1~W4 wiring 완료. 라벨 enum `demo/constants.ts` 단일 출처 잠금. IT-OBS-4/5/6.S1~S7(S6b 포함) + UT(metrics-d-w-catalog) 그린. 1~2단계 회귀 0건 |
| **M-OBS-4** | Grafana Provisioning | ⏳ **다음 작업** | 대시보드 4종 + Prometheus/Grafana 컨테이너 + `GIT_COMMIT` 주입(C-MET-7). IT-OBS-7/8/9 |
| **M-OBS-5** | SLO + Alerting Rules | ⏳ 대기 | rule YAML 4종(가용성/p99 지연/에러율/DLQ 누적). IT-OBS-10 |
| **M-OBS-6** | Refinement | ⏳ 선택 | 카디널리티 모니터링, 로그·메트릭 라벨 정합. IT-OBS-11/12 |

PLAN 본문: `docs/plan-phase3/02-m-obs-1-bootstrap.md` ~ `07-m-obs-6-refinement.md`. M-OBS-4 PLAN은 `docs/plan-phase3/05-m-obs-4-grafana.md`.

---

## ⚠️ 사용자 결정 대기 항목

### 1. IT-R1 grep 룰 `http` token deviation (M-OBS-1 인계 — 여전히 미결)

- PLAN(`docs/plan-phase3/02-m-obs-1-bootstrap.md` §4-2)의 `BANNED_TOKENS_SET` 에 `http` 가 명시되어 있으나, `packages/core/src/{shutdown,errors,worker}.ts` 와 `docs/architecture.md` §2 가 이미 `httpServer`/`httpStatus` 식별자를 노출 중. CLAUDE.md §7-5 에 따라 IT-R1 의 `BANNED_TOKENS_SET` 에서 `http` 를 제외 → 보고.
- **선택지 (별도 PR 결정):**
  - **A.** `http` 식별자 제거 (`httpServer` → `serverHandle` 등 rename + architecture.md 갱신 + IT-R1 다시 엄격하게)
  - **B.** PRD 정의 조정 (`prd-phase3/01` §6.1 의 "도메인 식별자" 정의에서 `http` 빼고 현 IT-R1 상태를 정식 정책으로)
- **M-OBS-4 진행에는 영향 없음** (`webhook_relay_*` 접두 + `docker/` 디렉터리 추가만 사용).

### 2. (M-OBS-4 진입 전 결정 필요) `GIT_COMMIT` 주입 전략 — C-MET-7

- M-OBS-2의 C11(`webhook_relay_build_info`) wiring에서 `GIT_COMMIT`/`BUILD_COMMIT` env 부재 시 `"unknown"` fallback.
- M-OBS-4에서 docker-compose 또는 Dockerfile build-arg로 주입 시점을 결정해야 함. 본 PRD/PLAN의 C-MET-7이 가리킴.
- **선택지 (M-OBS-4 안에서 결정):**
  - **A.** `docker-compose.yml` 의 `build.args` 로 `GIT_COMMIT=$(git rev-parse HEAD)` 주입 + Dockerfile `ARG GIT_COMMIT` → `ENV GIT_COMMIT`. 가장 단순.
  - **B.** docker-compose `build` 단계에서 `.env` 파일 경유. 재현성 강.
  - **C.** runtime env 만 (CI에서 주입). 본 데모 데모에는 과함.

### 3. (M-OBS-4 진입 전 후속 권장) IT-OBS-6.S6 attempts 분포 약화 사유 기록

- M-OBS-3 의 `f060620` 에서 IT-OBS-6.S6 의 attempts 분포 단언이 `+Inf 1건` 으로 약화됨 (BullMQ 5.x stalled recovery 가 `attemptsMade` 를 증분하지 않는 시맨틱).
- IT-OBS-6.S3/4/5 가 결정론적 분포 회귀 가드로 남으나, M-OBS-4 Grafana 패널 설계 시 stalled recovery 케이스의 attempts 분포 해석에 영향.
- **선택지 (M-OBS-4 안에서 처리 또는 별도 PR):**
  - **A.** README 운영 노트(`§ 운영 노트`)에 한 문단 추가.
  - **B.** Grafana 대시보드 `04-shutdown.json` 또는 attempts 패널에 주석/노트 패널 추가.
  - **C.** 둘 다 (권장).

> 그 외 Q-* / Q-OBS-* 전건 Resolved (1~2단계 + 3단계 PRD). `docs/plan/00-decisions-needed.md` / `docs/plan-phase3/00-decisions-needed.md` 에 Status: Open 항목 0건.

---

## 다음 작업 한 줄

**M-OBS-4 Grafana Provisioning** — `docs/plan-phase3/05-m-obs-4-grafana.md` 정독 → IT-OBS-7/8/9 실패 테스트부터 시작. 대시보드 4종(`01-overview.json` ~ `04-shutdown.json`) + provisioning YAML 2종 + `docker-compose.yml` 에 Prometheus/Grafana 서비스 추가. 진입 전 위 결정 대기 §2(`GIT_COMMIT` 주입 전략) 사용자 선택 필요.

---

## Recent commits (head → 10개)

```
f060620 test(obs): adapt IT-OBS-6.S6 to BullMQ stalled recovery semantics
eb89c58 feat(demo/receiver): wire W4 on POST /_demo/receiver
90c6b65 feat(demo/handlers): wire W3 (attempts per job) on completed/failed events
4cd2308 feat(demo/handlers): wire W1/W2 in deliver() with precise label mapping
7006e92 feat(demo/api): wire D3 (request body bytes) via preHandler hook
8c131f9 feat(demo/api): wire D1/D2 via Fastify hooks (onRequest, onResponse)
2df6af1 feat(demo/metrics): define D1-D3 + W1-W4 catalog
6a6e359 feat(demo/constants): lock label enums for D1-D3 + W1-W4
8840864 test(obs): add failing IT-OBS-4, IT-OBS-5, IT-OBS-6.*, UT for demo metrics
8a44c11 docs(claude): require Korean honorifics in user-facing responses
```

전체 이력은 `git log --oneline -30` 으로 확인.

---

## Notes (자유 메모, /save-state 시 누적/정리)

- **M-OBS-3 deviation 메모 (사후 승인됨, 2026-05-27 세션):**
  - **step 6 + step 9 단일 commit 통합 (`4cd2308`):** W1 라벨 매핑을 임시값으로 두는 중간 commit 이 IT-OBS-5/6 회귀 가드를 못 함. 의도적 일탈.
  - **추가 commit `f060620`:** IT-OBS-6.S6 가 BullMQ 5.x stalled recovery 시맨틱(`attemptsMade` 비증분) + raw SharedWorker(C2/W3 wiring 미부착) 두 제약을 부딪침. fixture 안에서만 워커 B를 `createWorker + attachW3Wiring` 으로 구성하도록 우회 + attempts 분포 단언을 `+Inf 1건` 으로 약화 (IT-OBS-6.S3/4/5 의 결정론적 분포 단언이 회귀 가드).
  - **`prom-client` dep 명시화:** `packages/demo/package.json` + `pnpm-lock.yaml`. 워크스페이스 내 `core/` 가 이미 사용 중인 의존성을 `demo/` 에 명시화. CLAUDE.md §2 "이미 있는 의존성" 정합. 신규 패키지 0건.
  - **사용자 지시:** "앞으론 수정 전 멈추고 승인요청" — `~/.claude/projects/-Users-connor-biz-webhook-relay/memory/feedback_no_autonomous_plan_deviation.md` 에 저장. M-OBS-4 이후 모든 서브에이전트 브리프에 강화 표기 의무.

- **M-OBS-2 결정 메모 (PRD/PLAN 정합 — 별도 결정 아님, M-OBS-4 진입 시 참조용):**
  - `shutdown_state` seed: `running=1, draining=0, terminated=0` 으로 import 시점 초기화. PRD §4.2 enum + §6.1 core 책임.
  - DLQ 큐 자동 등록: `createDlqQueue` 가 C1 collector pool에 자동 등록되어 `queue` 라벨에 `webhook-delivery-dlq` 등장. PRD §3.1 C1 + §4.2 정합.
  - C2 종단 판정: `worker.on("failed")` 에서 NonRetriable wrap or `attemptsMade >= attempts` 일 때만 inc. 중간 실패는 카운트하지 않음.
  - `build_info` env: `npm_package_version`/`BUILD_VERSION`/`GIT_COMMIT`/`BUILD_COMMIT` 부재 시 `"unknown"` fallback. **M-OBS-4 에서 주입 결정 필요 (위 §2).**

- **M-OBS-1 인계 (여전히 적용):**
  - 통합 테스트 setup 파일(`vitest.integration-setup.ts`) 이 BullMQ idle close 의 `Connection is closed.` unhandled rejection 만 정확히 swallow.
  - IT-R1 `http` token deviation 미결정 (위 §1 참조).

- **세션 패치 (2026-05-27):**
  - **CLAUDE.md §7-6 추가 (`8a44c11`):** 사용자 응답은 한국어 존대말 강제. 코드/커밋/문서 본문 평서체는 유지. memory `feedback_korean_honorifics.md` 동기.
  - **자율 일탈 사전 승인 규칙:** memory `feedback_no_autonomous_plan_deviation.md` 저장. CLAUDE.md §7-4 의 운영 강도 강화.

- **Handoff 메커니즘 메모:**
  - 정확한 슬래시 명령 이름: `/load-state`, `/save-state` (어순 주의). `.claude/commands/load-state.md` · `save-state.md` 파일 이름이 그대로 등록명.

- **회귀 가드 누적:**
  - 7개 IT 시나리오(IT-S1~S7) + 보강 IT(IT-S1b, IT-S2b, IT-S6b) + 3단계 IT(IT-OBS-1, IT-OBS-2, IT-OBS-3, IT-OBS-4, IT-OBS-5, IT-OBS-6.S1~S7 포함 S6b) + IT-R1(보강) + UT(UT-1~6, ssrf-guard, reconnect-backoff, hmac, classify-error, idempotency-key, config, webhook-create-request-schema, metrics-unit, metrics-c-catalog, metrics-d-w-catalog) 까지 모두 회귀 없음 유지가 모든 후속 마일스톤의 진입 조건.
