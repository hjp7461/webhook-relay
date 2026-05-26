# Handoff Snapshot

> **자동 생성/갱신 파일.** `/save-state` 명령이 갱신하고, `/load-state` 명령이 읽는다.
> 본 파일은 **시점 스냅샷**이지 단일 출처가 아니다. 새 세션은 항상 본 파일을 1차 컨텍스트로 받되, **git/PLAN/테스트로 재검증**한 뒤 작업을 시작한다.

---

## Meta

- **Last updated:** 2026-05-27 (M-OBS-6 완료 직후, **3단계 PLAN 전건 완료**)
- **At commit:** `339ea8d`
- **Branch:** `main`
- **Sync:** `origin/main` 동기 완료 (0/0 ahead/behind)
- **Working tree:** clean

---

## Status Overview

- **typecheck:** ✅ 0 errors
- **tests:** ✅ **36 files / 185 passed** / 0 errors / 0 unhandled rejections (이전 25/132 → 신규 +11 files / +53 tests, 3단계 IT-OBS-1~12 + UT 누적)
- **core boundary grep:** ✅ 0 hits (`webhook|delivery|fastify|receiver|_demo|Payload` 단어 단위; `webhook_relay_*` 접두는 IT-R1 보강 예외)
- **CI workflow:** `.github/workflows/test.yml` (unit + integration 분리)
- **누적 commit:** `a035dce`(초기) 이후 130+ commits

---

## 본 저장소 워크플로우 (중요 — 다음 세션이 혼동하지 않도록 명시)

- **단독 개발 + main 직접 작업 + push** 패턴. feature 브랜치 없음.
- `/save-state` 가 `git push origin main` 까지를 표준 절차로 잠금.
- **PRD/PLAN 의 "별도 PR" 표현 = "별도 작업 단위/commit 시리즈로 후속 처리"** 라고 읽는다. 형식적 PR 브랜치 만들지 않는다. multi-dev 모델 어휘를 그대로 가져온 표현일 뿐.

---

## Track 진행도

| 트랙 | 상태 | 비고 |
|------|------|------|
| 1단계 MVP (IT-S1) | ✅ 완료 | M1 Bootstrap, M2 MVP |
| 2단계 장애 복구 (IT-S2~S7) | ✅ 완료 | M3 멱등성, M4 재시도+분류+HMAC, M5 DLQ, M6 stalled 회수, M7 그레이스풀 셧다운 |
| 후속 정산 | ✅ 완료 | Bearer timing-safe, SSRF DNS, PORT=0, DLQ retention, Redis backoff, stalled-loss recovery (IT-S6b), 멱등성×재시도 회귀(IT-S2b), PRD 정합 패치 |
| API/Worker 분리 | ✅ 완료 | `SERVICE_MODE` env + docker compose `api`/`worker` + `--scale worker=N` |
| Handoff 메커니즘 | ✅ 완료 | `/load-state` + `/save-state` + `.claude/state/HANDOFF.md` 3파일 분리 |
| 3단계 관측성 | ✅ **완료** | M-OBS-1~6 전건. C-MET 표 `09-acceptance-gates.md` §6 최종 확정 |
| 4단계 부하·측정 | ⏳ 미착수 | PRD/PLAN 미작성 |
| 부록 트랙 (Streams Internals) | ⏳ 미착수 | `packages/streams-internals/` 자리만 예약 |

---

## 3단계 마일스톤 진행도 (전건 완료)

| ID | 이름 | 상태 | 핵심 |
|----|------|------|------|
| **M-OBS-1** | Bootstrap | ✅ | prom-client 도입, `core/metrics.ts` 진화, IT-R1 grep `webhook_relay_` 예외, `/metrics` 라우트 골격 |
| **M-OBS-2** | Core Metrics Wiring | ✅ | C1~C11 카탈로그 PRD §3.1 글자 단위 정합. queue/worker/shutdown 비차단 wiring |
| **M-OBS-3** | Demo Metrics Wiring | ✅ | D1~D3 / W1~W4 wiring. 라벨 enum `demo/constants.ts` 단일 출처 잠금. IT-OBS-4/5/6.S1~S7+S6b |
| **M-OBS-4** | Grafana Provisioning | ✅ | 대시보드 4종 + provisioning + Dockerfile `ARG GIT_COMMIT` (C-MET-7 일부) + compose prometheus/grafana 서비스 + worker `expose: ["3001"]` (호스트 충돌 회피, 사용자 사후 검토 항목) + README 운영 노트 한 문단 |
| **M-OBS-5** | SLO + Alerting Rules | ✅ | rule YAML 4종 (availability/latency/dlq/platform). alert 10종. IT-OBS-10 정규식 단언 (PLAN 권장, 새 의존성 0건). fix → revert → 정교한 정규식 재정착 (9 commits 시퀀스) |
| **M-OBS-6** | Refinement | ✅ | IT-OBS-11 카디널리티 가드 + IT-OBS-12 로그/메트릭 라벨 정합. step 2 (매직 스트링 점검) 0건 발견 → 스킵. C-MET 표 `09-acceptance-gates.md` §6 최종 확정 |

PLAN 본문: `docs/plan-phase3/02-m-obs-1-bootstrap.md` ~ `07-m-obs-6-refinement.md`. 최종 게이트: `09-acceptance-gates.md` §5.

---

## ⚠️ 사용자 결정 대기 항목

`docs/plan/00-decisions-needed.md` / `docs/plan-phase3/00-decisions-needed.md` 의 `Status: Open` 항목은 **0건** (전건 Resolved 2026-05-27). 단, 본 세션 누적으로 다음 사후 검토 항목이 남아 있다:

### 1. IT-R1 grep 룰 `http` token deviation (M-OBS-1 인계 — 여전히 미결)

- PLAN(`docs/plan-phase3/02-m-obs-1-bootstrap.md` §4-2) 의 `BANNED_TOKENS_SET` 에 `http` 가 명시되어 있으나, `packages/core/src/{shutdown,errors,worker}.ts` 와 `docs/architecture.md` §2 가 이미 `httpServer`/`httpStatus` 식별자를 노출 중. IT-R1 의 `BANNED_TOKENS_SET` 에서 `http` 를 제외한 상태로 머무름.
- **선택지:**
  - **A.** `http` 식별자 제거 (`httpServer` → `serverHandle` 등 rename + architecture.md 갱신 + IT-R1 다시 엄격하게)
  - **B.** PRD 정의 조정 (`prd-phase3/01` §6.1 의 "도메인 식별자" 정의에서 `http` 빼고 현 IT-R1 상태를 정식 정책으로)

### 2. Worker 호스트 포트 매핑 재확인 (M-OBS-4 후속)

- 현재 `docker-compose.yml` 의 worker 서비스는 `expose: ["3001"]` 만 사용 (호스트 매핑 없음). 사유: Grafana 가 호스트 3001 차지 + `--scale worker=N` 호스트 포트 충돌 회피.
- 결과: Prometheus 가 컨테이너 네트워크로 `worker:3001` scrape 가능하나, 운영자가 호스트에서 직접 `curl http://localhost:3001/metrics` 불가.
- **선택지:** A. 현 상태 유지 (보수적, scale 호환), B. 호스트 매핑 추가 (운영자 디버깅 편의, scale 시 첫 인스턴스만 매핑)

### 3. M-OBS-4 step 10 commit (`55fa8bf`) 사후 검토

- `packages/demo/src/api/metrics.ts` 주석 7줄 보강 commit (코드 동작 무변경, IT-OBS-9 cross-link 명시). 빈 commit 회피 + step-1-commit 원칙 정합.
- **선택지:** A. 현 상태 유지, B. revert (대안: 단계 자체 스킵 + 보고 기재)

---

## 다음 작업 한 줄

**3단계 PLAN 완료. 사용자가 다음 방향을 선택해야 한다.** 선택지:

- (a) **별도 작업 단위 후속 처리 (PRD/PLAN 의 "별도 PR" 표기 정합)** — C-MET-1/3/4/5/6/9/10/11/13/14/15/16/17 총 **13건**. 본 저장소는 main 직접 작업이므로 commit 시리즈로 분리 처리. `09-acceptance-gates.md` §8 의 권장 순서: architecture.md → PRD `prd/04-06` → README → CLAUDE.md §3 → `prd/03-test-strategy.md`. 묶어서 1~3 commit 시리즈로 처리 권장.
- (b) **4단계 PRD/PLAN 작성** — 부하 시나리오, p50/p99 측정, 수평 확장 SLO 실측 갱신 (3단계 잠정값 → 실측).
- (c) **부록 트랙 진입** — `packages/streams-internals/` 활성화, Raw Redis Streams 직접 구현, BullMQ 대비 추상화 비용 벤치마크.
- (d) **위 §1~§3 사후 검토 항목 처리**.
- (e) **로컬 sanity (수동)** — `docker compose up` 후 Grafana 4 대시보드 + Prometheus 4 rule group 자동 등장 확인.

---

## Recent commits (head → 10개)

```
339ea8d docs(plan-phase3): mark C-MET status table as final
5e126e5 test(obs): add IT-OBS-12 (log/metric naming consistency)
061c7a6 test(obs): add failing IT-OBS-11 (cardinality guard)
d3c8581 test(obs): tighten IT-OBS-10 runbook_url regex to allow YAML inline comments
41cf9dc Revert "fix(test/obs): strip YAML inline comment from runbook_url RHS"
179fe47 chore(docker): remove .gitkeep from prometheus/rules/
6f05208 fix(test/obs): strip YAML inline comment from runbook_url RHS
f96525e feat(docker/prometheus/rules): add webhook-relay-platform.yaml
c4f1b17 feat(docker/prometheus/rules): add webhook-relay-dlq.yaml
efa7fc5 feat(docker/prometheus/rules): add webhook-relay-latency.yaml
```

전체 이력은 `git log --oneline -50` 으로 확인.

---

## Notes (자유 메모, /save-state 시 누적/정리)

### 본 세션 (2026-05-27) 누적 사항

- **CLAUDE.md §7-6 추가 (`8a44c11`):** 사용자 응답은 한국어 존대말 강제. 코드/커밋/문서 본문 평서체는 유지. memory `feedback_korean_honorifics.md` 동기.
- **자율 일탈 사전 승인 규칙 도입:** memory `feedback_no_autonomous_plan_deviation.md` 저장. CLAUDE.md §7-4 운영 강도 강화. 모든 후속 서브에이전트 브리프에 명시 의무.
- **M-OBS-3 자율 일탈 3건 사후 승인:** (1) step 6+9 단일 commit 통합 (`4cd2308`), (2) 추가 commit `f060620` (IT-OBS-6.S6 BullMQ stalled recovery 시맨틱 우회 + attempts 분포 `+Inf 1건` 으로 약화), (3) `prom-client` dep 명시화 (워크스페이스 내 기존 의존성).
- **M-OBS-4 자율 결정 2건 (사후 검토 항목):** step 10 commit (`55fa8bf`) 주석만 보강, worker `expose` 포트.
- **M-OBS-5 fix → revert → 재정착 시퀀스:** `6f05208` fix → `41cf9dc` revert → `d3c8581` 정교한 정규식 (`/^\s*runbook_url\s*:\s*(""|''|)\s*(?:#.*)?$/m`) 으로 재정착. history 보존 (CLAUDE.md amend 금지 준수).
- **M-OBS-6 자율 일탈 사전 승인 규칙 준수:** step 2 (매직 스트링 점검) 0건 발견 → 스킵 + 보고 명시. 트리거 0건.

### M-OBS-3 결정 메모 (PRD/PLAN 정합)

- `shutdown_state` seed: `running=1, draining=0, terminated=0` 으로 import 시점 초기화. PRD §4.2 enum + §6.1 core 책임.
- DLQ 큐 자동 등록: `createDlqQueue` 가 C1 collector pool 에 자동 등록. `queue` 라벨에 `webhook-delivery-dlq` 등장.
- C2 종단 판정: `worker.on("failed")` 에서 NonRetriable wrap or `attemptsMade >= attempts` 일 때만 inc. 중간 실패는 카운트하지 않음.

### M-OBS-1 인계 (여전히 적용)

- 통합 테스트 setup 파일(`vitest.integration-setup.ts`) 이 BullMQ idle close 의 `Connection is closed.` unhandled rejection 만 정확히 swallow.
- IT-R1 `http` token deviation 미결정 (위 §1 참조).

### Handoff 메커니즘 메모

- 정확한 슬래시 명령 이름: `/load-state`, `/save-state` (어순 주의). `.claude/commands/load-state.md` · `save-state.md` 파일 이름이 그대로 등록명.

### 회귀 가드 누적

- 7개 IT 시나리오 (IT-S1~S7) + 보강 (IT-S1b, IT-S2b, IT-S6b) + 3단계 IT (IT-OBS-1~12) + IT-R1(보강) + UT (UT-1~6, ssrf-guard, reconnect-backoff, hmac, classify-error, idempotency-key, config, webhook-create-request-schema, metrics-unit, metrics-c-catalog, metrics-d-w-catalog) — 모두 회귀 없음 유지가 후속 작업의 진입 조건.

### M-OBS-4/5 의 추가 변경 (사용자 사전 승인 후속 반영)

- `packages/demo/Dockerfile` `ARG GIT_COMMIT=unknown` + `ENV GIT_COMMIT=$GIT_COMMIT`. 로컬 빌드: `GIT_COMMIT=$(git rev-parse HEAD) docker compose build`.
- `docker-compose.yml` `api`/`worker` 서비스 `build.args.GIT_COMMIT: ${GIT_COMMIT:-unknown}`.
- `README.md` 운영 노트에 "BullMQ stalled recovery 와 attempts-per-job 메트릭" 한 문단 추가 (M-OBS-3 의 IT-OBS-6.S6 약화 사유 cross-link).
