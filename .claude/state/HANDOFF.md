# Handoff Snapshot

> **자동 생성/갱신 파일.** `/save-state` 명령이 갱신하고, `/load-state` 명령이 읽는다.
> 본 파일은 **시점 스냅샷**이지 단일 출처가 아니다. 새 세션은 항상 본 파일을 1차 컨텍스트로 받되, **git/PLAN/테스트로 재검증**한 뒤 작업을 시작한다.

---

## Meta

- **Last updated:** 2026-05-28 (M-LOAD-4 closeout, 7 commits)
- **At commit:** `a6b3b16`
- **Branch:** `main`
- **Sync:** `origin/main` 0/7 — push 대기 (`/save-state` 가 처리)
- **Working tree:** clean (HANDOFF.md 갱신 stage 예정 외)

---

## Status Overview

- **typecheck:** ✅ 0 errors
- **tests:** ✅ **37 files / 194 passed** (M-LOAD-3 closeout 시점과 동일 — packages/** 변경 0건)
- **core boundary grep:** ✅ 0 hits
- **`docker compose config`:** ✅ default 5 서비스 + `--profile measure` 6 서비스 (k6 + api healthcheck)
- **CI workflow:** `.github/workflows/test.yml` (unit + integration 분리)
- **누적 commit:** `a035dce`(초기) 이후 197+ commits

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
| **4단계 구현 (k6 시나리오 + 측정)** | 🟡 M-LOAD-4 완료 | M-LOAD-4 7 commits closeout. **M-LOAD-5 대기** |
| 부록 트랙 (Streams Internals) | ⏳ 미착수 | `packages/streams-internals/` 자리만 예약 |

---

## 4단계 마일스톤 진행도 (`docs/plan-phase4/01-milestones.md` 표 정합)

| ID | 이름 | 상태 | 핵심 |
|----|------|------|------|
| M-LOAD-1 | Bootstrap (k6 서비스 + 골격 + 메타데이터 헬퍼) | ✅ 완료 | 7 commits `7fa3640` → `7e93eed` |
| M-LOAD-2 | LP-1 baseline 측정 | ✅ 완료 | 9 commits `5cc57f9` → `c1bbfbb`. SLO 잠정값 전건 통과 + 분산 ±5% 안 |
| M-LOAD-3 | LP-2 nominal sustained (4 변형) | ✅ 완료 | 9 commits `19b9b7f` → `92c081e`. SLO 잠정값 + PLAN §3.3 결과 무효 조건 보강 전건 통과 |
| **M-LOAD-4** | LP-3 stress + LP-4 spike (knee point 1차) | ✅ **완료** | 7 commits `3cc5f54` → `a6b3b16`. **LP-3 knee 명백 진입 (Bound = Redis fork-time 메모리, Q-LOAD-4 (a) 정합) + LP-4 회복 시간 33.1s 정상 측정** |
| **M-LOAD-5** | 수평 확장 N ∈ {1,2,5,10} × LP-2 + SLO-H 검증 | ⏳ **다음** | `06-m-load-5-horizontal-scaling.md` |
| M-LOAD-6 | Redis knee + 최종 보고서 + SLO 임계 갱신 PR 인계 | ⏳ 미착수 | `07-m-load-6-redis-knee-and-final-report.md` |

---

## M-LOAD-4 closeout (2026-05-28, 7 commits)

| Commit | 단계 | 변경 |
|--------|------|------|
| `3cc5f54` | 1 | feat(docker/k6/scenarios): LP-3 stress 시나리오 (R=500, P=large 64KB 고정, constant-arrival-rate, W=~32분). idempotencyKey M-LOAD-3 `ec1da6d` cross-link 표준 패턴 |
| `88ebeef` | 2 | feat(docker/k6/scenarios): LP-4 spike 시나리오 (base 100 → spike 1000 → base 100, T_spike=30s, ramping-arrival-rate stages). 본 commit 이 시간 배분 잠금 |
| `bd3ba6e` | 3 | feat(docker/k6/scripts): run-lp-3.sh (Redis stats 30s sampling) + run-lp-4.sh (큐 길이 1초 polling). run-lp-2.sh 안전망 mirror (set -eu + trap + --build + readiness gate + [5b] logs capture) |
| `d7f57c8` | + | docs(docker/k6/scenarios/README): §3 LP-3 + §4 LP-4 절 추가 + 후속 절 +2 밀기 (M-LOAD-3 `37ff8cc` 패턴) |
| `168d63f` | 5 | docs(prd-phase4/results): LP-3 stress + knee point candidate (321 lines). **사용자 결정 잠금: 측정 변수로 기록** (PLAN §3.3 보강 + §2 정합) |
| `ffa2e63` | 6 | docs(prd-phase4/results): LP-4 spike + recovery time (277 lines). 회복 시간 33.1초 + 정상 측정 + T3 트리거 미발화 |
| `a6b3b16` | fix | fix(docker/k6/scripts): run-lp-3.sh line 318 backtick escape (cosmetic stderr, cleanup/exit 무관). LP-3 측정 중 발견 |

### M-LOAD-4 LP-3 측정 핵심 결과 (R=500 @ P=64KB, W_load=1840s)

- **knee point 1차 탐색 명확한 결과** — 단일 Redis 인스턴스의 capacity 한계 식별:
  - 처리량 선형성 = 20.02 / 500 = **0.040** (임계 0.8 의 5%)
  - SLO-1 5xx 비율 = **100% sustained** (잠정값 0.5% 의 200×)
  - SLO-2 등록 p99 = 5.0s (k6 timeout cap), LP-2 normal 4.97ms 의 ~1000×
  - SLO-3 전달 p99 max = 1.62s, LP-2 normal 9.91ms 의 163× (잠정값 5s 안엔 통과)
  - C1 큐 waiting avg 104,800 / max 174,500 (워커 포화)
  - cardinality 114 ≤ 1000 (IT-OBS-11 OK)
- **Bound 원인 = Redis fork-time 메모리** (PRD `prd-phase4/04` §5.3 [4]):
  1. R=500 × P=64KB → 워커 처리 capacity ~20 RPS → waiting 큐 1.56 GB/min 폭증
  2. ~3분 후 Redis 메모리 6.4GB 도달 (Docker VM 7.65GB 의 84%)
  3. RDB snapshot fork() 시 COW 로 일시 ~13GB 필요 → fork 실패
  4. `stop-writes-on-bgsave-error=true` 활성 → 모든 write 거부
  5. BullMQ queue.add 거부 → API 5xx 100%
- 증거: `api.log` 1,211건 + `worker.log` 60건 동일 `ReplyError: MISCONF` 패턴
- PLAN §3.3 결과 무효 조건 (RPS achieved ±2% 위반) + §2 사용자 결정 위임 → **측정 변수로 기록** (사용자 결정 잠금 2026-05-28)
- **Q-LOAD-4 (a) "Redis 단일 인스턴스 한계 식별" 정합**

### M-LOAD-4 LP-4 측정 핵심 결과 (base 100 → spike 1000 × 30s → base 100, total 10m 53s)

- **회복 시간 = 33.1초** (baseline waiting p95=2 로 회복) — base RPS 100 안에서 정상 회복
- baseline (W_base_1 60s~300s, 240s): waiting avg=0.9 / max=2 (정상 ~0)
- T_spike (300s~340s, 30s): waiting avg=3,697 / max=10,378
- Ramp down (340s~350s) peak: waiting max=20,096
- W_base_2 + cooldown (350s~end): 33초만에 baseline 영역 회복
- SLO-1 5xx = 0% / SLO-4 DLQ = 0% (둘 다 잠정값 안)
- SLO-2 등록 p99 max 9.9ms (잠정값 500ms 의 1.98%)
- SLO-3 전달 p99 max 42.65ms (잠정값 5000ms 의 0.85%)
- cardinality 165 ≤ 1000 (IT-OBS-11 OK)
- spike RPS 1000 도달 검증 간접 (큐 적재 속도 ~900 RPS, 목표의 90%)
- **PRD `prd-phase4/04` §6.2 T3 트리거 미발화** (knee point 가 base RPS 안에 안 들어옴)

### LP-3 vs LP-4 분기 정합

- LP-3 (sustained R=500 × P=64KB) → Redis 메모리 ~3분 만에 fork 영역 진입 → cliff
- LP-4 (spike 1000 × 30s × P=1KB = +27MB 추가) → fork 영역 진입 안 함 → 정상 흡수
- 단일 Redis 의 capacity bound 가 **메모리 (fork-time) 이며 CPU 아님**

---

## ⚠️ 사용자 결정 대기 항목

`docs/plan/00-decisions-needed.md` / `docs/plan-phase3/00-decisions-needed.md` /
`docs/prd-phase4/00-decisions-needed.md` / `docs/plan-phase4/00-decisions-needed.md`
의 `Status: Open` 항목은 **0건**.

> **잔여 결정 대기 0건.** 다음 세션은 어떤 항목 위에서도 새 결정을 받을 필요 없이
> 작업 진입 가능. 단, M-LOAD-5 진입 전 §M-LOAD-5 진입 전 권장 절차 참조.

---

## 다음 작업 한 줄

**M-LOAD-5 수평 확장 N ∈ {1, 2, 5, 10} × LP-2** — `docs/plan-phase4/06-m-load-5-horizontal-scaling.md` 정독 후 N ∈ {1, 2, 5, 10} 워커 인스턴스 × LP-2 nominal (R=100, P=80/15/5, W=~32분) 측정 + SLO-H-1 (α=0.8 수평 확장 처리량 선형성) / SLO-H-2 (β=1.2 수평 확장 p99 안정성) 검증. **M-LOAD-5 진입 전 권장 절차 (§Notes 참조)** 적용.

---

## Recent commits (head → 10개)

```
a6b3b16 fix(docker/k6/scripts): escape backtick in run-lp-3.sh Next steps echo
ffa2e63 docs(prd-phase4/results): commit LP-4 spike + recovery time
168d63f docs(prd-phase4/results): commit LP-3 stress + knee point candidate
d7f57c8 docs(docker/k6/scenarios/README): document LP-3 + LP-4 contracts
bd3ba6e feat(docker/k6/scripts): add LP-3 + LP-4 measurement runners
88ebeef feat(docker/k6/scenarios): add LP-4 spike scenario (base 100 → spike 1000 → base 100)
3cc5f54 feat(docker/k6/scenarios): add LP-3 stress scenario (R=500, P=large)
c528d5a chore(handoff): snapshot at 92c081e — M-LOAD-3 LP-2 closeout, M-LOAD-4 진입 대기
92c081e docs(prd-phase4/results): commit LP-2 normal + S3/S4/S5 variants
35e018c chore(docker/k6/scripts): capture container logs in run-lp-2.sh
```

전체 이력은 `git log --oneline -30` 으로 확인.

---

## Notes (자유 메모, /save-state 시 누적/정리)

### M-LOAD-4 closeout (2026-05-28)

- 7 commits. fix 1건 (`a6b3b16` cosmetic backtick) + 본질 변경 0건 (LP-3 의 knee point bound 가 명확해 재측정 불필요).
- **knee point bound 명확화 패턴:** LP-3 의 결과 무효 조건 발동이 단일 측정만으로 knee point 위치 + bound 원인을 명확히 식별. 재측정의 추가 정보 가치 0 → 측정 변수로 기록 + 후속 마일스톤 인계.
- **k6 ramping-arrival-rate vs constant-arrival-rate 분기:** LP-3/LP-4 가 measurement script 의 stage 처리에서 다름. LP-3 (constant) = warmup k6 invocation + load k6 invocation 별도. LP-4 (ramping) = 단일 invocation 으로 stages 안에 base + spike + base 가 들어감. 향후 spike pattern 의 시나리오 추가 시 동일 패턴.
- **회복 시간 측정 패턴:** queue-depth.jsonl 의 1초 polling + 사후 분석으로 baseline 95th percentile + spike 최대값 + t_recovered 도출. 본 패턴은 향후 다른 spike pattern (LP-5 이상 가능성) 에도 mirror.

### M-LOAD-5 진입 전 권장 절차 (M-LOAD-4 발견 사항 + M-LOAD-1 §5a 보조 관찰 cross-link)

수평 확장 N ∈ {1, 2, 5, 10} × LP-2 측정 진입 전 다음 절차 권장:

1. **측정 호스트 idle 화** — Chrome / Slack / IDE 닫기 (PRD `02` §7.3). M-LOAD-2 baseline ms 영역 노이즈 cross-link.
2. **Docker Desktop 재시작** — 누적 VM 상태 + 캐시 노이즈 제거.
3. **Docker Desktop VM 메모리 한계 검토** — M-LOAD-4 LP-3 에서 7.65GB 한계가 단일 Redis 의 capacity 결정 요인으로 작용. M-LOAD-5 의 N=10 worker × LP-2 (R=100 nominal) 측정에서 동일 한계가 워커/Redis 합산 영역에 작용할 가능성.
4. **PRD `prd-phase4/04` §2.3 재검토** — M-LOAD-1 §5a 보조 관찰의 cgroup 총합 15.0 cpus over-commit (호스트 12 core) + M-LOAD-4 의 메모리 한계 관찰을 종합. N=10 의 워커 cgroup 설정 + 호스트 자원 호환성 확인.
5. **측정 분산 ±5% 초과 시 즉시 사용자 보고** — PRD §7.2 1차 대응 절차 정합.
6. **`run-lp-5.sh` 작성 시 안전망 패턴 동일 적용** — run-lp-1/2/3.sh 의 fail-fast readiness + trap cleanup + `--build` + `[5b]` logs capture + (필요 시) Redis stats sampling.

### M-LOAD-3 LP-2 closeout (2026-05-27 ~ 2026-05-28) — 직전 세션

- 9 commits `19b9b7f` → `92c081e`. SLO 잠정값 + PLAN §3.3 결과 무효 조건 보강 전건 통과.
- **카운터 키 디자인 교훈:** stub variant 의 카운터 키가 결정성 패딩 환경에서 본문 hash 와 충돌할 수 있음. M-LOAD-3 fix `ec1da6d` 의 `payload.idempotencyKey` 우선 + HMAC fallback 패턴이 표준 (LP-3/LP-4 도 동일 적용).
- 자세한 절차/결과는 git log + `docs/prd-phase4/results/LP-2_2026-05-27.md` 참조.

### M-LOAD-2 LP-1 baseline closeout (2026-05-27) — 더 직전 세션

- 9 commits `5cc57f9` → `c1bbfbb`. SLO 잠정값 전건 통과 + 분산 ±5% 안.
- bug fix 3건 (M-LOAD-1 + M-OBS-1 산출물의 실효 검증 누락 fix). 측정 호스트의 baseline ms 영역 노이즈 floor 관찰.

### M-LOAD-1 Bootstrap closeout (2026-05-27) — 더 직전 세션

- 7 commits `7fa3640` → `7e93eed`. cgroup 호환성 통과. N=1/2/5 OK, N=10 통과지만 over-commit (보조 관찰).

### 4단계 PRD + PLAN closeout (2026-05-27) — 더 직전 세션

- 4단계 PRD 묶음 9 commits (`34f81d5` → `503452b`). 4단계 PLAN 묶음 10 commits (`ba4c613` → `fba5258`). C-LOAD-1~15 카탈로그 사후 승인.

### IT-S7 / IT-OBS-9 spawn timeout flaky 관찰 (2026-05-27)

- 직전 세션 `/save-state` 검증 시 1회차 / 2회차 실패, 3회차 통과 사례 1건. 본 세션 검증 모두 1회 통과 — 재발 없음. **후속 권장 (별도 commit 시리즈 / 별도 결정):** `spawn-server.ts` readyTimeoutMs 8000ms → 15000ms 또는 호스트 부하 감지 후 자동 backoff.

### Q-LOAD-1~13 잠금 표 (단일 출처: `prd-phase4/00-decisions-needed.md`)

| Q-ID | 결정 |
|------|------|
| Q-LOAD-1 | k6 (Grafana Labs) |
| Q-LOAD-2 | 로컬 + cgroup 격리 |
| Q-LOAD-3 | PRD 묶음만 (3단계 패턴) |
| Q-LOAD-4 | Redis 단일 인스턴스 한계 식별 → **M-LOAD-4 LP-3 가 1차 증거 식별, Redis fork-time 메모리 한계** |
| Q-LOAD-5 | 정적 부하만 (카오스 제외) |
| Q-LOAD-6 | RPS 중도 셋 (10 / 100 / 500 / 100→1000) |
| Q-LOAD-7 | 페이로드 운영 평균 (80% / 15% / 5%) |
| Q-LOAD-8 | LP-1/4 짧은 (~6.5분), LP-2/3 sustained (~32분) |
| Q-LOAD-9 | p99 × 1.5 (Google SRE 일반 권고) |
| Q-LOAD-10 | α = 0.8 (수평 확장 처리량 선형성) |
| Q-LOAD-11 | β = 1.2 (수평 확장 p99 안정성) |
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
- 모두 그린 유지가 후속 작업의 진입 조건. **M-LOAD-4 시점: 37 files / 194 passed 유지.**

### 후속 정리 항목 (별도 commit 시리즈 / 별도 결정)

- C-LOAD-1/2/4/9/10/11/12/13/14/15 (10건) — architecture.md / README / CLAUDE.md / 신규 PRD 자리 갱신. M-LOAD 마일스톤 종료 시점에 자연스럽게 일부 도래.
- C-LOAD-6/7/8 (SLO PR 트리거 3건) — M-LOAD-6 인계.
- `spawn-server.ts` readyTimeoutMs 보강 (flaky 관찰 cross-link).
- M-LOAD-5 진입 전 PRD `prd-phase4/04` §2.3 재검토 (N=10 over-commit + Docker VM 메모리 한계 보조 관찰).
- **(M-LOAD-3 fix)** stub variant 카운터 키 디자인 패턴 (idempotencyKey 우선 + HMAC fallback) 을 architecture.md 또는 별도 ADR 로 명문화 — 향후 다른 stub 변형 추가 시 동일 패턴 적용.
- **(M-LOAD-4)** LP-4 보고서 §6.1 의 `register_rps_achieved` query empty (Prometheus rate window 과 step=5s 의 sparse 분포 가설) — 별도 분석 + fix (run-lp-4.sh 의 query step/window 조정).
- **(M-LOAD-4)** LP-4 보고서 §6.2 의 "run-lp-4.sh 동일 패턴 존재 확인" 표현 부정확 (실제 0건, 본 표현은 LP-3 측정 종료 직후 추정으로 작성) — 다음 보고서 갱신 시 정정.
- README.md line 203 의 `현재 상태: 117 tests passed` (stale, 실제 194) — 별도 follow-up commit 으로 갱신 (사용자 명시 요청 시).
