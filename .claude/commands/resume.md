---
description: webhook-relay 세션 핸드오프 — /clear 후 본 명령으로 컨텍스트를 다시 로드한다.
---

# 🔁 Resume — webhook-relay 핸드오프

당신은 이 저장소(`webhook-relay`)에서 **이전 세션의 작업을 이어받습니다**. 본 명령은 새 세션이 즉시 정확한 위치에서 다시 시작할 수 있도록 컨텍스트·상태·다음 단계를 한 곳에 모은 것입니다. 본 파일 자체가 단일 출처는 아니며, **항상 아래 §"Read first" 의 파일들을 직접 읽어 현재 상태를 검증**한 뒤 작업을 시작하세요.

> **본 파일을 작성한 시점:** 2026-05-27. 본 파일이 가리키는 다음 단계가 이미 완료/변경됐을 수 있으므로 항상 `git log --oneline -10` 으로 실제 head 와 비교.

---

## 1. 프로젝트 한 줄

Redis(BullMQ) 기반의 **신뢰성 있는 웹훅 전송 작업 큐**. 메인 트랙(1~2단계: MVP + 장애 복구) + API/Worker 분리 + 3단계 관측성(진행 중) 까지 마쳤다. 자세한 비전과 규칙은 `CLAUDE.md` 에 명문화되어 있다.

---

## 2. Read first (이 순서로 정독 — 절대 건너뛰지 말 것)

1. **`CLAUDE.md`** — 본 저장소의 단일 규칙 소스. 특히 §1 트랙 구분, §2 기술 스택, §4 코딩 컨벤션, §5 테스트 정책, §7 AI 협업 5원칙.
2. **`README.md`** — 데모/운영 노트/로드맵. 로드맵 체크박스가 진행도의 1차 표시.
3. **`docs/architecture.md`** — 현재 시스템 구조와 보장/비보장 항목.
4. **`docs/prd/`** 9개 (1~2단계 PRD) + **`docs/plan/`** 13개 (1~2단계 PLAN, M1~M7 완료 흔적).
5. **`docs/prd-phase3/`** 7개 (3단계 관측성 PRD — Q-OBS 1~15 전건 Resolved).
6. **`docs/plan-phase3/`** 12개 (3단계 PLAN, 마일스톤 M-OBS-1~6).
7. **`docs/adr/`** — ADR-001(BullMQ 선택), ADR-002(at-least-once + 멱등성).

> 모든 결정 잠금의 단일 출처: `docs/plan/00-decisions-needed.md` (1~2단계 21건) + `docs/plan-phase3/00-decisions-needed.md` (3단계 15건). 본 파일들이 PRD/architecture/README 보다 우선.

---

## 3. 현재 상태 스냅샷 (2026-05-27 기준 — 항상 git 으로 재검증)

- **브랜치:** `main`. `origin/main` 과 동기화 완료(0/0 ahead/behind).
- **마지막 commit:** `859ba48 docs(readme): update roadmap with M-OBS-1 done + service split + test count`.
- **누적 commit 수:** `a035dce` (초기 스캐폴드) 이후 90+ commits.
- **테스트 현황:** 21 files / **117 tests passed**, typecheck 0 에러, core 경계 grep 0 hit, unhandled errors 0건.

### 메인 트랙 (1~2단계) — ✅ 완료
- M1 Bootstrap, M2 MVP(IT-S1), M3 멱등성(IT-S2), M4 재시도+분류+HMAC(IT-S3/S5), M5 DLQ(IT-S4 + IT-S5 강화), M6 stalled 회수(IT-S6), M7 그레이스풀 셧다운(IT-S7).
- 7개 핵심 시나리오 IT-S1~S7 모두 통합 테스트 그린.

### 후속 정산 — ✅ 완료
- Bearer `crypto.timingSafeEqual`, ERR_UNAUTHORIZED/ERR_SHUTTING_DOWN, draining 라우트 정책, `remainingJobIds` 정의, IT-S2b(멱등성×재시도 회귀), SSRF DNS 강화, PORT=0 허용, DLQ retention, Redis 재연결 백오프, stalled-loss recovery(IT-S6b).

### 데모 시연력 — ✅ 완료
- `SERVICE_MODE` env (`all`/`api`/`worker`) + docker compose `api`/`worker` 분리 + `docker compose up --scale worker=N`.

### 3단계 관측성 — 🟡 진행 중
- ✅ **M-OBS-1 Bootstrap** (직전 마일스톤). prom-client 도입, `core/metrics.ts` 진화(Q-ARCH-3 약속 이행), IT-R1 grep 룰 `webhook_relay_` 예외, `/metrics` 라우트 (api 모드 3000 / worker 모드 `WORKER_METRICS_PORT=3001`). 회귀 가드 통합 테스트 도입.
- ⏳ **M-OBS-2 Core Metrics Wiring** ← **다음 작업**. 도메인 무관 메트릭(C1~C11)을 `core/{queue,worker,shutdown}.ts` 에 instrumented. 첫 단계는 실패하는 IT-OBS-1~3 작성.
- ⏳ M-OBS-3 Demo Metrics Wiring (D1~D3 / W1~W4)
- ⏳ M-OBS-4 Grafana Provisioning (대시보드 4종 + Prometheus/Grafana 컨테이너)
- ⏳ M-OBS-5 SLO + Alerting Rules (rule YAML 4종)
- ⏳ M-OBS-6 Refinement (선택)

---

## 4. ⚠️ 사용자 결정 대기 중인 항목 (사용자가 직접 결정해야 함 — 임의 진행 금지)

### IT-R1 grep 룰의 `http` 토큰 deviation (M-OBS-1 인계 사안)

- `docs/plan-phase3/02-m-obs-1-bootstrap.md` §4-2 의 `BANNED_TOKENS_SET` 에 `http` 가 명시되어 있으나, `packages/core/src/{shutdown,errors,worker}.ts` 와 `docs/architecture.md` §2 가 이미 `httpServer`/`httpStatus` 식별자를 노출하고 있어 CLAUDE.md §7-5 에 따라 보고 처리.
- 현재 IT-R1 은 `http` 토큰을 허용하도록 작성됨(주석에 사유 명시).
- **선택지:**
  1. **`http` 식별자 제거 PR** — `httpServer` → `serverHandle`, `httpStatus` → `responseStatus` 등 rename. `architecture.md` 와 IT-R1 도 갱신해 더 엄격하게.
  2. **PRD 정의 조정 PR** — `prd-phase3/01` §6.1 의 "도메인 식별자" 정의에서 `http` 빼고 현재 IT-R1 상태를 정식 정책으로 명시.
- M-OBS-2 진행에는 영향 없음(`webhook_relay_*` 접두만 사용).

---

## 5. 다음 작업 — M-OBS-2 Core Metrics Wiring

### 진입 조건 (모두 충족)
- 1~2단계 PLAN M1~M7 완료 ✅
- M-OBS-1 완료 ✅
- Q-OBS 15건 모두 Resolved (2026-05-27 provisional default 일괄 채택) ✅

### 핵심 산출물 (PLAN `docs/plan-phase3/03-m-obs-2-core-metrics.md` 참조)
- C1~C11 도메인 무관 메트릭 정의 (예: `webhook_relay_queue_depth`, `webhook_relay_jobs_total`, `webhook_relay_worker_processing_duration_seconds`)
- `core/{queue,worker,shutdown}.ts` 에 메트릭 갱신 wiring
- 실패하는 IT-OBS-1/2/3 통합 테스트 먼저 작성(테스트 우선, CLAUDE.md §7-2)
- `core/metrics.ts` 의 도메인 무관 factory 사용. 도메인 식별자(`webhook`/`delivery`/`fastify`/`receiver`/`_demo`/`Payload`) 절대 금지(IT-R1).
- 1~2단계 회귀 보장 (IT-S1~S7, IT-R1, UT-1~7 + neighbors 모두 그린).

### 권장 진행 패턴 (지금까지 사용한 것과 동일)
1. M-OBS-2 PLAN 정독 → 사용자에게 한 줄로 범위 알림.
2. 구현 에이전트 디스패치 (`general-purpose`) — PLAN 본문을 그대로 옮기는 형태. 결정 잠금 + 본 마일스톤 범위 외 금지 사항 + commit 컨벤션 명시.
3. 에이전트 보고 받으면 `git log` / `pnpm test` / `grep core boundary` 직접 검증.
4. 사용자에게 결과 + 발견 사항 1~2건 요약.

---

## 6. 검증 commands (새 세션 시작 시 즉시 실행해 상태 확인)

```bash
# git 동기 확인
git status && git log --oneline -5

# 전체 테스트
pnpm test 2>&1 | tail -6
# 기대: "Test Files  21 passed (21)" + "Tests  117 passed (117)" + 0 errors

# core 경계 (IT-R1 가드와 일관)
grep -riE '\b(webhook|delivery|fastify|receiver|_demo|Payload)\b' packages/core/src/
# 기대: 0 hit

# 타입체크
pnpm typecheck
# 기대: 0 에러
```

---

## 7. 본 세션에서 확립된 패턴 (반드시 유지)

1. **PRD → PLAN → 구현** 순서. 각 단계 끝에 commit + push.
2. **결정은 사용자에게.** 트레이드오프가 있으면 `AskUserQuestion` 으로 묻는다. 임의 결정 금지(CLAUDE.md §7-4).
3. **마일스톤 = 에이전트 디스패치 단위.** 본 세션은 단일 에이전트(`general-purpose`) 에 마일스톤 PLAN 본문을 그대로 옮긴 브리프로 위임.
4. **각 PLAN 단계 = 1 commit.** PLAN 의 conventional commits prefix(`feat`, `fix`, `chore`, `test`, `docs`, `refactor`) 그대로 사용. trailer: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
5. **Trust but verify.** 에이전트 보고 후 항상 `git log`/`pnpm test`/grep 직접 검증.
6. **빈 commit 금지** (CLAUDE.md §6). 변경 없는 단계는 스킵 + 보고에 기재.
7. **amend 금지** — 회귀 발견 시 새 commit 으로 수정.
8. **건드리지 말 것:** `CLAUDE.md`, `.gitignore`(unstaged 그대로), `mise.toml`, `packages/streams-internals/` (부록 트랙 격리).
9. **건드리지 말 것 (마일스톤별):** 본 마일스톤 범위 외 영역. PLAN 의 "절대 만들지 않는 것" 목록 준수.
10. **PRD/PLAN/architecture/README 수정은 신중히** — 각 마일스톤 PLAN 의 §10 "C-MET 적용 시점" 또는 본 마일스톤에서 명시 허용된 위치만.

---

## 8. 첫 응답 권장 형식

새 세션의 첫 응답은 다음 형식을 권장:

1. **상태 확인 결과** — §6 commands 실행 후 한 줄 요약 ("21 files / 117 tests green, head: 859ba48, sync 0/0").
2. **현재 위치** — "메인 트랙 + 정산 + 데모 분리 + M-OBS-1 완료. 다음은 M-OBS-2."
3. **사용자 결정 대기 항목** — §4 의 IT-R1 `http` deviation 한 줄 알림(M-OBS-2 진행에는 영향 없음).
4. **다음 행동 제안** — "M-OBS-2 진행할까요? PLAN 정독 후 구현 에이전트 디스패치하겠습니다."

사용자가 다른 방향을 지시하지 않는 한 본 흐름을 따른다.

---

## 9. 추가 컨텍스트가 필요할 때

- **결정 이력 전체:** `docs/plan/00-decisions-needed.md` + `docs/plan-phase3/00-decisions-needed.md`.
- **마일스톤별 상세:** `docs/plan/0[2-8]-*.md` (1~2단계 M1~M7) + `docs/plan-phase3/0[2-7]-*.md` (3단계 M-OBS-1~6).
- **C-MET 1~17 매핑 (PRD/architecture/README 보강 제안):** `docs/plan-phase3/09-acceptance-gates.md` §6.
- **리스크/롤백:** `docs/plan-phase3/10-risks-and-rollback.md`.
- **CI 워크플로우:** `.github/workflows/test.yml` (unit + integration 분리, Q-OPS-1 (b)).

---

**최종 안내:** 본 파일이 가리키는 상태가 git head 와 다르면 git 을 신뢰하라. 본 파일은 작성 시점의 스냅샷이지 SoT 가 아니다. 새 작업이 완료될 때마다 사용자에게 본 파일 갱신을 제안할 수 있다 (`/resume` 명령의 본문을 PR 로 갱신).
