# Handoff Snapshot

> **자동 생성/갱신 파일.** `/checkpoint` 명령이 갱신하고, `/resume` 명령이 읽는다.
> 본 파일은 **시점 스냅샷**이지 단일 출처가 아니다. 새 세션은 항상 본 파일을 1차 컨텍스트로 받되, **git/PLAN/테스트로 재검증**한 뒤 작업을 시작한다.

---

## Meta

- **Last updated:** 2026-05-27
- **At commit:** `62edb52`
- **Branch:** `main`
- **Sync:** `origin/main` 과 동기화 완료(0/0 ahead/behind)
- **Working tree:** clean (`.gitignore` 의 `mise.toml` 추가는 이미 commit 됨)

---

## Status Overview

- **typecheck:** ✅ 0 errors
- **tests:** ✅ 21 files / **117 passed** / 0 errors / 0 unhandled rejections
- **core boundary grep:** ✅ 0 hits (`webhook|delivery|fastify|receiver|_demo|Payload` 단어 단위)
- **CI workflow:** `.github/workflows/test.yml` (unit + integration 분리, Q-OPS-1 (b))
- **누적 commit:** `a035dce`(초기) 이후 90+ commits

---

## Track 진행도

| 트랙 | 상태 | 비고 |
|------|------|------|
| 1단계 MVP (IT-S1) | ✅ 완료 | M1 Bootstrap, M2 MVP |
| 2단계 장애 복구 (IT-S2~S7) | ✅ 완료 | M3 멱등성, M4 재시도+분류+HMAC, M5 DLQ, M6 stalled 회수, M7 그레이스풀 셧다운 |
| 후속 정산 | ✅ 완료 | Bearer timing-safe, SSRF DNS, PORT=0, DLQ retention, Redis backoff, stalled-loss recovery (IT-S6b), 멱등성×재시도 회귀(IT-S2b), PRD 정합 패치 |
| API/Worker 분리 | ✅ 완료 | `SERVICE_MODE` env + docker compose `api`/`worker` + `--scale worker=N` |
| 3단계 관측성 | 🟡 진행 중 | M-OBS-1 완료, M-OBS-2~6 대기 |
| 4단계 부하·측정 | ⏳ 미착수 | PRD/PLAN 미작성 |
| 부록 트랙 (Streams Internals) | ⏳ 미착수 | `packages/streams-internals/` 자리만 예약 |

---

## 3단계 마일스톤 진행도

| ID | 이름 | 상태 | 핵심 |
|----|------|------|------|
| **M-OBS-1** | Bootstrap | ✅ 완료 | prom-client 도입, `core/metrics.ts` 진화(Q-ARCH-3 약속 이행), IT-R1 grep `webhook_relay_` 예외, `/metrics` 라우트(api 3000 / worker `WORKER_METRICS_PORT=3001`) |
| **M-OBS-2** | Core Metrics Wiring | ⏳ **다음 작업** | C1~C11 도메인 무관 메트릭 instrumented. 첫 단계는 IT-OBS-1/2/3 실패 테스트 작성 |
| **M-OBS-3** | Demo Metrics Wiring | ⏳ 대기 | D1~D3 / W1~W4 도메인 메트릭 |
| **M-OBS-4** | Grafana Provisioning | ⏳ 대기 | 대시보드 4종 + Prometheus/Grafana 컨테이너 |
| **M-OBS-5** | SLO + Alerting Rules | ⏳ 대기 | rule YAML 4종(가용성/p99 지연/에러율/DLQ 누적) |
| **M-OBS-6** | Refinement | ⏳ 선택 | 카디널리티 모니터링, 로그·메트릭 라벨 정합 |

PLAN 본문: `docs/plan-phase3/02-m-obs-1-bootstrap.md` ~ `07-m-obs-6-refinement.md`.

---

## ⚠️ 사용자 결정 대기 항목

### IT-R1 grep 룰 `http` token deviation (M-OBS-1 인계)

- PLAN(`docs/plan-phase3/02-m-obs-1-bootstrap.md` §4-2)의 `BANNED_TOKENS_SET` 에 `http` 가 명시되어 있으나, `packages/core/src/{shutdown,errors,worker}.ts` 와 `docs/architecture.md` §2 가 이미 `httpServer`/`httpStatus` 식별자를 노출 중. CLAUDE.md §7-5 에 따라 IT-R1 의 `BANNED_TOKENS_SET` 에서 `http` 를 제외 → 보고.
- **선택지 (별도 PR 결정):**
  - **A.** `http` 식별자 제거 (`httpServer` → `serverHandle` 등 rename + architecture.md 갱신 + IT-R1 다시 엄격하게)
  - **B.** PRD 정의 조정 (`prd-phase3/01` §6.1 의 "도메인 식별자" 정의에서 `http` 빼고 현 IT-R1 상태를 정식 정책으로)
- **M-OBS-2 진행에는 영향 없음** (`webhook_relay_*` 접두만 사용).

> 다른 결정 대기 항목은 없음. Q-OBS 15건 모두 2026-05-27 Resolved (provisional default 일괄 채택).

---

## 다음 작업 한 줄

**M-OBS-2 Core Metrics Wiring** — `docs/plan-phase3/03-m-obs-2-core-metrics.md` 정독 → 구현 에이전트 디스패치 → IT-OBS-1/2/3 실패 테스트부터 시작.

---

## Recent commits (head → 5개)

```
62edb52 chore: add /resume slash command for cross-session handoff
859ba48 docs(readme): update roadmap with M-OBS-1 done + service split + test count
94ccdbb fix(test): swallow BullMQ idle-close ioredis rejection globally in IT setup
00706aa fix(test): install unhandled handler at module load for worker metrics IT
d9ca31a fix(test): swallow benign ioredis "Connection is closed" in worker metrics IT
```

전체 이력은 `git log --oneline -30` 으로 확인.

---

## Notes (자유 메모, /checkpoint 시 누적/정리)

- M-OBS-1 PLAN 의 `http` token deviation 외 다른 PLAN-구현 불일치는 없음.
- 통합 테스트 setup 파일(`vitest.integration-setup.ts`) 이 BullMQ idle close 의 `Connection is closed.` unhandled rejection 만 정확히 swallow — 다른 unhandled 는 그대로 throw.
- 7개 IT 시나리오(IT-S1~S7) + 보강 IT(IT-S1b, IT-S2b, IT-S6b) + M-OBS-1 메트릭 라우트 IT + IT-R1 까지 모두 회귀 없음 유지가 모든 후속 마일스톤의 진입 조건.
