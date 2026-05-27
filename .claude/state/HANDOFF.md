# Handoff Snapshot

> **자동 생성/갱신 파일.** `/save-state` 명령이 갱신하고, `/load-state` 명령이 읽는다.
> 본 파일은 **시점 스냅샷**이지 단일 출처가 아니다. 새 세션은 항상 본 파일을 1차 컨텍스트로 받되, **git/PLAN/테스트로 재검증**한 뒤 작업을 시작한다.

---

## Meta

- **Last updated:** 2026-05-27 (4단계 PRD + PLAN 묶음 전건 closeout, C-LOAD-1~15 사후 승인)
- **At commit:** `fba5258`
- **Branch:** `main`
- **Sync:** `origin/main` 0/0 동기 완료
- **Working tree:** clean (HANDOFF.md 갱신 stage 예정 외)

---

## Status Overview

- **typecheck:** ✅ 0 errors
- **tests:** ✅ **36 files / 185 passed** (3차 검증 통과 — 직전 2회는 IT-S7 + IT-OBS-9 spawn timeout flaky, 본 세션 §Notes 의 flaky 관찰 참조)
- **core boundary grep:** ✅ 0 hits
- **`docker compose config`:** ✅ pass (직전 검증)
- **CI workflow:** `.github/workflows/test.yml` (unit + integration 분리)
- **누적 commit:** `a035dce`(초기) 이후 165+ commits

---

## 본 저장소 워크플로우

- **단독 개발 + main 직접 작업 + push** 패턴. feature 브랜치 없음.
- `/save-state` 가 `git push origin main` 까지를 표준 절차로 잠금.
- **PRD/PLAN 의 "별도 PR" 표현 = "별도 작업 단위/commit 시리즈로 후속 처리"** 로 읽는다.

---

## Track 진행도

| 트랙 | 상태 | 비고 |
|------|------|------|
| 1단계 MVP (IT-S1) | ✅ 완료 | M1 Bootstrap, M2 MVP |
| 2단계 장애 복구 (IT-S2~S7) | ✅ 완료 | M3~M7 |
| 후속 정산 | ✅ 완료 | Bearer timing-safe, SSRF DNS, PORT=0, DLQ retention, Redis backoff, stalled-loss recovery, 멱등성×재시도 회귀, PRD 정합 패치 |
| API/Worker 분리 | ✅ 완료 | `SERVICE_MODE` + docker compose `api`/`worker` + `--scale worker=N` |
| Handoff 메커니즘 | ✅ 완료 | `/load-state` + `/save-state` + `.claude/state/HANDOFF.md` |
| 3단계 관측성 | ✅ 완료 | M-OBS-1~6 전건 + C-MET-1~17 17건 정착 + 결정 대기 §1~§3 잠금 |
| **4단계 부하·측정 (PRD 묶음)** | ✅ 완료 | `docs/prd-phase4/` 8 파일 + Q-LOAD-1~13 전건 Resolved |
| **4단계 부하·측정 (PLAN 묶음)** | ✅ **완료** | `docs/plan-phase4/` 12 파일 (outline 3 + 세부 9) + C-LOAD-1~15 카탈로그 정착 |
| 4단계 구현 (k6 시나리오 + 측정) | ⏳ **다음 작업** | M-LOAD-1 부터 진입 가능 |
| 부록 트랙 (Streams Internals) | ⏳ 미착수 | `packages/streams-internals/` 자리만 예약 |

---

## 4단계 PRD + PLAN 묶음 구성

### `docs/prd-phase4/` (8 파일, 2026-05-27 closeout)

| 파일 | 한 줄 |
|------|-------|
| README + 00-decisions-needed + 00-overview | 진입점 · Goals/Non-Goals · Q-LOAD-1~13 잠금 |
| 01-load-profiles | LP-1~4 카탈로그 + 4가지 차원(R/P/T/W) + IT-S 매핑 |
| 02-measurement-tools-and-environment | k6 + cgroup + 메타데이터 + 결과 보존 + 회귀 가드 |
| 03-targets-and-rebaseline | 측정 SLI 13개 + 8단계 프로토콜 + SLO 재조정 규칙 |
| 04-horizontal-scaling | SLO-H-1/H-2 + Redis knee point + HA 트리거 |
| 05-out-of-scope-and-open-questions | 비목표 + Q-LOAD 통합 + 1~3단계 정합 |

### `docs/plan-phase4/` (12 파일, 2026-05-27 closeout)

| 파일 | 한 줄 |
|------|-------|
| README + 00-decisions-needed + 01-milestones | 진입점 · M-LOAD-1~6 + 의존 그래프 |
| 02-m-load-1-bootstrap | k6 서비스 + cgroup + 메타데이터 헬퍼 (337 lines) |
| 03-m-load-2-lp1-baseline | 첫 결과 보고서 commit 사이클 (332 lines) |
| 04-m-load-3-lp2-nominal | SLO 잠정값 분포 + IT-S 부하 변형 (339 lines) |
| 05-m-load-4-lp3-lp4 | knee point 1차 탐색 (308 lines) |
| 06-m-load-5-horizontal-scaling | SLO-H-1/H-2 검증 (313 lines) |
| 07-m-load-6-redis-knee-and-final-report | 최종 보고서 + SLO PR 인계 (422 lines) |
| 08-cross-cutting | 8 횡단 정책 + C-LOAD 매핑 (347 lines) |
| 09-acceptance-gates | Exit Gate + C-LOAD-1~15 표 (396 lines) |
| 10-risks-and-rollback | R-LOAD-001~010 + 롤백 (335 lines) |

---

## Q-LOAD-1~13 잠금 표 (단일 출처: `prd-phase4/00-decisions-needed.md`)

| Q-ID | 결정 |
|------|------|
| Q-LOAD-1 | k6 (Grafana Labs) |
| Q-LOAD-2 | 로컬 + cgroup 격리 |
| Q-LOAD-3 | PRD 묶음만 (3단계 패턴) |
| Q-LOAD-4 | Redis 단일 인스턴스 한계 식별 |
| Q-LOAD-5 | 정적 부하만 (카오스 제외) |
| Q-LOAD-6 | RPS 중도 셋 (10 / 100 / 500 / 100→1000) |
| Q-LOAD-7 | 페이로드 운영 평균 (80% / 15% / 5%) |
| Q-LOAD-8 | LP-1/4 짧은 (~6.5분), LP-2/3 sustained (~32분) |
| Q-LOAD-9 | p99 × 1.5 (Google SRE 일반 권고) |
| Q-LOAD-10 | α = 0.8 (수평 확장 처리량 선형성) |
| Q-LOAD-11 | β = 1.2 (수평 확장 p99 안정성) |
| Q-LOAD-12 | Markdown 표 (`docs/prd-phase4/results/`) |
| Q-LOAD-13 | IT-LOAD-N 없음 (CI 시간 부담 0) |

---

## ⚠️ 사용자 결정 대기 항목

`docs/plan/00-decisions-needed.md` / `docs/plan-phase3/00-decisions-needed.md` /
`docs/prd-phase4/00-decisions-needed.md` / `docs/plan-phase4/00-decisions-needed.md`
의 `Status: Open` 항목은 **0건**. 본 세션 누적 결정 대기 (§1~§3) 도 모두 잠금 완료.

> **잔여 결정 대기 0건.** 다음 세션은 어떤 항목 위에서도 새 결정을 받을 필요 없이
> 작업 진입 가능.

---

## 다음 작업 한 줄

**M-LOAD-1 Bootstrap** — `docs/plan-phase4/02-m-load-1-bootstrap.md` §4 단계 1
(`docker-compose.yml` 에 `k6` 서비스 추가, profile=measure) 부터 진입. 본 PLAN
잠금된 결정 위에서 실제 구현 commit 시리즈 시작. 본 마일스톤은 측정 미실행 —
부트스트랩(k6 서비스 + `docker/k6/` 디렉터리 + cgroup + 메타데이터 헬퍼) 만.

---

## Recent commits (head → 10개)

```
fba5258 docs(plan-phase4/10): risks & rollback — 10 핵심 리스크 + 롤백 전략 + 측정 환경 가드
283919a docs(plan-phase4/09): acceptance gates — 마일스톤별 Exit Gate + 최종 게이트 + C-LOAD 매핑
db9f0b2 docs(plan-phase4/08): cross-cutting — 측정 호스트 메타데이터 강제 + 결과 commit + Redis flush + cgroup 호환성 + ±5% 처리 + SLO 갱신 PR 정합
eb6adab docs(plan-phase4/07): M-LOAD-6 Redis knee + 최종 보고서 + SLO 임계 갱신 PR 인계
829554d docs(plan-phase4/06): M-LOAD-5 수평 확장 — N ∈ {1,2,5,10} × LP-2 + SLO-H-1/H-2 검증
cd0faf1 docs(plan-phase4/05): M-LOAD-4 LP-3 stress + LP-4 spike — knee point 1차 탐색
b44999d docs(plan-phase4/04): M-LOAD-3 LP-2 nominal sustained — SLO 잠정값 분포 + IT-S 부하 변형
7a22f98 docs(plan-phase4/03): M-LOAD-2 LP-1 baseline 측정 — 첫 결과 보고서 commit 사이클
d746029 docs(plan-phase4/02): M-LOAD-1 Bootstrap — k6 서비스 + 디렉터리 골격 + 메타데이터 헬퍼
ba4c613 docs(plan-phase4): bootstrap PLAN 묶음 outline + M-LOAD-1~6 마일스톤 분해
```

전체 이력은 `git log --oneline -30` 으로 확인.

---

## Notes (자유 메모, /save-state 시 누적/정리)

### 4단계 PRD + PLAN closeout (2026-05-27)

- **4단계 PRD 묶음 9 commits** (`34f81d5` → `503452b`): outline → 사전 잠금 5건 → 00-overview → 본문 5 파일(서브에이전트) → 후속 결정 8건 closeout.
- **4단계 PLAN 묶음 10 commits** (`ba4c613` → `fba5258`): outline 1건 + 세부 9 파일(서브에이전트).
- **C-LOAD-1~15 카탈로그 사후 승인:** 세부 9 파일 작성 중 서브에이전트가 3단계 C-MET 패턴을 모방해 자율 도입. 사용자가 사후 승인(2026-05-27). `09-acceptance-gates.md` §8 표가 단일 출처. ✅ 본 PLAN 내 적용 2건 (C-LOAD-3 k6 서비스, C-LOAD-5 .env.example K6_*) + 🔵 M-LOAD-6 SLO PR 트리거 3건 (C-LOAD-6/7/8) + ❌ PLAN closeout 후 별도 PR 10건 (C-LOAD-1/2/4/9/10/11/12/13/14/15).

### IT-S7 / IT-OBS-9 spawn timeout flaky 관찰 (2026-05-27)

- `/save-state` 검증 시 IT-S7 (case A/B) + IT-OBS-9 가 1회차 / 2회차 실패, 3회차 통과.
- 실패 메시지: `child server did not start within 8000ms` (stdout/stderr 모두 비어 있음) + `fetch ECONNRESET`.
- 직전 검증 2회(`/save-state` 시점 ~ `0fe6850`)는 모두 36/185 통과.
- 본 세션 commit 들은 `.md` 만 변경 — 코드 영향 0건.
- 원인 추정: 호스트 시스템 부하/디스크 IO/Node.js 초기 로드 지연 → `spawn-server.ts` 의 8000ms timeout 한계 근접 (3차 통과 시 IT-S7 case A 가 8539ms 까지 걸림).
- **후속 권장 (별도 commit 시리즈 / 별도 결정):** `spawn-server.ts` 의 readyTimeoutMs 를 8000ms → 15000ms 또는 호스트 부하 감지 후 자동 backoff 로 보강. 다만 본 세션의 4단계 PRD/PLAN closeout 범위 밖.

### 본 세션 이전 누적 사항 (3단계 PLAN closeout)

- CLAUDE.md §7-6 존대말 (`8a44c11`), 자율 일탈 사전 승인 규칙 memory.
- M-OBS-1~6 + C-MET-1~17 17건.
- 결정 대기 §1~§3 잠금 (IT-R1 `http` PRD §6.1 조정, worker `ports:["3001:3001"]` + Grafana `ports:["3002:3000"]`, step 10 commit 유지).

### Handoff 메커니즘 메모

- 정확한 슬래시 명령 이름: `/load-state`, `/save-state` (어순 주의).

### 회귀 가드 누적 (3단계까지)

- **단위 (UT):** UT-1~6 + 보강 (metrics-c-catalog, metrics-d-w-catalog 등).
- **1~2단계 IT:** IT-S1~S7 + 보강(IT-S1b, IT-S2b, IT-S6b).
- **3단계 IT:** IT-OBS-1~12, IT-R1(보강).
- 모두 그린 유지가 후속 작업의 진입 조건. 단 IT-S7 + IT-OBS-9 의 spawn timeout flaky 관찰 (위 참조).

### 4단계 진입 후 추가될 회귀 가드

- **PRD `02` §8 Q-LOAD-13 결정 — IT-LOAD-N 도입 0건.** 부하 회귀는 측정 + 사람 검토 + `docs/prd-phase4/results/` commit 으로 추적.

### 후속 정리 항목 (PLAN closeout 후 별도 commit 시리즈 / 별도 결정)

- C-LOAD-1/2/4/9/10/11/12/13/14/15 (10건) — architecture.md / README / CLAUDE.md / 신규 PRD 자리 갱신.
- `spawn-server.ts` readyTimeoutMs 보강 (flaky 관찰 cross-link).
