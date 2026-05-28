# Handoff Snapshot

> **자동 생성/갱신 파일.** `/save-state` 명령이 갱신하고, `/load-state` 명령이 읽는다.
> 본 파일은 **시점 스냅샷**이지 단일 출처가 아니다. 새 세션은 항상 본 파일을 1차 컨텍스트로 받되, **git/PLAN/테스트로 재검증**한 뒤 작업을 시작한다.

---

## Meta

- **Last updated:** 2026-05-28 (M-LOAD-6 closeout, 4단계 PLAN 묶음 공식 종료, 3 commits)
- **At commit:** `7b47840`
- **Branch:** `main`
- **Sync:** `origin/main` 0/0 — 동기화 완료 (`/save-state` 가 본 commit + push 처리)
- **Working tree:** clean (HANDOFF.md 갱신 stage 예정 외)

---

## Status Overview

- **typecheck:** ✅ 0 errors
- **tests:** ✅ **37 files / 194 passed** (M-LOAD-5 closeout 시점과 동일 — M-LOAD-6 packages/** 변경 0건)
- **core boundary grep:** ✅ 0 hits
- **`docker compose config`:** ✅ default 5 서비스 + `--profile measure` 6 서비스 (M-LOAD-5 fix `db23169` worker host port 매핑 제거 유지)
- **CI workflow:** `.github/workflows/test.yml` (unit + integration 분리)
- **누적 commit:** `a035dce`(초기) 이후 229 commits

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
| 4단계 부하·측정 (PRD 묶음) | ✅ 완료 | `docs/prd-phase4/` 8 파일 + Q-LOAD-1~13 전건 Resolved (PRD §R4.18 정정 포함) |
| 4단계 부하·측정 (PLAN 묶음) | ✅ 완료 | `docs/plan-phase4/` 12 파일 + C-LOAD-1~15 카탈로그 정착 |
| **4단계 구현 (k6 시나리오 + 측정)** | ✅ **완료** | **M-LOAD-1~6 전건 + 4단계 PLAN 묶음 공식 종료 (closeout commit `7b47840`)** |
| **후속 인계 (별도 commit 시리즈)** | ⏳ **다음** | (a) 단계 3 SLO 임계 갱신 PR / (b) C-LOAD-1/4/9/11/14/15 cross-link / (c) 후속 PRD 자리 예약 (Redis HA / Capacity 초과 부하 / Prometheus scrape 정확도) |
| 부록 트랙 (Streams Internals) | ⏳ 미착수 | `packages/streams-internals/` 자리만 예약 |

---

## 4단계 마일스톤 진행도 (`docs/plan-phase4/01-milestones.md` 표 정합)

| ID | 이름 | 상태 | 핵심 |
|----|------|------|------|
| M-LOAD-1 | Bootstrap (k6 서비스 + 골격 + 메타데이터 헬퍼) | ✅ 완료 | 7 commits `7fa3640` → `7e93eed` |
| M-LOAD-2 | LP-1 baseline 측정 | ✅ 완료 | 9 commits `5cc57f9` → `c1bbfbb` |
| M-LOAD-3 | LP-2 nominal sustained (4 변형) | ✅ 완료 | 9 commits `19b9b7f` → `92c081e` |
| M-LOAD-4 | LP-3 stress + LP-4 spike (knee point 1차) | ✅ 완료 | 7 commits `3cc5f54` → `a6b3b16` |
| M-LOAD-5 | 수평 확장 N ∈ {1,2,5,10} × LP-2 + SLO-H 검증 | ✅ 완료 | 8 commits `d9e7031` → `6bf67c4` |
| **M-LOAD-6** | Redis knee + 최종 보고서 + SLO 임계 갱신 PR 인계 | ✅ **완료** | **3 commits `d6e14ee` → `7b47840`** |

---

## M-LOAD-6 closeout (2026-05-28, 3 commits)

### commit 시리즈

| Commit | 단계 | 변경 |
|--------|------|------|
| `d6e14ee` | 1 | docs(prd-phase4/results): commit final synthesis report — `final_2026-05-28.md` 신규 (469 lines). §1 5 보고서 cross-link + SLI 종합 / §2 Redis knee point (bound = fork-time 메모리) / §3 T1~T5 HA 트리거 / §3.4 무효 조건 검증 (SHA 차이 정상 해석) / §4 SLO 재조정 표 (SLO-2 7.5ms / SLO-3 14.9ms / SLO-1·4 잠정값 유지) / §5 SLO-H-1·H-2 검증 종합 / §6 운영 권고 + cross-link 4건 분리 / §7 closeout 체크리스트 (빈 상태) / §A PR template placeholder |
| `83c32ab` | 2 | docs(plan-phase4): document SLO threshold update PR template — §A 에 PLAN `07-...md` §11 본문 글자 단위 인라인 + §4 비교 표를 본 보고서 §4.2 실측값으로 채움 |
| `7b47840` | 4 | docs(plan-phase4): mark PLAN closeout + cross-link final report — §7 closeout 체크리스트 21항목 전건 `[x]` mark-as-done. **4단계 PLAN 묶음 (M-LOAD-1~6) 공식 종료 선언** |

### M-LOAD-6 의 본질

- **새 측정 0건** (단계 5 미세 N 매트릭스 사용자 결정 스킵).
- **코드/시나리오/PRD/3단계 PLAN/3단계 SLO/`docker/prometheus/rules/`/architecture.md/CLAUDE.md/README.md 본문 변경 0건** (단계 3 별도 commit 시리즈 인계).
- M-LOAD-2~5 측정 결과의 **종합 분석 + 최종 보고서 commit + SLO 갱신 PR template 잠금 + PLAN closeout 선언**만.

### M-LOAD-6 사용자 결정 잠금 (5건, 본 commit 시리즈 인라인)

| # | 결정 | 적용 |
|---|------|------|
| 1 | git_commit SHA 5 보고서 차이 정상 해석 (PLAN §3.4 의 합리적 해석 = 동일 측정 재실행 시 SHA 일관성) | final 보고서 §3.4 + YAML 헤더 |
| 2 | 단계 2/4 빈 commit 회피: final 보고서 본문 흡수 (§A 인라인 + §7 체크박스 mark-as-done) | `83c32ab` + `7b47840` |
| 3 | M-LOAD-5 cross-link 4건 후속 작업 분리 (§6.4 운영 권고 cross-link만) | final 보고서 §6.4 |
| 4 | 단계 5 (미세 N 매트릭스) 스킵 — capacity 미달 영역의 추가 측정 가치 낮음 | (실행 안 함) |
| 5 | SLO-2/SLO-3 baseline = nominal 영역만 (LP-1 / LP-2 normal / M-LOAD-5 N=1) 가장 보수적 max | final 보고서 §4.1 + §4.2 |

### M-LOAD-6 핵심 산출물 요약

- **Redis knee point**: ~500 RPS @ P=64KB 영역에서 **단일 Redis 인스턴스의 RDB snapshot fork-time 메모리** (Docker VM 7.65GB 한계) 가 bound. Q-LOAD-4 (a) 정합.
- **HA/Cluster 트리거 T1~T5**: T2 메모리 포화가 최우선 (LP-3 영역의 71% plateau 증거). T1/T3/T4/T5 미발화.
- **SLO 재조정 임계** (Q-LOAD-9 (a) p99 × 1.5):
  - SLO-1 가용성: 5xx ≤ 0.5% **유지** (실측 0 → §4.5 변형)
  - SLO-2 등록 지연: p99 ≤ 0.5s → **p99 ≤ 7.5ms** (4.99 × 1.5)
  - SLO-3 전달 지연: p99 ≤ 5s → **p99 ≤ 14.9ms** (9.96 × 1.5)
  - SLO-4 DLQ 적재율: ≤ 1% **유지** (실측 0 → §4.5 변형)
- **SLO-H 종합**: SLO-H-1 4 N 위반 (부하 영역 의존성) + SLO-H-2 4 N 통과 (max ratio +0.24%). PRD §I4.22 시스템적 한계 식별.

---

## ⚠️ 사용자 결정 대기 항목

`docs/plan/00-decisions-needed.md` / `docs/plan-phase3/00-decisions-needed.md` /
`docs/prd-phase4/00-decisions-needed.md` / `docs/plan-phase4/00-decisions-needed.md`
의 `Status: Open` 항목은 **0건**.

> **잔여 결정 대기 0건.** 다음 세션은 후속 인계 작업의 **우선순위만** 결정하면 진입 가능 (다음 작업 한 줄 참조).

---

## 다음 작업 한 줄

**후속 인계 작업 (별도 commit 시리즈) — 우선순위 사용자 결정 위임.** 4단계 PLAN 묶음 공식 종료 후 자연스러운 다음 단계 3개:

- **(a) 단계 3 SLO 임계 갱신 PR 발행** — `docs/prd-phase4/results/final_2026-05-28.md` §A PR template + §6.2 절차 단일 출처. `prd-phase3/04` §3.1 (SLO-2 0.5s → 7.5ms / SLO-3 5s → 14.9ms / SLO-1 0.5% / SLO-4 1% 잠정값 유지) + §3.4 "잠정값" 표기 → "실측 기반 갱신" + `docker/prometheus/rules/*.yaml` 의 임계 숫자만. SLI PromQL 형태 / 측정 윈도우 / burn rate / 알람 YAML 구조 변경 0건. C-LOAD-6/7/8 정합.
- **(b) C-LOAD cross-link 6건 갱신** — `architecture.md` / `README.md` / `CLAUDE.md` cross-link. C-LOAD-1 (architecture.md §5 "보장한다" 이동) / C-LOAD-4 (architecture.md §2 k6 행 추가) / C-LOAD-9 (architecture.md §5 SLO-H-1/H-2 추가) / C-LOAD-11 (architecture.md §2 또는 line 35 historical decision 정리) / C-LOAD-14 (README 운영 노트 SLO-H 추가) / C-LOAD-15 (CLAUDE.md §3 docker/k6 디렉터리 명시). PLAN `09-acceptance-gates.md` §8 정합.
- **(c) 후속 PRD 자리 예약** — Redis HA / Cluster PRD (T2 발화 트리거), Capacity 초과 영역 부하 측정 PRD (SLO-H-1 실효 검증), Prometheus scrape 정확도 PRD (round-robin scrape 정량화). final 보고서 §6.3 cross-link.

권장 진입 순서: (a) → (b) → (c). (a) 가 측정 결과의 직접 산출물이고 (b)/(c) 의 기반.

---

## Recent commits (head → 10개)

```
7b47840 docs(plan-phase4): mark PLAN closeout + cross-link final report
83c32ab docs(plan-phase4): document SLO threshold update PR template
d6e14ee docs(prd-phase4/results): commit final synthesis report
dccdbc2 chore(handoff): snapshot at 6bf67c4 — M-LOAD-5 closeout, M-LOAD-6 진입 대기
6bf67c4 docs(docker/k6/scenarios/README): document horizontal scaling runner contract
406fd32 docs(prd-phase4/results): commit horizontal-scaling N=1/2/5/10
7c86b4e docs(README): update worker /metrics access (M-LOAD-5 fix cross-link)
75d164a docs(plan-phase4/06): correct §5 lock + add §3.4 scrape accuracy variant
f7eb029 docs(prd-phase4/04): correct R4.18 — host port mapping fails on --scale
8ce3fdb fix(docker/k6/scripts): drop worker host /metrics readiness (4 runner)
```

전체 이력은 `git log --oneline -30` 으로 확인.

---

## Notes (자유 메모, /save-state 시 누적/정리)

### M-LOAD-6 closeout (2026-05-28) — 본 세션

- 3 commits 만으로 4단계 PLAN 묶음 공식 종료. final 보고서 469 lines (§1~§7 + §A) 가 본 PLAN 의 단일 출처.
- **부하 영역 의존성 패턴 (M-LOAD-5 발견)** 이 final 보고서 §5.3 의 시스템적 한계 식별로 정착 — SLO-H-1 위반/통과 의 의미가 부하 영역에 의존. capacity 미달 영역에서는 SLO-H-1 자동 위반 (linearity = 1/N), SLO-H-2 만 의미 보존.
- **Redis fork-time 메모리 bound (M-LOAD-4 LP-3 발견)** 이 final 보고서 §2 의 knee point 본질 식별로 정착. T2 트리거의 최우선 위험.
- **SLO 재조정의 공격적 산출 (SLO-2 67× / SLO-3 335×)** — 3단계 잠정값이 의도적으로 매우 보수적이었음이 본 측정으로 확인. 단계 3 PR 발행 시 본 의미를 PR 본문에 명시 권장.
- **단계 3 발행 시 주의:** Docker prometheus rules YAML 의 burn rate `> (14.4 * 0.005)` 의 `0.005` 는 SLO-1 (가용성 0.5%) 의 표현이며 잠정값 유지. SLO-2 / SLO-3 의 임계 갱신만 PromQL 의 임계 부분 갱신 (latency YAML 파일).

### M-LOAD-5 closeout (2026-05-28) — 직전 세션 (간략 보존)

- 8 commits `d9e7031` → `6bf67c4`. SLO-H-1 4 N 위반 (부하 영역 의존성) + SLO-H-2 4 N 통과. 1차 시도 N=2 port fail → fix 5 commits → 재측정.
- PRD §R4.18 "동적 폴백" 가정 정정 + `docker-compose.yml` worker host port 매핑 제거 + `prometheus.yml` single target round-robin scrape 정확도 한계 명시.
- N=1 baseline 재현성 ±5% 안 (M-LOAD-3 LP-2 normal Δ +0.10%) — M-LOAD-6 의 SLO 재조정 baseline 신뢰성 근거.

### M-LOAD-4 / M-LOAD-3 / M-LOAD-2 / M-LOAD-1 / 4단계 PRD+PLAN closeout (2026-05-27) — 더 직전 세션 (간략 보존)

- M-LOAD-4: 7 commits, LP-3 knee 명백 진입 (Bound = Redis fork-time 메모리) + LP-4 회복 33.1s.
- M-LOAD-3: 9 commits, LP-2 4 변형 + 결과 무효 조건 보강 (W3 attempts ≈ 3.0 / SLO-4 DLQ 1.0 / C5 non_retriable rate / D3 80/15/5) 전건 통과. **카운터 키 디자인 교훈 — payload.idempotencyKey 우선 + HMAC fallback 패턴이 표준**.
- M-LOAD-2: 9 commits, LP-1 baseline SLO 잠정값 전건 통과 + 분산 ±5% 안.
- M-LOAD-1: 7 commits, cgroup 호환성 통과.
- 4단계 PRD 묶음 9 commits + PLAN 묶음 10 commits + C-LOAD-1~15 카탈로그 사후 승인.

### IT-S7 / IT-OBS-9 spawn timeout flaky 관찰 (2026-05-27)

- 직전 직전 세션 `/save-state` 검증 시 1회차 / 2회차 실패, 3회차 통과 사례 1건. 본 + 직전 세션 검증 모두 1회 통과 — 재발 없음. **후속 권장 (별도 commit 시리즈):** `spawn-server.ts` readyTimeoutMs 8000ms → 15000ms 또는 호스트 부하 감지 후 자동 backoff.

### Q-LOAD-1~13 잠금 표 (단일 출처: `prd-phase4/00-decisions-needed.md`)

| Q-ID | 결정 | M-LOAD-6 산출물 정합 |
|------|------|----------------------|
| Q-LOAD-1 | k6 (Grafana Labs) | (그대로) |
| Q-LOAD-2 | 로컬 + cgroup 격리 | (그대로) |
| Q-LOAD-3 | PRD 묶음만 (3단계 패턴) | (그대로) |
| Q-LOAD-4 | Redis 단일 인스턴스 한계 식별 | **final 보고서 §2 knee point + §3 T1~T5 트리거 식별 완료** |
| Q-LOAD-5 | 정적 부하만 (카오스 제외) | (그대로) |
| Q-LOAD-6 | RPS 중도 셋 (10 / 100 / 500 / 100→1000) | (그대로) |
| Q-LOAD-7 | 페이로드 운영 평균 (80% / 15% / 5%) | (그대로) |
| Q-LOAD-8 | LP-1/4 짧은 (~6.5분), LP-2/3 sustained (~32분) | (그대로) |
| Q-LOAD-9 | p99 × 1.5 (Google SRE 일반 권고) | **final 보고서 §4.2 재조정 임계 산출 완료** — 단계 3 PR 발행 대기 |
| Q-LOAD-10 | α = 0.8 (수평 확장 처리량 선형성) | **M-LOAD-5 4 N 위반 (부하 영역 의존성), final §5.1 정착** |
| Q-LOAD-11 | β = 1.2 (수평 확장 p99 안정성) | **M-LOAD-5 4 N 통과, final §5.2 정착** |
| Q-LOAD-12 | Markdown 표 (`docs/prd-phase4/results/`) | **final 보고서 6건 모두 Markdown 표** |
| Q-LOAD-13 | IT-LOAD-N 없음 (CI 시간 부담 0) | (그대로) |

### Handoff 메커니즘 메모

- 정확한 슬래시 명령 이름: `/load-state`, `/save-state`.

### 회귀 가드 누적

- **단위 (UT):** UT-1~6 + 보강 (metrics-c-catalog, metrics-d-w-catalog).
- **1~2단계 IT:** IT-S1~S7 + 보강(IT-S1b, IT-S2b, IT-S6b).
- **3단계 IT:** IT-OBS-1~12, IT-R1.
- **M-LOAD-3 IT:** receiver-variants 9 case.
- **4단계 측정:** IT-LOAD-N 없음 (Q-LOAD-13 (a)).
- 모두 그린 유지가 후속 작업의 진입 조건. **M-LOAD-6 시점: 37 files / 194 passed 유지 (packages/** 변경 0건).**

### 후속 정리 항목 (단일 출처: final_2026-05-28.md §6.2 + §6.3 + §6.4)

본 표는 final 보고서 §6 의 cross-link 의 요약. 각 항목의 상세는 본 보고서 § 참조.

#### 단계 3 (SLO 임계 갱신 PR 발행, C-LOAD-6/7/8)

- `prd-phase3/04` §3.1 임계 숫자 갱신 (SLO-2 0.5s → 7.5ms, SLO-3 5s → 14.9ms, SLO-1·4 유지).
- `prd-phase3/04` §3.4 "잠정값" 표기 → "실측 기반 갱신 (2026-05-28, ...)".
- `docker/prometheus/rules/webhook-relay-latency.yaml` 의 SLO-2/SLO-3 임계 갱신 (다른 3 YAML 변경 0건).

#### PLAN closeout 후 cross-link 6건 (C-LOAD-1/4/9/11/14/15)

- C-LOAD-1: `architecture.md` §5 "보장한다" 로 4단계 부하 측정 이동.
- C-LOAD-4: `architecture.md` §2 컴포넌트 표에 k6 행 추가.
- C-LOAD-9: `architecture.md` §5 "보장한다" 에 SLO-H-1 / SLO-H-2 추가.
- C-LOAD-11: `architecture.md` §2 또는 line 35 historical decision 정리 (M-LOAD-5 fix `db23169` cross-link).
- C-LOAD-14: `README.md` 운영 노트에 SLO-H 추가.
- C-LOAD-15: `CLAUDE.md` §3 폴더 구조에 `docker/k6/` 디렉터리 명시.

#### 후속 PRD 자리 예약 (final 보고서 §6.3)

- Redis HA / Cluster PRD (T2 발화 트리거, C-LOAD-10 cross-link).
- Capacity 초과 영역 부하 측정 PRD (SLO-H-1 실효 검증, 부하 프로필 재설계 필요).
- Prometheus scrape 정확도 PRD (dns_sd 도입 + round-robin scrape 정량화).
- 카오스 엔지니어링 PRD (C-LOAD-13).
- 운영 배포 자동화 PRD (C-LOAD-12).

#### 별도 commit 시리즈 (영향 작음, 잔여)

- `spawn-server.ts` readyTimeoutMs 보강 (flaky 관찰).
- (M-LOAD-3) stub variant 카운터 키 디자인 패턴 (idempotencyKey 우선 + HMAC fallback) 을 architecture.md 또는 별도 ADR 로 명문화.
- (M-LOAD-4) LP-4 보고서 §6.1 의 `register_rps_achieved` query empty (Prometheus rate window 과 step=5s 의 sparse 분포 가설) — 별도 분석.
- README.md line 203 의 `현재 상태: 117 tests passed` (stale, 실제 194) — 별도 follow-up.
