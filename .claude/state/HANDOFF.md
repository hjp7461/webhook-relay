# Handoff Snapshot

> **자동 생성/갱신 파일.** `/save-state` 명령이 갱신하고, `/load-state` 명령이 읽는다.
> 본 파일은 **시점 스냅샷**이지 단일 출처가 아니다. 새 세션은 항상 본 파일을 1차 컨텍스트로 받되, **git/PLAN/테스트로 재검증**한 뒤 작업을 시작한다.

---

## Meta

- **Last updated:** 2026-05-27 (4단계 PRD 묶음 closeout + Q-LOAD-1~13 전건 잠금)
- **At commit:** `503452b`
- **Branch:** `main`
- **Sync:** `origin/main` 0/0 동기 완료
- **Working tree:** clean (HANDOFF.md 갱신 stage 예정 외)

---

## Status Overview

- **typecheck:** ✅ 0 errors (직전 검증, 본 세션은 .md 만 변경)
- **tests:** ✅ **36 files / 185 passed** / 0 errors / 0 unhandled rejections (직전 검증)
- **core boundary grep:** ✅ 0 hits
- **`docker compose config`:** ✅ pass (직전 검증)
- **CI workflow:** `.github/workflows/test.yml` (unit + integration 분리)
- **누적 commit:** `a035dce`(초기) 이후 150+ commits

---

## 본 저장소 워크플로우

- **단독 개발 + main 직접 작업 + push** 패턴. feature 브랜치 없음.
- `/save-state` 가 `git push origin main` 까지를 표준 절차로 잠금.
- **PRD/PLAN 의 "별도 PR" 표현 = "별도 작업 단위/commit 시리즈로 후속 처리"** 라고 읽는다.

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
| **4단계 부하·측정 (PRD 묶음)** | ✅ **완료** | `docs/prd-phase4/` 8 파일 (README + 00~05) + Q-LOAD-1~13 전건 Resolved |
| 4단계 PLAN 묶음 | ⏳ 다음 | `docs/plan-phase4/` 미작성. M-LOAD-N 마일스톤 분해 시작 가능 |
| 4단계 구현 (k6 시나리오 + 측정) | ⏳ 미착수 | PLAN 묶음 완료 후 |
| 부록 트랙 (Streams Internals) | ⏳ 미착수 | `packages/streams-internals/` 자리만 예약 |

---

## 4단계 PRD 묶음 구성 (`docs/prd-phase4/`)

| 파일 | 한 줄 |
|------|-------|
| `README.md` | 묶음 진입점 · 1~3단계 PRD 와의 정합 · 명시적 비목표 |
| `00-decisions-needed.md` | Q-LOAD-1~13 추적 (🔴 5건 + 🟡 8건 전건 Resolved) |
| `00-overview.md` | Goals G4.1~G4.8 / Non-Goals N4.1~N4.7 / 페르소나 / AC4.0~AC4.7 / 용어집 |
| `01-load-profiles.md` | LP-1~LP-4 카탈로그 + 4가지 차원(R/P/T/W) + IT-S 매핑 |
| `02-measurement-tools-and-environment.md` | k6 잠금 + cgroup 격리 + 메타데이터 + 결과 보존 + 회귀 가드 |
| `03-targets-and-rebaseline.md` | 측정 SLI 13개 + 8단계 프로토콜 + SLO 재조정 규칙 |
| `04-horizontal-scaling.md` | SLO-H-1/H-2 + Redis knee point + HA 트리거 |
| `05-out-of-scope-and-open-questions.md` | 비목표 cross-link + Q-LOAD 통합 + 1~3단계 정합 검증 |

총 1,841 lines (본문 5 파일) + outline.

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
`docs/prd-phase4/00-decisions-needed.md` 의 `Status: Open` 항목은 **0건**.

본 세션에서 누적된 사후 검토 항목들도 모두 잠금 완료(M-OBS-4 `55fa8bf` step 10 commit
유지, worker 호스트 포트 매핑, IT-R1 `http` token deviation).

> **잔여 결정 대기 0건.** 다음 세션은 어떤 항목 위에서도 새 결정을 받을 필요 없이
> 작업 진입 가능.

---

## 다음 작업 한 줄

**4단계 PLAN 묶음(`docs/plan-phase4/`) 작성 진입.** 3단계 PLAN 패턴과 동일:

- `README.md` (진입점) + `01-milestones.md` (M-LOAD-N 마일스톤 분해 + 의존 그래프)
- `02-m-load-1-bootstrap.md` ~ `0X-m-load-N-...md` (각 마일스톤별 상세)
- `08-cross-cutting.md` (cross-cutting 관심사)
- `09-acceptance-gates.md` (각 마일스톤 exit gate + 최종 게이트)
- `10-risks-and-rollback.md` (리스크 + 롤백)

본 PRD 의 모든 결정은 잠금되어 있으므로 PLAN 작성에 추가 사용자 결정 필요 없음.
다만 PLAN 마일스톤 분해 자체의 큰 그림(예: M-LOAD-1 부트스트랩 / M-LOAD-2 LP-1
baseline 측정 / M-LOAD-3 LP-2/3 sustained / M-LOAD-4 수평 확장 N 변동 / M-LOAD-5
결과 보고서) 은 사용자 검토 권장.

---

## Recent commits (head → 10개)

```
503452b docs(prd-phase4/00): Q-LOAD-6~13 본문 결정 위임 8건 전건 Resolved (2026-05-27)
fc7e60b docs(prd-phase4/05): 비목표 cross-link + Q-LOAD-N 통합 표 + 1~3단계 정합 검증
55f99de docs(prd-phase4/04): 수평 확장 SLO (SLO-H-1/H-2) + Redis knee point + HA 트리거 조건
73cc0b8 docs(prd-phase4/03): 측정 대상 SLI 13개 + 8단계 측정 프로토콜 + SLO 재조정 규칙
094d082 docs(prd-phase4/02): k6 잠금 + cgroup 격리 + 메타데이터 + 결과 보존 단일 출처
3df0d18 docs(prd-phase4/01): 부하 프로필 카탈로그 — 4가지 차원(R/P/T/W) + LP-1~4 + IT-S 매핑
a0a3b25 docs(prd-phase4/00-overview): 4단계 PRD 진입점 — Goals/Non-Goals/페르소나/AC/용어집
8cd4191 docs(prd-phase4/00): Q-LOAD-1~5 사전 잠금 5건 전건 Resolved (2026-05-27)
34f81d5 docs(prd-phase4): bootstrap 4단계 PRD 묶음 outline + 결정 대기 13건
0fe6850 chore(handoff): snapshot at 5725281 — 결정 대기 §1~§3 잠금 완료, 다음 트랙 선택 대기
```

전체 이력은 `git log --oneline -30` 으로 확인.

---

## Notes (자유 메모, /save-state 시 누적/정리)

### 4단계 PRD closeout (2026-05-27)

- **PRD 묶음 9 commits** (`34f81d5` → `503452b`):
  - outline → 사전 잠금 5건 → 00-overview → 본문 5 파일(서브에이전트 background 디스패치) → 후속 결정 8건 closeout.
  - 본 세션 직접 작성: README + 00-decisions-needed + 00-overview + 후속 결정 갱신.
  - 서브에이전트 위임: 01~05 본문 5 파일 (1,841 lines, 자율 일탈 사전 승인 트리거 0건).
- **자율 일탈 사전 승인 규칙 준수:** Q-LOAD-1~5 사전 잠금 → Q-LOAD-6~13 사용자 개별 결정 → 잠정 권고 전건 채택. PRD 본문의 옵션 정리 + 결정 위임 라인이 모두 cross-link 단일 출처(`00-decisions-needed.md` 의 표) 와 정합.
- **본 PRD 가 도입하는 새 SLO 2종 (SLO-H-1/H-2):** 3단계 SLO-1~4 (절대 임계) 와 별개의 **N 의 함수로 정의된 상대 임계**. SLI PromQL 은 3단계 카탈로그 그대로 사용 (G4.3 정합 — 새 메트릭 0건).

### 본 세션 이전 누적 사항 (3단계 PLAN closeout)

- CLAUDE.md §7-6 존대말 (`8a44c11`), 자율 일탈 사전 승인 규칙 memory.
- M-OBS-1~6 + C-MET-1~17 17건.
- 결정 대기 §1~§3 잠금 (IT-R1 `http` PRD §6.1 조정, worker `ports:["3001:3001"]` + Grafana `ports:["3002:3000"]`, step 10 commit 유지).

### Handoff 메커니즘 메모

- 정확한 슬래시 명령 이름: `/load-state`, `/save-state` (어순 주의).

### 회귀 가드 누적 (최종)

- **단위 (UT):** UT-1~6, ssrf-guard, reconnect-backoff, hmac, classify-error, idempotency-key, config, webhook-create-request-schema, metrics-unit, metrics-c-catalog, metrics-d-w-catalog.
- **1~2단계 IT:** IT-S1~S7 + 보강(IT-S1b, IT-S2b, IT-S6b).
- **3단계 IT:** IT-OBS-1~12, IT-R1(보강).
- 모두 그린 유지가 후속 작업의 진입 조건.

### 4단계 진입 후 추가될 회귀 가드

- 본 PRD `02` §8 Q-LOAD-13 결정으로 **IT-LOAD-N 도입 0건**. 부하 회귀는 PLAN 측정 + 사람 검토 + `docs/prd-phase4/results/` commit 으로 추적.
