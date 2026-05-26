# Handoff Snapshot

> **자동 생성/갱신 파일.** `/save-state` 명령이 갱신하고, `/load-state` 명령이 읽는다.
> 본 파일은 **시점 스냅샷**이지 단일 출처가 아니다. 새 세션은 항상 본 파일을 1차 컨텍스트로 받되, **git/PLAN/테스트로 재검증**한 뒤 작업을 시작한다.

---

## Meta

- **Last updated:** 2026-05-27 (M-OBS-2 완료 직후, **수동 갱신** — `.claude/commands/` 가 이번 세션 도중에 생성되어 슬래시 명령이 미발견 상태. `/save-state` 절차를 명령 본문대로 직접 실행)
- **At commit:** `d5a73df`
- **Branch:** `main`
- **Sync:** `origin/main` 과 동기화 완료(0/0 ahead/behind)
- **Working tree:** clean

---

## Status Overview

- **typecheck:** ✅ 0 errors
- **tests:** ✅ 25 files / **132 passed** / 0 errors / 0 unhandled rejections
- **core boundary grep:** ✅ 0 hits (`webhook|delivery|fastify|receiver|_demo|Payload` 단어 단위; `webhook_relay_*` 접두는 IT-R1 보강 예외)
- **CI workflow:** `.github/workflows/test.yml` (unit + integration 분리, Q-OPS-1 (b))
- **누적 commit:** `a035dce`(초기) 이후 100+ commits

---

## Track 진행도

| 트랙 | 상태 | 비고 |
|------|------|------|
| 1단계 MVP (IT-S1) | ✅ 완료 | M1 Bootstrap, M2 MVP |
| 2단계 장애 복구 (IT-S2~S7) | ✅ 완료 | M3 멱등성, M4 재시도+분류+HMAC, M5 DLQ, M6 stalled 회수, M7 그레이스풀 셧다운 |
| 후속 정산 | ✅ 완료 | Bearer timing-safe, SSRF DNS, PORT=0, DLQ retention, Redis backoff, stalled-loss recovery (IT-S6b), 멱등성×재시도 회귀(IT-S2b), PRD 정합 패치 |
| API/Worker 분리 | ✅ 완료 | `SERVICE_MODE` env + docker compose `api`/`worker` + `--scale worker=N` |
| Handoff 메커니즘 | ✅ 완료 | `/save-state` + `/load-state` + `.claude/state/HANDOFF.md` 3파일 분리. **현 세션에서는 commands 디렉터리 newly created → 재시작 필요.** |
| 3단계 관측성 | 🟡 진행 중 | **M-OBS-1, M-OBS-2 완료**, M-OBS-3~6 대기 |
| 4단계 부하·측정 | ⏳ 미착수 | PRD/PLAN 미작성 |
| 부록 트랙 (Streams Internals) | ⏳ 미착수 | `packages/streams-internals/` 자리만 예약 |

---

## 3단계 마일스톤 진행도

| ID | 이름 | 상태 | 핵심 |
|----|------|------|------|
| **M-OBS-1** | Bootstrap | ✅ 완료 | prom-client 도입, `core/metrics.ts` 진화(Q-ARCH-3 약속 이행), IT-R1 grep `webhook_relay_` 예외, `/metrics` 라우트(api 3000 / worker `WORKER_METRICS_PORT=3001`) |
| **M-OBS-2** | Core Metrics Wiring | ✅ **완료** | C1~C11 카탈로그 PRD §3.1 글자 단위 정합. queue/worker/shutdown 에 비차단 wiring. IT-OBS-1/2/3 + UT(metrics-c-catalog) 그린. 1~2단계 회귀 0건. |
| **M-OBS-3** | Demo Metrics Wiring | ⏳ **다음 작업** | D1~D3 / W1~W4 도메인 메트릭. `demo/handlers/`·`demo/api/` instrumented. IT 시나리오↔메트릭 매트릭스 단언(IT-OBS-4/5/6). |
| **M-OBS-4** | Grafana Provisioning | ⏳ 대기 | 대시보드 4종 + Prometheus/Grafana 컨테이너 + `GIT_COMMIT` 주입(C-MET-7) |
| **M-OBS-5** | SLO + Alerting Rules | ⏳ 대기 | rule YAML 4종(가용성/p99 지연/에러율/DLQ 누적) |
| **M-OBS-6** | Refinement | ⏳ 선택 | 카디널리티 모니터링, 로그·메트릭 라벨 정합 |

PLAN 본문: `docs/plan-phase3/02-m-obs-1-bootstrap.md` ~ `07-m-obs-6-refinement.md`. M-OBS-3 PLAN은 `docs/plan-phase3/04-m-obs-3-demo-metrics.md`.

---

## ⚠️ 사용자 결정 대기 항목

### 1. IT-R1 grep 룰 `http` token deviation (M-OBS-1 인계 — 여전히 미결)

- PLAN(`docs/plan-phase3/02-m-obs-1-bootstrap.md` §4-2)의 `BANNED_TOKENS_SET` 에 `http` 가 명시되어 있으나, `packages/core/src/{shutdown,errors,worker}.ts` 와 `docs/architecture.md` §2 가 이미 `httpServer`/`httpStatus` 식별자를 노출 중. CLAUDE.md §7-5 에 따라 IT-R1 의 `BANNED_TOKENS_SET` 에서 `http` 를 제외 → 보고.
- **선택지 (별도 PR 결정):**
  - **A.** `http` 식별자 제거 (`httpServer` → `serverHandle` 등 rename + architecture.md 갱신 + IT-R1 다시 엄격하게)
  - **B.** PRD 정의 조정 (`prd-phase3/01` §6.1 의 "도메인 식별자" 정의에서 `http` 빼고 현 IT-R1 상태를 정식 정책으로)
- **M-OBS-3 진행에는 영향 없음** (`webhook_relay_*` 접두 + `demo/` 도메인 메트릭만 사용).

### 2. (M-OBS-4 진입 전 결정 필요) `GIT_COMMIT` 주입 전략 — C-MET-7

- M-OBS-2의 C11(`webhook_relay_build_info`) wiring에서 `GIT_COMMIT`/`BUILD_COMMIT` env 부재 시 `"unknown"` fallback.
- M-OBS-4에서 docker-compose 또는 Dockerfile build-arg로 주입 시점을 결정해야 함. 본 PRD/PLAN의 C-MET-7이 가리킴.
- **M-OBS-3 진행에는 영향 없음.**

> 그 외 Q-OBS 15건 모두 2026-05-27 Resolved (provisional default 일괄 채택).

---

## 다음 작업 한 줄

**M-OBS-3 Demo Metrics Wiring** — `docs/plan-phase3/04-m-obs-3-demo-metrics.md` 정독 → 구현 에이전트 디스패치 → IT-OBS-4/5/6 실패 테스트부터 시작. 도메인 메트릭 D1~D3 / W1~W4 를 `demo/handlers/`·`demo/api/` 에 instrumented.

---

## Recent commits (head → 7개)

```
d5a73df feat(demo/bootstrap): wire C11 (build_info) at boot
194fc24 feat(core/shutdown): wire C9 (shutdown_state) + C10 (remaining_jobs)
c3fde1e feat(core/worker): wire C5 (dlq_jobs_total) on DLQ.add path
d2e58c3 feat(core/worker): wire C2/C3/C4/C6 from worker events
5b10674 feat(core/queue): wire C1 (queue_depth) + C7/C8 (redis health) collectors
f9eccca feat(core/metrics): define C1-C11 catalog (queue depth, jobs, dlq, etc.)
deb5b16 test(obs): add failing IT-OBS-1, IT-OBS-2, IT-OBS-3 + UT for core metrics
```

전체 이력은 `git log --oneline -30` 으로 확인.

---

## Notes (자유 메모, /save-state 시 누적/정리)

- **M-OBS-2 결정 메모 (PRD/PLAN 정합 — 별도 결정 아님):**
  - `shutdown_state` seed: `running=1, draining=0, terminated=0` 으로 import 시점 초기화. PRD §4.2 enum + §6.1 core 책임.
  - DLQ 큐 자동 등록: `createDlqQueue` 가 C1 collector pool에 자동 등록되어 `queue` 라벨에 `webhook-delivery-dlq` 등장. PRD §3.1 C1 + §4.2 정합.
  - C2 종단 판정: `worker.on("failed")` 에서 NonRetriable wrap or `attemptsMade >= attempts` 일 때만 inc. 중간 실패는 카운트하지 않음.
  - `build_info` env: `npm_package_version`/`BUILD_VERSION`/`GIT_COMMIT`/`BUILD_COMMIT` 부재 시 `"unknown"` fallback. M-OBS-4에서 주입 결정 필요.

- **M-OBS-1 인계(여전히 적용):**
  - 통합 테스트 setup 파일(`vitest.integration-setup.ts`) 이 BullMQ idle close 의 `Connection is closed.` unhandled rejection 만 정확히 swallow.
  - IT-R1 `http` token deviation 미결정 (위 §1 참조).

- **Handoff 메커니즘 메모:**
  - `.claude/commands/` 가 이번 세션 도중에 생성되어 Claude Code가 watcher 등록 못 함 → 슬래시 명령 `Unknown command` 응답.
  - **사용자가 Claude Code 재시작 예정.** 재시작 후 `/load-state` 호출하면 본 파일을 1차 컨텍스트로 로드.
  - 본 갱신(`/save-state` 절차의 수동 실행)으로 재시작 후 새 세션이 정확한 위치(M-OBS-3 진입 직전)에서 이어받을 수 있음.

- **회귀 가드 누적:**
  - 7개 IT 시나리오(IT-S1~S7) + 보강 IT(IT-S1b, IT-S2b, IT-S6b) + 3단계 IT(IT-OBS-1, IT-OBS-2, IT-OBS-3) + IT-R1(보강) + UT(UT-1~6, ssrf-guard, reconnect-backoff, hmac, classify-error, idempotency-key, config, webhook-create-request-schema, metrics-unit, metrics-c-catalog) 까지 모두 회귀 없음 유지가 모든 후속 마일스톤의 진입 조건.
