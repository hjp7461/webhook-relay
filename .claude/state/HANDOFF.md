# Handoff Snapshot

> **자동 생성/갱신 파일.** `/save-state` 명령이 갱신하고, `/load-state` 명령이 읽는다.
> 본 파일은 **시점 스냅샷**이지 단일 출처가 아니다. 새 세션은 항상 본 파일을 1차 컨텍스트로 받되, **git/PLAN/테스트로 재검증**한 뒤 작업을 시작한다.

---

## Meta

- **Last updated:** 2026-05-28 (M-LOAD-5 closeout, 8 commits)
- **At commit:** `6bf67c4`
- **Branch:** `main`
- **Sync:** `origin/main` 0/8 — push 대기 (`/save-state` 가 처리)
- **Working tree:** clean (HANDOFF.md 갱신 stage 예정 외)

---

## Status Overview

- **typecheck:** ✅ 0 errors
- **tests:** ✅ **37 files / 194 passed** (M-LOAD-3/4 closeout 시점과 동일 — packages/** 변경 0건)
- **core boundary grep:** ✅ 0 hits
- **`docker compose config`:** ✅ default 5 서비스 + `--profile measure` 6 서비스 (worker host port 매핑 제거)
- **CI workflow:** `.github/workflows/test.yml` (unit + integration 분리)
- **누적 commit:** `a035dce`(초기) 이후 205+ commits

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
| API/Worker 분리 | ✅ 완료 | `SERVICE_MODE` + docker compose `api`/`worker` + `--scale worker=N`. **M-LOAD-5 fix `db23169` 로 worker host port 매핑 제거** (--scale N>=2 정상 동작) |
| Handoff 메커니즘 | ✅ 완료 | `/load-state` + `/save-state` + `.claude/state/HANDOFF.md` |
| 3단계 관측성 | ✅ 완료 | M-OBS-1~6 전건 + C-MET-1~17 17건 정착 |
| 4단계 부하·측정 (PRD 묶음) | ✅ 완료 | `docs/prd-phase4/` 8 파일 + Q-LOAD-1~13 전건 Resolved. **§R4.18 정정 2026-05-28** (동적 포트 폴백 가정 제거) |
| 4단계 부하·측정 (PLAN 묶음) | ✅ 완료 | `docs/plan-phase4/` 12 파일 + C-LOAD-1~15 카탈로그 정착 |
| **4단계 구현 (k6 시나리오 + 측정)** | 🟡 M-LOAD-5 완료 | M-LOAD-5 8 commits closeout. **M-LOAD-6 대기** |
| 부록 트랙 (Streams Internals) | ⏳ 미착수 | `packages/streams-internals/` 자리만 예약 |

---

## 4단계 마일스톤 진행도 (`docs/plan-phase4/01-milestones.md` 표 정합)

| ID | 이름 | 상태 | 핵심 |
|----|------|------|------|
| M-LOAD-1 | Bootstrap (k6 서비스 + 골격 + 메타데이터 헬퍼) | ✅ 완료 | 7 commits `7fa3640` → `7e93eed` |
| M-LOAD-2 | LP-1 baseline 측정 | ✅ 완료 | 9 commits `5cc57f9` → `c1bbfbb`. SLO 잠정값 전건 통과 + 분산 ±5% 안 |
| M-LOAD-3 | LP-2 nominal sustained (4 변형) | ✅ 완료 | 9 commits `19b9b7f` → `92c081e`. SLO 잠정값 + §3.3 결과 무효 조건 보강 전건 통과 |
| M-LOAD-4 | LP-3 stress + LP-4 spike (knee point 1차) | ✅ 완료 | 7 commits `3cc5f54` → `a6b3b16`. LP-3 knee 명백 진입 (Bound = Redis fork-time 메모리, Q-LOAD-4 (a) 정합) + LP-4 회복 시간 33.1s |
| **M-LOAD-5** | 수평 확장 N ∈ {1,2,5,10} × LP-2 + SLO-H 검증 | ✅ **완료** | 8 commits `d9e7031` → `6bf67c4`. **SLO-H-1 4 N 위반 (부하 영역 의존성, capacity 미달) + SLO-H-2 4 N 통과 (p99 안정성)**. 1차 시도 N=2 port fail → 5 fix commits → 재측정 |
| **M-LOAD-6** | Redis knee + 최종 보고서 + SLO 임계 갱신 PR 인계 | ⏳ **다음** | `07-m-load-6-redis-knee-and-final-report.md` |

---

## M-LOAD-5 closeout (2026-05-28, 8 commits)

### M-LOAD-5 commit 시리즈

| Commit | 단계 | 변경 |
|--------|------|------|
| `d9e7031` | 1 | feat(docker/k6/scripts): run-horizontal-scaling.sh (N ∈ {1,2,5,10} × LP-2 normal 30m). 안전망 mirror (set -eu + trap + --build + readiness + [5b] logs). |
| `db23169` | fix 1 | fix(docker-compose): worker host port 매핑 제거. **사용자 결정 잠금 2026-05-28** — 1차 시도 N=2 부트스트랩 host port 3001 충돌로 fail (`Bind for 0.0.0.0:3001 failed: port is already allocated`), PRD §R4.18 "동적 폴백" 가정 잘못됨 검증. |
| `8ce3fdb` | fix 2 | fix(docker/k6/scripts): 4 runner (run-lp-1/2/3/4.sh) worker /metrics 호스트 호출 제거. Prometheus targets up>=2 만으로 worker readiness 판정. |
| `f7eb029` | docs 1 | docs(prd-phase4/04): §R4.18 정정 — "동적 폴백" 가정 제거 + Prometheus single target round-robin scrape 의 정확도 한계 명시. |
| `75d164a` | docs 2 | docs(plan-phase4/06): §5 "docker-compose.yml 변경 0건" 잠금 예외 명시 (1건 — fix `db23169`) + §3.4 결과 무효 조건 보강 (single target round-robin scrape). |
| `7c86b4e` | docs 3 | docs(README): 빠른 시작의 worker /metrics URL 표현 갱신 — host port 매핑 없음, Prometheus 가 컨테이너 네트워크에서 scrape. |
| `406fd32` | 3 | docs(prd-phase4/results): horizontal-scaling N=1/2/5/10 결과 보고서 (327 lines). SLO-H-1 위반 사유 분류 + SLO-H-2 통과 의미. |
| `6bf67c4` | 4 | docs(docker/k6/scenarios/README): §8 표 + 새 §9 절 "수평 확장 runner 계약" 추가 (M-LOAD-3 `37ff8cc` / M-LOAD-4 `d7f57c8` 패턴 mirror). |

### M-LOAD-5 측정 핵심 결과 (재측정 2026-05-28T11:38Z → 13:46Z, 2시간 8분)

#### 4 N SLI 표 (W_load 30분 평균)

| N | k6 RPS | k6 p95 | throughput (Prom) | p99_processing (Prom) | cardinality | scrape_up_min |
|---|---|---|---|---|---|---|
| 1 | 100.00 | 2.83ms | 94.18 RPS | 9.92ms | 165 | 1.0 |
| 2 | 100.00 | 2.86ms | 94.10 RPS | 9.92ms | 165 | 1.0 |
| 5 | 100.00 | 2.83ms | 94.15 RPS | 9.94ms | 165 | 1.0 |
| 10 | 100.00 | 2.86ms | 94.06 RPS | 9.92ms | 165 | 1.0 |

> **4 N 모두 동일 영역** — 부하 영역 (R=100) 이 N=1 워커 capacity (~500 jobs/s) 의 20% 라 추가 워커 idle. 5xx 0% / DLQ 0% / 큐 waiting max=2 / 큐 active max=2~3 (N=10 분산 효과).

#### SLO-H-1 (α=0.8, throughput(N) ≥ throughput(1) × N × 0.8)

- baseline throughput(1) = 94.1836 RPS.
- N=2: linearity 0.5000 ❌ / N=5: 0.1999 ❌ / N=10: 0.0999 ❌.
- **4 N 모두 위반** — 위반 사유 = **부하 영역 의존성** (capacity 미달 → linearity = 1/N).
- 자원 경합 / Redis 포화 / cgroup 과소 모두 아님.
- **PRD §I4.22 "수평 확장 SLO 의 상대성" 시스템적 한계 식별** — SLO-H-1 의 의미 보존성은 부하 영역 의존.

#### SLO-H-2 (β=1.2, p99(N) ≤ p99(1) × 1.2)

- baseline p99(1) = 9.9156ms.
- N=2: ratio 1.0004 ✅ / N=5: 1.0024 ✅ / N=10: 1.0004 ✅.
- **4 N 모두 통과** — p99 안정성이 N 증가에도 거의 변동 없음 (max ratio +0.24%).
- N=10 cgroup over-commit 우려 영역 (14 컨테이너 / 12 core) 도 p99 안정.

#### N=1 baseline 재현성 (PRD §7.1 정합)

- M-LOAD-3 LP-2-normal SLO-3 p99=9.91ms vs M-LOAD-5 N=1 p99=9.92ms (Δ+0.10%)
- M-LOAD-3 throughput ≈ 94 RPS vs M-LOAD-5 N=1 = 94.18 RPS (Δ<1%)
- **재현성 ±5% 안 확인** — 본 측정의 baseline 신뢰 가능

### M-LOAD-5 1차 시도 fail 회고 (2026-05-28T03:07Z, port 충돌)

- 1차 시도 `run-horizontal-scaling.sh` 실행 — N=1 정상 완료 (`LP-2-N1_2026-05-28T03-07-48Z`), N=2 부트스트랩에서 host port 3001 충돌 fail.
- `docker-compose.yml` worker `ports: "3001:3001"` 매핑이 `--scale worker=N` (N>=2) 시 두번째 인스턴스 fail 트리거.
- PRD `prd-phase4/04` §R4.18 가정 ("추가 인스턴스 동적 포트 폴백") 이 실제 docker compose 동작과 다름이 검증됨.
- 사용자 결정 잠금 2026-05-28 → 5 fix commits (`db23169` ~ `7c86b4e`) → 재측정 (`11:38Z`).
- 1차 시도 결과 디렉터리 (`LP-2-N1_2026-05-28T03-07-48Z`, `LP-2-N2_2026-05-28T03-40-37Z`) 보존만 + 보고서엔 미사용.

---

## M-LOAD-5 사용자 결정 잠금 (5건, 본 commit 시리즈 인라인)

| # | 결정 | 적용 |
|---|------|------|
| 1 | 호스트 환경 점검 이미 적용 완료 → 즉시 단계 1 진입 | (사전) |
| 2 | N=1 재측정 (정석, 4 N 일관 commit) — M-LOAD-3 N=1 재사용 안 함 | 재측정 4 N |
| 3 | 본 세션 background 순차 실행 (M-LOAD-3/4 패턴) | 1차 + 재측정 |
| 4 | scenarios/README.md §9 절 추가 (M-LOAD-3/4 패턴 mirror) | `6bf67c4` |
| 5 | 1차 시도 port fail 후 docker-compose worker ports 제거 + PRD §R4.18 정정 + M-LOAD-5 재진입 | 5 fix commits + 재측정 |
| 6 | prometheus.yml single target round-robin scrape 한계 보고서에 명시 (변경 없이 진행) | `406fd32` §5 |

---

## ⚠️ 사용자 결정 대기 항목

`docs/plan/00-decisions-needed.md` / `docs/plan-phase3/00-decisions-needed.md` /
`docs/prd-phase4/00-decisions-needed.md` / `docs/plan-phase4/00-decisions-needed.md`
의 `Status: Open` 항목은 **0건**.

> **잔여 결정 대기 0건.** 다음 세션은 어떤 항목 위에서도 새 결정을 받을 필요 없이
> M-LOAD-6 진입 가능. 단, M-LOAD-6 진입 전 §M-LOAD-6 진입 전 권장 절차 참조.

---

## 다음 작업 한 줄

**M-LOAD-6 Redis knee + 최종 종합 보고서 + SLO 임계 갱신 PR 인계** — `docs/plan-phase4/07-m-load-6-redis-knee-and-final-report.md` 정독 후 (1) Redis knee point 정밀 식별 (M-LOAD-4 LP-3 의 fork-time 메모리 한계 cross-link), (2) 4단계 구현 (M-LOAD-1~5) 의 최종 종합 보고서 작성, (3) 3단계 SLO 잠정값 (`prd-phase3/04` §3.1) 의 재조정 PR 트리거 (Q-LOAD-9 p99 × 1.5 적용). M-LOAD-5 closeout 의 후속 cross-link 4건 (T1/T2/T3 트리거 종합 + Capacity 초과 영역 N 매트릭스 + prometheus.yml dns_sd 도입 + architecture.md historical decision 정리) 도 본 마일스톤에서 우선순위 결정.

---

## Recent commits (head → 10개)

```
6bf67c4 docs(docker/k6/scenarios/README): document horizontal scaling runner contract
406fd32 docs(prd-phase4/results): commit horizontal-scaling N=1/2/5/10
7c86b4e docs(README): update worker /metrics access (M-LOAD-5 fix cross-link)
75d164a docs(plan-phase4/06): correct §5 lock + add §3.4 scrape accuracy variant
f7eb029 docs(prd-phase4/04): correct R4.18 — host port mapping fails on --scale
8ce3fdb fix(docker/k6/scripts): drop worker host /metrics readiness (4 runner)
db23169 fix(docker-compose): remove worker host port mapping (M-LOAD-5 N>1 fix)
d9e7031 feat(docker/k6/scripts): add horizontal scaling runner (N matrix)
6d5dc8c docs(README): refresh roadmap progress
7298ebc chore(handoff): snapshot at a6b3b16 — M-LOAD-4 closeout, M-LOAD-5 진입 대기
```

전체 이력은 `git log --oneline -30` 으로 확인.

---

## Notes (자유 메모, /save-state 시 누적/정리)

### M-LOAD-5 closeout (2026-05-28)

- 8 commits. fix 시리즈 5 commits (`db23169` / `8ce3fdb` / `f7eb029` / `75d164a` / `7c86b4e`) + 본질 measurement 3 commits (`d9e7031` / `406fd32` / `6bf67c4`).
- **부하 영역 의존성 패턴:** LP-2 normal R=100 부하가 N=1 capacity 미달 영역이라 SLO-H-1 검증이 자동 위반 (linearity = 1/N). SLO-H-2 (p99 안정성) 만 의미 있는 검증. **이는 PRD §I4.22 의 시스템적 한계** — 부하 영역 의존성이 명확히 식별됨.
- **PRD §R4.18 의 검증된 정정:** docker compose 의 `--scale worker=N` 시 host port 매핑 동적 폴백이 실제로 동작하지 않음. M-LOAD-5 1차 시도 fail 로 검증.
- **prometheus.yml single target round-robin scrape:** N>=2 시 매 scrape (15s) 마다 N 인스턴스 중 1 응답 → counter 점프. 사용자 결정 (2026-05-28 잠금) 으로 변경 없이 진행, 한계는 보고서에 명시.
- **재현성 ±5% 안 확인:** M-LOAD-3 LP-2-normal vs M-LOAD-5 N=1 baseline 비교 통과 (Δ p99 +0.10%, Δ throughput <1%).

### M-LOAD-6 진입 전 권장 절차 (M-LOAD-1~5 발견 사항 cross-link)

Redis knee + 최종 종합 보고서 작성 진입 전 다음 절차 권장:

1. **M-LOAD-1~5 결과 디렉터리 + 보고서 일괄 인덱싱** — `docs/prd-phase4/results/` 의 LP-1/LP-2/LP-3/LP-4/horizontal-scaling 5 보고서 cross-link.
2. **SLO 잠정값 재조정 근거 추출 (Q-LOAD-9 p99 × 1.5)** — M-LOAD-3 LP-2-normal + M-LOAD-5 N=1 의 p99 분포에서 SLO-2/SLO-3 잠정값 재조정 근거. `prd-phase3/04` §3.1 의 잠정 5s/0.5s 가 LP-2 nominal 분포의 ~1000× 여유 영역인지 검증.
3. **Redis knee 정밀 식별 (M-LOAD-4 LP-3 cross-link)** — Bound = fork-time 메모리 한계 (Docker VM 7.65GB). M-LOAD-6 가 본 knee 의 정량화 + Redis HA/Cluster 트리거 조건 명문화 (T1/T2/T3).
4. **prometheus.yml dns_sd 도입 정량화** — M-LOAD-5 의 single target round-robin scrape 영향을 dns_sd 변경 후 동일 측정으로 정량 비교. 별도 PRD/마일스톤 vs M-LOAD-6 안 inline 결정.
5. **Capacity 초과 영역의 N 매트릭스 측정** — R=500 LP-3 영역에서 N 함수의 처리량 증가 검증. LP-3 자체가 Redis fork cliff 영역이라 부하 프로필 재설계 (예: R=500 + P=small 1KB 고정) 필요. 본 영역은 M-LOAD-6 내부 vs 별도 PRD 결정.

### M-LOAD-4 closeout (2026-05-28) — 직전 세션

- 7 commits `3cc5f54` → `a6b3b16`. LP-3 knee 명백 진입 (Bound = Redis fork-time 메모리, Q-LOAD-4 (a) 정합) + LP-4 회복 시간 33.1s 정상 측정.
- 자세한 절차/결과는 git log + `docs/prd-phase4/results/LP-3_2026-05-27.md` + `LP-4_2026-05-28.md` 참조.

### M-LOAD-3 LP-2 closeout (2026-05-27 ~ 2026-05-28) — 더 직전 세션

- 9 commits `19b9b7f` → `92c081e`. SLO 잠정값 + PLAN §3.3 결과 무효 조건 보강 전건 통과.
- **카운터 키 디자인 교훈:** stub variant 의 카운터 키가 결정성 패딩 환경에서 본문 hash 와 충돌할 수 있음. M-LOAD-3 fix `ec1da6d` 의 `payload.idempotencyKey` 우선 + HMAC fallback 패턴이 표준 (LP-3/LP-4 도 동일 적용).

### M-LOAD-2 LP-1 baseline closeout (2026-05-27) — 더 직전 세션

- 9 commits `5cc57f9` → `c1bbfbb`. SLO 잠정값 전건 통과 + 분산 ±5% 안.
- bug fix 3건 (M-LOAD-1 + M-OBS-1 산출물의 실효 검증 누락 fix). 측정 호스트의 baseline ms 영역 노이즈 floor 관찰.

### M-LOAD-1 Bootstrap closeout (2026-05-27) — 더 직전 세션

- 7 commits `7fa3640` → `7e93eed`. cgroup 호환성 통과. N=1/2/5 OK, N=10 통과지만 over-commit (보조 관찰) — M-LOAD-5 에서 over-commit 정상 부트 검증 (단 capacity 미달 영역이라 영향 미관찰).

### 4단계 PRD + PLAN closeout (2026-05-27) — 더 직전 세션

- 4단계 PRD 묶음 9 commits (`34f81d5` → `503452b`). 4단계 PLAN 묶음 10 commits (`ba4c613` → `fba5258`). C-LOAD-1~15 카탈로그 사후 승인. **PRD §R4.18 는 2026-05-28 정정**.

### IT-S7 / IT-OBS-9 spawn timeout flaky 관찰 (2026-05-27)

- 직전 세션 `/save-state` 검증 시 1회차 / 2회차 실패, 3회차 통과 사례 1건. 본 + 직전 세션 검증 모두 1회 통과 — 재발 없음. **후속 권장 (별도 commit 시리즈 / 별도 결정):** `spawn-server.ts` readyTimeoutMs 8000ms → 15000ms 또는 호스트 부하 감지 후 자동 backoff.

### Q-LOAD-1~13 잠금 표 (단일 출처: `prd-phase4/00-decisions-needed.md`)

| Q-ID | 결정 |
|------|------|
| Q-LOAD-1 | k6 (Grafana Labs) |
| Q-LOAD-2 | 로컬 + cgroup 격리 |
| Q-LOAD-3 | PRD 묶음만 (3단계 패턴) |
| Q-LOAD-4 | Redis 단일 인스턴스 한계 식별 → **M-LOAD-4 LP-3 1차 증거 + M-LOAD-5 capacity 미달 영역 검증** |
| Q-LOAD-5 | 정적 부하만 (카오스 제외) |
| Q-LOAD-6 | RPS 중도 셋 (10 / 100 / 500 / 100→1000) |
| Q-LOAD-7 | 페이로드 운영 평균 (80% / 15% / 5%) |
| Q-LOAD-8 | LP-1/4 짧은 (~6.5분), LP-2/3 sustained (~32분) |
| Q-LOAD-9 | p99 × 1.5 (Google SRE 일반 권고) — **M-LOAD-6 가 SLO 잠정값 재조정 PR 트리거** |
| Q-LOAD-10 | α = 0.8 (수평 확장 처리량 선형성) — **M-LOAD-5 4 N 위반 (부하 영역 의존성)** |
| Q-LOAD-11 | β = 1.2 (수평 확장 p99 안정성) — **M-LOAD-5 4 N 통과** |
| Q-LOAD-12 | Markdown 표 (`docs/prd-phase4/results/`) |
| Q-LOAD-13 | IT-LOAD-N 없음 (CI 시간 부담 0) |

### Handoff 메커니즘 메모

- 정확한 슬래시 명령 이름: `/load-state`, `/save-state`.

### 회귀 가드 누적

- **단위 (UT):** UT-1~6 + 보강 (metrics-c-catalog, metrics-d-w-catalog).
- **1~2단계 IT:** IT-S1~S7 + 보강(IT-S1b, IT-S2b, IT-S6b).
- **3단계 IT:** IT-OBS-1~12, IT-R1.
- **M-LOAD-3 IT:** receiver-variants 9 case (단계 7 7 case + fix 회귀 가드 2 case).
- **4단계 측정:** IT-LOAD-N 없음 (Q-LOAD-13 (a) — 부하 회귀는 측정 + 사람 검토 + `docs/prd-phase4/results/` commit 으로 추적).
- 모두 그린 유지가 후속 작업의 진입 조건. **M-LOAD-5 시점: 37 files / 194 passed 유지 (packages/** 변경 0건).**

### 후속 정리 항목 (별도 commit 시리즈 / 별도 결정)

- C-LOAD-1/2/4/9/10/11/12/13/14/15 (10건) — architecture.md / README / CLAUDE.md / 신규 PRD 자리 갱신. M-LOAD 마일스톤 종료 시점에 자연스럽게 일부 도래.
- C-LOAD-6/7/8 (SLO PR 트리거 3건) — **M-LOAD-6 인계**.
- `spawn-server.ts` readyTimeoutMs 보강 (flaky 관찰 cross-link).
- **(M-LOAD-3 fix)** stub variant 카운터 키 디자인 패턴 (idempotencyKey 우선 + HMAC fallback) 을 architecture.md 또는 별도 ADR 로 명문화.
- **(M-LOAD-4)** LP-4 보고서 §6.1 의 `register_rps_achieved` query empty (Prometheus rate window 과 step=5s 의 sparse 분포 가설) — 별도 분석 + fix.
- **(M-LOAD-5)** architecture.md line 35 "worker /metrics 호스트 포트 3001 사용으로 3002 로 이동" 코멘트가 fix `db23169` 이후 historical decision 표현 — 별도 정리 권장 (C-LOAD-11 cross-link).
- **(M-LOAD-5)** prometheus.yml dns_sd_configs 도입 + N 인스턴스 정확도 정량화 — 별도 PRD 또는 M-LOAD-6 안 inline 결정 영역.
- **(M-LOAD-5)** Capacity 초과 영역의 N 매트릭스 측정 (R=500 영역, 부하 프로필 재설계) — 별도 PRD 영역.
- README.md line 203 의 `현재 상태: 117 tests passed` (stale, 실제 194) — 별도 follow-up commit (사용자 명시 요청 시).
