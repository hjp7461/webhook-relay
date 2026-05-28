# Handoff Snapshot

> **자동 생성/갱신 파일.** `/save-state` 명령이 갱신하고, `/load-state` 명령이 읽는다.
> 본 파일은 **시점 스냅샷**이지 단일 출처가 아니다. 새 세션은 항상 본 파일을 1차 컨텍스트로 받되, **git/PLAN/테스트로 재검증**한 뒤 작업을 시작한다.

---

## Meta

- **Last updated:** 2026-05-29 (잔여 follow-up — README test count stale 갱신, 1 commit)
- **At commit:** `2aefd7e`
- **Branch:** `main`
- **Sync:** `origin/main` 0/0 — 동기화 완료 (`/save-state` 가 본 commit + push 처리)
- **Working tree:** clean (HANDOFF.md 갱신 stage 예정 외)

---

## Status Overview

- **typecheck:** ✅ 0 errors
- **tests:** ✅ **37 files / 194 passed** (M-LOAD-6 closeout 시점과 동일 — 본 commit packages/** 변경 0건)
- **core boundary grep:** ✅ 0 hits
- **`docker compose config`:** ✅ default 5 서비스 + `--profile measure` 6 서비스
- **`promtool check rules`:** ✅ 4 파일 10 rules SUCCESS (PRD AC6.2 정합, 단계 3 commit `a338716` 직전 검증)
- **CI workflow:** `.github/workflows/test.yml` (unit + integration 분리)
- **누적 commit:** `a035dce`(초기) 이후 236 commits

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
| 3단계 관측성 | ✅ 완료 | M-OBS-1~6 전건 + C-MET-1~17 17건 정착 |
| 4단계 부하·측정 (PRD 묶음) | ✅ 완료 | `docs/prd-phase4/` 8 파일 + Q-LOAD-1~13 전건 Resolved |
| 4단계 부하·측정 (PLAN 묶음) | ✅ 완료 | `docs/plan-phase4/` 12 파일 + C-LOAD-1~15 카탈로그 정착 |
| 4단계 구현 (k6 시나리오 + 측정) | ✅ 완료 | M-LOAD-1~6 전건 + 4단계 PLAN 묶음 공식 종료 (closeout commit `7b47840`) |
| 후속 인계 (a) 단계 3 SLO 임계 갱신 | ✅ 완료 | 1 commit `a338716`. C-LOAD-6/7/8 (🔵 → ✅) |
| 후속 인계 (b) C-LOAD cross-link 6건 | ✅ 완료 | 3 commits `37ab14f` → `3a03e5e`. C-LOAD-1/4/9/11/14/15 (❌ → ✅) |
| **후속 인계 (c) 후속 PRD 자리 예약** | ⏳ **다음** | C-LOAD-2 / 10 / 12 / 13 (4건, PLAN `09-acceptance-gates.md` §8 의 ❌ 잔여). 트리거 발동 전이라 사용자 결정 위임 영역 |
| **잔여 follow-up** | 🟡 **부분 완료** (1/4) | ✅ README test count stale 갱신 (`2aefd7e`). ⏳ 잔여 3건 (spawn-server.ts readyTimeoutMs / M-LOAD-3 ADR / LP-4 query empty) |
| 부록 트랙 (Streams Internals) | ⏳ 미착수 | `packages/streams-internals/` 자리만 예약 |

---

## 본 세션 commit 시리즈 (2026-05-28~29, 5 commits)

| Commit | 범주 | 변경 |
|--------|------|------|
| `a338716` | 후속 인계 (a) | docs(prd-phase3/04): rebaseline SLO thresholds from phase 4 measurements (2026-05-28). 3 파일 / 55 insertions / 29 deletions. C-LOAD-6/7/8 닫힘 |
| `37ab14f` | 후속 인계 (b) 1/3 | docs(architecture): cross-link phase 4 outcomes (C-LOAD-1/4/9/11). §2 Service Mode + Grafana + k6 행 신규 / §5 "보장한다" SLO 갱신 + SLO-H + 부하 측정 + Redis knee + T1~T5 신규 / §5 "보장하지 않는다" 부하 측정 줄 제거 |
| `5524ddb` | 후속 인계 (b) 2/3 | docs(README): cross-link phase 4 SLO + SLO-H outcomes (C-LOAD-14). 운영 노트 + 로드맵 4단계 진행도 [x] |
| `3a03e5e` | 후속 인계 (b) 3/3 | docs(CLAUDE): add docker/k6/ to folder structure (C-LOAD-15). §3 폴더 구조 docker/k6/scenarios/scripts/results 추가 |
| `2aefd7e` | 잔여 follow-up | docs(README): refresh test count (117 → 194) + accumulated test suites. UT-1~6 + 보강 / IT-S 시리즈 / IT-R1 / IT-OBS-1~12 / receiver-variants 9 case 누적 표현 |

### 본 세션 핵심 산출물 정합 검증

- **SLO 재조정 글자 단위 정합 검증:** PRD `prd-phase3/04` §3.1 + §4.1 + §5.2.2 본문 ↔ `webhook-relay-latency.yaml` 본문 ↔ `architecture.md` §5 "보장한다" 절 ↔ `README.md` 운영 노트 — 5 위치의 SLO 임계 (SLO-2 7.5ms / SLO-3 14.9ms / SLO-1 0.5% 유지 / SLO-4 1% 유지) 모두 글자 단위 정합 ✅.
- **갱신 금지 항목 변경 0건 검증:** SLI PromQL 형태 / 측정 윈도우 / burn rate (14.4×/6×) / 알람 YAML 구조 / 메트릭 이름 / 라벨 enum 모두 변경 0건 ✅ (I6.1 / I6.2 / I3.1 / I3.2 정합).
- **회귀 가드 그린 유지:** 37 files / 194 passed + typecheck 0 errors + core boundary 0 hits + docker compose config 유효 + promtool 10 rules SUCCESS ✅.

---

## ⚠️ 사용자 결정 대기 항목

`docs/plan/00-decisions-needed.md` / `docs/plan-phase3/00-decisions-needed.md` /
`docs/prd-phase4/00-decisions-needed.md` / `docs/plan-phase4/00-decisions-needed.md`
의 `Status: Open` 항목은 **0건**.

> **잔여 결정 대기 0건.** 다음 세션은 (c) 후속 PRD 자리 예약의 우선순위 + 자리 예약 형태만 결정하면 진입 가능.

---

## 다음 작업 한 줄

**(c) 후속 PRD 자리 예약 (4건, 트리거 발동 전 사용자 결정 위임) 또는 잔여 follow-up 3건** — 우선순위 사용자 결정:

**(c) PRD 자리 예약 4건:**
- C-LOAD-2 — 본 PRD `prd-phase4/00-overview` §5 AC4.2 본문 갱신 (마일스톤 완료 시점의 표현으로).
- C-LOAD-10 — Redis HA / Cluster PRD 자리 예약 (`docs/prd-redis-ha/` 등 신규 디렉터리). 트리거 = T2 메모리 포화 운영 발화.
- C-LOAD-12 — 운영 PRD 자리 예약 (Alertmanager 라우팅 / 온콜 / 인시던트 런북). 트리거 = 운영 단계 진입.
- C-LOAD-13 — 카오스 엔지니어링 PRD 자리 예약. 트리거 = 운영 발화.

**잔여 follow-up 3건:**
- `spawn-server.ts` readyTimeoutMs 보강 (flaky 관찰 cross-link, IT-OBS-9). 단순 패치 1 commit.
- M-LOAD-3 stub variant 카운터 키 디자인 패턴 (idempotencyKey 우선 + HMAC fallback) 을 `architecture.md` 또는 별도 ADR 로 명문화. ADR-003 후보.
- M-LOAD-4 LP-4 보고서 §6.1 의 `register_rps_achieved` query empty (Prometheus rate window 과 step=5s 의 sparse 분포 가설) — 별도 분석 + run-lp-4.sh 의 query step / rate window fix.

권장: (c) 4건은 트리거 발동 전이라 의미 약함. 잔여 follow-up 의 spawn-server.ts readyTimeoutMs 또는 M-LOAD-3 ADR-003 이 측정 가능한 산출물.

---

## Recent commits (head → 10개)

```
2aefd7e docs(README): refresh test count (117 → 194) + accumulated test suites
1ba0995 chore(handoff): snapshot at 3a03e5e — 후속 인계 (a)+(b) 완료, (c) 진입 대기
3a03e5e docs(CLAUDE): add docker/k6/ to folder structure (C-LOAD-15)
5524ddb docs(README): cross-link phase 4 SLO + SLO-H outcomes (C-LOAD-14)
37ab14f docs(architecture): cross-link phase 4 outcomes (C-LOAD-1/4/9/11)
a338716 docs(prd-phase3/04): rebaseline SLO thresholds from phase 4 measurements (2026-05-28)
128c8f9 chore(handoff): snapshot at 7b47840 — M-LOAD-6 closeout, 4단계 PLAN 묶음 공식 종료
7b47840 docs(plan-phase4): mark PLAN closeout + cross-link final report
83c32ab docs(plan-phase4): document SLO threshold update PR template
d6e14ee docs(prd-phase4/results): commit final synthesis report
```

전체 이력은 `git log --oneline -30` 으로 확인.

---

## Notes (자유 메모, /save-state 시 누적/정리)

### 잔여 follow-up 진행 (2026-05-29) — 본 세션

- **README test count stale 갱신 (`2aefd7e`)** — `현재 상태: 117 tests passed` (M-OBS-1 시점) → `37 files / 194 tests passed` (본 시점). 본문에 누적 테스트 묶음 명시: UT-1~6 + 보강 / IT-S1~S7 + IT-S1b/S2b/S6b / IT-R1 도메인 경계 / IT-OBS-1~12 / M-LOAD-3 receiver-variants 9 case. 본 commit 시점 이후의 테스트 카운트 변경은 본 표현을 같이 갱신해야 stale 회피.

### 후속 인계 (a)/(b) 완료 (2026-05-28~29) — 본 세션 (간략 보존)

- **단계 3 SLO 임계 갱신 (a338716)** 의 단일 commit 패턴 + 5 위치 글자 단위 정합 검증.
- **(b) C-LOAD cross-link 3 commits 분리 패턴** — `docs(architecture)` 1 + `docs(README)` 1 + `docs(CLAUDE)` 1. 본 commit 분리가 4단계 후속 작업의 commit 분리 표준.

### M-LOAD-6 closeout (2026-05-28) — 직전 세션 (간략 보존)

- 3 commits `d6e14ee` → `7b47840`. final 보고서 469 lines + SLO 임계 갱신 PR template + PLAN closeout 선언. 부하 영역 의존성 패턴 + Redis fork-time 메모리 bound + SLO 재조정 공격적 산출 (SLO-2 67× / SLO-3 335×).
- M-LOAD-6 사용자 결정 잠금 5건 (SHA 정상 해석 / 빈 commit 회피 풀이 / cross-link 4건 분리 / 단계 5 스킵 / SLO-2/SLO-3 baseline nominal 영역만).

### M-LOAD-1~5 + 4단계 PRD/PLAN closeout (2026-05-27~28) — 더 직전 세션 (간략 보존)

- M-LOAD-1: 7 commits, cgroup 호환성 통과.
- M-LOAD-2: 9 commits, LP-1 baseline SLO 잠정값 전건 통과.
- M-LOAD-3: 9 commits, LP-2 4 변형 + W3 attempts ≈ 3.0 / SLO-4 DLQ 1.0 / D3 80/15/5 전건 통과. 카운터 키 디자인 교훈.
- M-LOAD-4: 7 commits, LP-3 knee 명백 진입 (Bound = Redis fork-time 메모리) + LP-4 회복 33.1s.
- M-LOAD-5: 8 commits, SLO-H-1 4 N 위반 (부하 영역 의존성) + SLO-H-2 4 N 통과. PRD §R4.18 정정.
- 4단계 PRD 묶음 9 commits + PLAN 묶음 10 commits + C-LOAD-1~15 카탈로그 사후 승인.

### IT-S7 / IT-OBS-9 spawn timeout flaky 관찰 (2026-05-27)

- 직전 직전 세션 1회차 / 2회차 실패, 3회차 통과 사례 1건. 본 세션 + 직전 세션 검증 모두 1회 통과 — 재발 없음. **후속 권장 (잔여 follow-up):** `spawn-server.ts` readyTimeoutMs 8000ms → 15000ms 또는 호스트 부하 감지 후 자동 backoff.

### Q-LOAD-1~13 잠금 표 (단일 출처: `prd-phase4/00-decisions-needed.md`)

| Q-ID | 결정 | 본 세션 정합 |
|------|------|---------------|
| Q-LOAD-1 | k6 (Grafana Labs) | (그대로) |
| Q-LOAD-2 | 로컬 + cgroup 격리 | (그대로) |
| Q-LOAD-3 | PRD 묶음만 (3단계 패턴) | (그대로) |
| Q-LOAD-4 | Redis 단일 인스턴스 한계 식별 | M-LOAD-6 final §2 + §3 (T1~T5) 정착, 본 세션 architecture.md §5 + README 운영 노트 cross-link |
| Q-LOAD-5 | 정적 부하만 | (그대로) |
| Q-LOAD-6 | RPS 중도 셋 | (그대로) |
| Q-LOAD-7 | 페이로드 운영 평균 | (그대로) |
| Q-LOAD-8 | LP-1/4 짧은, LP-2/3 sustained | (그대로) |
| Q-LOAD-9 | p99 × 1.5 | **본 세션 단계 3 commit a338716 으로 SLO 임계 갱신 완료** (SLO-2 7.5ms / SLO-3 14.9ms) — Q-OBS-11 closed |
| Q-LOAD-10 | α = 0.8 | M-LOAD-5 4 N 위반, 본 세션 architecture.md + README cross-link |
| Q-LOAD-11 | β = 1.2 | M-LOAD-5 4 N 통과, 본 세션 architecture.md + README cross-link |
| Q-LOAD-12 | Markdown 표 | (그대로) |
| Q-LOAD-13 | IT-LOAD-N 없음 | (그대로) |

### Handoff 메커니즘 메모

- 정확한 슬래시 명령 이름: `/load-state`, `/save-state`.

### 회귀 가드 누적

- **단위 (UT):** UT-1~6 + 보강 (metrics-c-catalog, metrics-d-w-catalog).
- **1~2단계 IT:** IT-S1~S7 + 보강(IT-S1b, IT-S2b, IT-S6b).
- **3단계 IT:** IT-OBS-1~12, IT-R1.
- **M-LOAD-3 IT:** receiver-variants 9 case.
- **4단계 측정:** IT-LOAD-N 없음 (Q-LOAD-13 (a)).
- 모두 그린 유지가 후속 작업의 진입 조건. **본 세션 시점: 37 files / 194 passed 유지 (packages/** 변경 0건).**

### (c) 후속 PRD 자리 예약 4건 (다음 세션 진입 영역)

본 표는 PLAN `09-acceptance-gates.md` §8 의 ❌ 잔여 4건. 본 세션 commit 시리즈 외 후속.

| C-LOAD ID | 대상 | 진입 트리거 | 자리 예약 형태 |
|-----------|------|-------------|----------------|
| **C-LOAD-2** | `docs/prd-phase4/00-overview.md` §5 AC4.2 | 본 PRD 본문 변경 (별도 결정) | PRD 본문 갱신 (마일스톤 완료 시점 표현으로) |
| **C-LOAD-10** | (신규 자리) | T2 메모리 포화 운영 발화 | `docs/prd-redis-ha/` 또는 별도 디렉터리 |
| **C-LOAD-12** | (신규 자리) | 운영 단계 진입 | Alertmanager 라우팅 / 온콜 / 인시던트 런북 |
| **C-LOAD-13** | (신규 자리) | 운영 발화 | 카오스 엔지니어링 (부하 + 워커 강제 종료 결합) |

### 잔여 follow-up 3건 (영향 작음, 본 세션 후 부분 완료 — 1/4)

- ✅ **(완료, `2aefd7e`)** README test count stale 갱신 (117 → 194).
- ⏳ `spawn-server.ts` readyTimeoutMs 보강 (flaky 관찰 cross-link, IT-OBS-9). 본 세션 + 직전 + 직전 직전 세션 검증 모두 1회 통과 — 재발 없음. 우선순위 낮음.
- ⏳ (M-LOAD-3) stub variant 카운터 키 디자인 패턴 (idempotencyKey 우선 + HMAC fallback) 을 `architecture.md` 또는 별도 ADR (ADR-003 후보) 로 명문화. 디자인 의미 보존.
- ⏳ (M-LOAD-4) LP-4 보고서 §6.1 의 `register_rps_achieved` query empty (Prometheus rate window 과 step=5s 의 sparse 분포 가설) — 별도 분석 + `run-lp-4.sh` 의 query step / rate window fix. 측정 부수 문제.

### 후속 측정 영역 (별도 PRD)

- **본 세션 갱신된 SLO 임계의 알람 발화 정확도 변동** — 재측정 + 별도 PR (`prd-phase4/03` §6.4 정합).
- **Capacity 초과 영역 부하 측정 PRD** (SLO-H-1 실효 검증, 부하 프로필 재설계 필요).
- **Prometheus scrape 정확도 PRD** (dns_sd 도입 + round-robin scrape 정량화).
