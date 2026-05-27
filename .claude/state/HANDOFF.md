# Handoff Snapshot

> **자동 생성/갱신 파일.** `/save-state` 명령이 갱신하고, `/load-state` 명령이 읽는다.
> 본 파일은 **시점 스냅샷**이지 단일 출처가 아니다. 새 세션은 항상 본 파일을 1차 컨텍스트로 받되, **git/PLAN/테스트로 재검증**한 뒤 작업을 시작한다.

---

## Meta

- **Last updated:** 2026-05-28 (M-LOAD-3 LP-2 closeout, 9 commits)
- **At commit:** `92c081e`
- **Branch:** `main`
- **Sync:** `origin/main` 0/9 — push 대기 (`/save-state` 가 처리)
- **Working tree:** clean (HANDOFF.md 갱신 stage 예정 외)

---

## Status Overview

- **typecheck:** ✅ 0 errors
- **tests:** ✅ **37 files / 194 passed** (직전 36 / 185 → +1 file / +9 tests — receiver-variants 신규 7 + fix 회귀 가드 +2)
- **core boundary grep:** ✅ 0 hits
- **`docker compose config`:** ✅ default 5 서비스 + `--profile measure` 6 서비스 (k6 + api healthcheck)
- **CI workflow:** `.github/workflows/test.yml` (unit + integration 분리)
- **누적 commit:** `a035dce`(초기) 이후 190+ commits

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
| **4단계 구현 (k6 시나리오 + 측정)** | 🟡 M-LOAD-3 완료 | M-LOAD-3 9 commits closeout. **M-LOAD-4 대기** |
| 부록 트랙 (Streams Internals) | ⏳ 미착수 | `packages/streams-internals/` 자리만 예약 |

---

## 4단계 마일스톤 진행도 (`docs/plan-phase4/01-milestones.md` 표 정합)

| ID | 이름 | 상태 | 핵심 |
|----|------|------|------|
| M-LOAD-1 | Bootstrap (k6 서비스 + 골격 + 메타데이터 헬퍼) | ✅ 완료 | 7 commits `7fa3640` → `7e93eed` |
| M-LOAD-2 | LP-1 baseline 측정 | ✅ 완료 | 9 commits `5cc57f9` → `c1bbfbb`. SLO 잠정값 전건 통과 + 분산 ±5% 안 |
| **M-LOAD-3** | LP-2 nominal sustained (4 변형) | ✅ **완료** | 9 commits `19b9b7f` → `92c081e`. **SLO 잠정값 + PLAN §3.3 결과 무효 조건 보강 전건 통과** (W3 attempts 3.0 / SLO-4 DLQ 1.0×2 / D3 80/15/5) |
| **M-LOAD-4** | LP-3 stress + LP-4 spike (knee point 1차) | ⏳ **다음** | `05-m-load-4-lp3-lp4.md` |
| M-LOAD-5 | 수평 확장 N ∈ {1,2,5,10} × LP-2 + SLO-H 검증 | ⏳ 미착수 | `06-m-load-5-horizontal-scaling.md` |
| M-LOAD-6 | Redis knee + 최종 보고서 + SLO 임계 갱신 PR 인계 | ⏳ 미착수 | `07-m-load-6-redis-knee-and-final-report.md` |

---

## M-LOAD-3 LP-2 closeout (2026-05-27 ~ 2026-05-28, 9 commits)

| Commit | 단계 | 변경 |
|--------|------|------|
| `19b9b7f` | 1 | feat(docker/k6/scenarios): LP-2 k6 시나리오 (constant-arrival-rate R=100, mulberry32 PRNG + K6_SEED=0). **사용자 결정** — K6_SEED env 결정성 채택 |
| `df2ae52` | 2 | feat(demo/receiver): variant-aware stub (`?variant=normal\|s3\|s4\|s5`). **사용자 결정** — api/receiver.ts 직접 수정 (PLAN §5 alternative 정합) + HMAC 헤더값 카운터 키 (1차) |
| `4ba565f` | 3 | feat(docker/k6/scripts): run-lp-2.sh 4 변형 × 8 단계 측정 자동화 (run-lp-1.sh 안전망 동일) |
| `958b13d` | 7 | test(demo/receiver): receiver-variants 7 IT (1~2단계 IT-S1/S3/S4/S5 회귀 가드) |
| `37ff8cc` | 6 | docs(docker/k6/scenarios/README): §2 LP-2 절 추가 + 후속 절 +1 밀기 |
| `cad7526` | + | docs(README): refresh roadmap progress. **사용자 명시 요청** — 로드맵 섹션만 |
| `ec1da6d` | **fix** | **fix(demo/receiver, docker/k6): body.idempotencyKey s3 counter key.** root cause = 결정성 패딩 + 송신 본문에 idempotencyKey 부재 → multiple unique 작업이 동일 HMAC 충돌 |
| `35e018c` | chore | chore(docker/k6/scripts): run-lp-2.sh `[5b]` api/worker container logs capture |
| `92c081e` | 5 | docs(prd-phase4/results): LP-2 4 변형 결과 보고서 (`LP-2_2026-05-27.md`, 316 lines) |

### M-LOAD-3 LP-2 측정 핵심 결과 (재측정 2026-05-27T12:53:06Z → 15:04:55Z, 2시간 11분)

- **SLO 잠정값 전건 통과** (LP-2-normal, R=100 RPS): 5xx 0%, 등록 p99 **4.97ms** (임계 500ms 의 0.99%), 전달 p99 **9.91ms** (임계 5000ms 의 0.20%), DLQ 0%.
- **PLAN §3.3 결과 무효 조건 보강 4건 전건 통과**:
  - normal: D3 페이로드 p50 735B / p99 54.5KB (80/15/5 정합)
  - **S3: W3 attempts 평균 = 3.0** (정확히 K+1=3, 시계열 max-min Δ 0.013%)
  - S4: SLO-4 DLQ 적재율 = 1.0
  - S5: C5 non_retriable rate = 94.14 RPS avg (1 attempt 정합)
- **측정 분산** (PRD §7.2): 4 변형 RPS achieved Δ ≤ 0.01%, normal SLO Δ ≤ 0.40%.
- **카디널리티** 4 변형 165/207/166/166 ≤ 1000 (IT-OBS-11).

### S3 fix root cause + 1차 측정 무효 사례 (2026-05-27 첫 측정)

- 첫 측정 (`08:01Z → 10:46Z`) 의 S3 변형에서 **W3 attempts ≈ 1** 발견 (의도 K+1=3). PLAN §3.3 결과 무효 조건 발동.
- **Root cause 조사 흐름** — production-flow IT (SERVICE_MODE=all 단일 process) 통과 vs smoke (SERVICE_MODE=api+worker 분리) fail 재현 → debug log 추가 (lp-2.js setup + VU=0 송신 url, receiver.ts 진입점 첫 20 요청) → smoke 2 의 api.log 에서 **첫 8 회 unique 작업이 동일 HMAC `sha256=7f337d428...`** 확인.
- **원인:** worker 가 외부로 송신하는 본문 = payload 만 (idempotencyKey 는 큐 jobData 안에만). 결정성 패딩으로 (VU, ITER) 가 다른 작업도 동일 `_pad` 길이 생성 → 동일 본문 → 동일 HMAC → receiver 의 `s3Counters` Map 충돌.
- **Fix (`ec1da6d`):** lp-2.js payload 안에 idempotencyKey 부착 + receiver 가 body.idempotencyKey 우선 추출 (HMAC fallback 유지). receiver-variants IT 에 결정성 패딩 충돌 회귀 가드 2 case 추가 (7 → 9).
- **검증** smoke 3 (W_LOAD_S=60): W3 attempts avg = 3.0 정확 일치, worker.log started=27,006 / completed=9,002 / failed=18,004 (= 9000 × 2 retry, K=2 정합).

### 단계 7 IT (commit `958b13d`) 가 처음 잡지 못한 이유

매 it() 마다 **고유 HMAC 값을 명시** (예: `sha256=s3-counter-key-1`). 결정성 패딩으로 multiple unique 작업이 동일 HMAC 를 만드는 패턴은 검증되지 않음. fix 와 함께 추가된 신규 케이스 (commit `ec1da6d` 안의 IT 2 case) 가 본 회귀 가드.

---

## M-LOAD-3 사용자 결정 잠금 (10건, 본 commit 시리즈 인라인)

| # | 결정 | 적용 |
|---|------|------|
| 1 | K6_SEED env + mulberry32 PRNG (결정성 + 측정 호스트 재현성) | `19b9b7f` |
| 2 | api/receiver.ts 직접 수정 (PLAN §5 alternative 정합 — `receiver/` 디렉터리는 store.ts 만) | `df2ae52` |
| 3 | s3 카운터 키 (1차) = HMAC 헤더값 | `df2ae52` (이후 fix 로 변경) |
| 4 | 본 세션에서 전체 측정 background 실행 | 1차 측정 + 재측정 둘 다 |
| 5 | 측정 진행 모니터링 = 30분 polling (Monitor) | 1차 + 재측정 |
| 6 | s3 W3 attempts 무효 대응 = s3 변형 재측정 (조사 + fix 우선) | smoke 1~3 + 재측정 |
| 7 | s3 원인 조사 = production-flow IT 추가 (`_temp-s3-production-flow.integration.test.ts`) | (검증 후 삭제) |
| 8 | s3 카운터 키 fix = payload.idempotencyKey 부착 + receiver 추출 | `ec1da6d` |
| 9 | SERVICE_MODE 분리 디버그 = receiver.ts + run-lp-2.sh logs capture + smoke 2 | 1차 fail 분석 + 결정적 검증 |
| 10 | LP-2 재측정 범위 = 4 변형 전체 (~140분) | 재측정 (commit `35e018c` 후) |

본 10건 모두 commit 메시지 본문 또는 본 HANDOFF 의 fix root cause 절에 cross-link 명시.

---

## ⚠️ 사용자 결정 대기 항목

`docs/plan/00-decisions-needed.md` / `docs/plan-phase3/00-decisions-needed.md` /
`docs/prd-phase4/00-decisions-needed.md` / `docs/plan-phase4/00-decisions-needed.md`
의 `Status: Open` 항목은 **0건**.

> **잔여 결정 대기 0건.** 다음 세션은 어떤 항목 위에서도 새 결정을 받을 필요 없이
> 작업 진입 가능. 단, M-LOAD-5 진입 전 §M-LOAD-5 진입 전 보조 관찰 (M-LOAD-1 단계 6
> §5a 결론) 참조.

---

## 다음 작업 한 줄

**M-LOAD-4 LP-3 stress (R=500) + LP-4 spike (100→1000→100) 측정** — `docs/plan-phase4/05-m-load-4-lp3-lp4.md` 정독 후 LP-3 (R=500 RPS, P=large 64KB 고정, W=~32분) + LP-4 (base→spike→base 30s spike, total ~15분) k6 시나리오 작성 + knee point 1차 탐색 (Redis CPU / p99 / 큐 길이 중 어느 것이 먼저 비선형 진입). 본 마일스톤 commit 시리즈에 LP-3/LP-4 `run-*.sh` 작성 시 `run-lp-1.sh` / `run-lp-2.sh` 의 안전망 (fail-fast readiness + trap cleanup + `--build` flag + [5b] logs capture) 동일 패턴 적용.

---

## Recent commits (head → 10개)

```
92c081e docs(prd-phase4/results): commit LP-2 normal + S3/S4/S5 variants
35e018c chore(docker/k6/scripts): capture container logs in run-lp-2.sh
ec1da6d fix(demo/receiver, docker/k6): use body.idempotencyKey as s3 counter key
cad7526 docs(README): refresh roadmap progress
37ff8cc docs(docker/k6/scenarios/README): document LP-2 contract + variant
958b13d test(demo/receiver): integration tests for variant-aware stub
4ba565f feat(docker/k6/scripts): add LP-2 measurement runner (4 variants)
df2ae52 feat(demo/receiver): add variant-aware stub response modes
19b9b7f feat(docker/k6/scenarios): add LP-2 nominal sustained scenario
8701acd chore(handoff): snapshot at c1bbfbb — M-LOAD-2 LP-1 baseline closeout, M-LOAD-3 진입 대기
```

전체 이력은 `git log --oneline -30` 으로 확인.

---

## Notes (자유 메모, /save-state 시 누적/정리)

### M-LOAD-3 LP-2 closeout (2026-05-27 ~ 2026-05-28)

- 9 commits, 본질 fix 1건 (`ec1da6d`) + 측정 인프라 보강 1건 (`35e018c`) + 단계 1/2/3/5/6/7 + README 현행화.
- **카운터 키 디자인 교훈:** stub variant 의 카운터 키가 결정성 패딩 환경에서 본문 hash 와 충돌할 수 있음. 향후 다른 stub 변형 추가 시 작업 식별자 (idempotencyKey) 우선 사용 + HMAC fallback 패턴 적용.
- **production-flow IT 패턴:** receiver-variants IT 가 fastify 라우트만 직접 호출하면 worker → API → 큐 → fetch 흐름의 specific 동작을 놓침. M-LOAD-4 의 LP-3/LP-4 변형 (있을 시) 도 동일 회귀 가드 패턴.
- **debug 흔적 cleanup:** smoke 진행 중 lp-2.js / receiver.ts 에 임시 console.log 추가 후 fix commit (`ec1da6d`) 에서 모두 제거 완료. 현재 코드에 debug 잔여 0.
- **api/worker container logs capture (`[5b]`):** run-lp-2.sh 에서 cleanup 직전 캡처. 향후 M-LOAD-4/5/6 의 측정 안전망으로도 유지.

### M-LOAD-2 LP-1 baseline closeout (2026-05-27) — 직전 세션

- 9 commits `5cc57f9` → `c1bbfbb`. **SLO 잠정값 전건 통과 + 분산 ±5% 안.**
- bug fix 3건 (M-LOAD-1 + M-OBS-1 산출물의 실효 검증 누락 fix):
  - `ee419ce` — docker-compose api 서비스 healthcheck 누락.
  - `50e57b4` — run-lp-1.sh fail-fast readiness gate + trap cleanup.
  - `11bdd0d` — `--build` flag (stale image 방지).
- **측정 환경 한계 (baseline ms 영역의 노이즈 floor):** 첫 시도 분산 -13.5% → Docker Desktop 재시작 + 호스트 idle 화 후 +0.18% 회복. M-LOAD-3 진입 전 권장 절차 (호스트 idle + Docker Desktop 재시작) — 본 세션 1차 + 재측정 둘 다 적용.

### M-LOAD-1 Bootstrap closeout (2026-05-27) — 더 직전 세션

- 7 commits `7fa3640` → `7e93eed`. cgroup 호환성 통과. N=1/2/5 OK, N=10 통과지만 over-commit (보조 관찰).

### 4단계 PRD + PLAN closeout (2026-05-27) — 더 직전 세션

- 4단계 PRD 묶음 9 commits (`34f81d5` → `503452b`). 4단계 PLAN 묶음 10 commits (`ba4c613` → `fba5258`). C-LOAD-1~15 카탈로그 사후 승인.

### IT-S7 / IT-OBS-9 spawn timeout flaky 관찰 (2026-05-27)

- 직전 세션 `/save-state` 검증 시 1회차 / 2회차 실패, 3회차 통과 사례 1건. 실패 메시지: `child server did not start within 8000ms`. 본 세션 검증 모두 1회 통과 — 재발 없음.
- **후속 권장 (별도 commit 시리즈 / 별도 결정):** `spawn-server.ts` readyTimeoutMs 8000ms → 15000ms 또는 호스트 부하 감지 후 자동 backoff.

### M-LOAD-5 진입 전 보조 관찰 (M-LOAD-1 단계 6 §5a 결론)

- N=1/2/5 cgroup 호환성 통과. N=10 시 3건 모두 통과 (worker × N = 10 ≤ 호스트 코어-1 = 11).
- 전체 6 서비스 cgroup 총합(15.0 cpus) 이 호스트 코어(12) **over-commit**. M-LOAD-5 진입 전 PRD `prd-phase4/04` §2.3 정합 재검토 권장.

### M-LOAD-4 진입 전 권장 절차 (M-LOAD-2/3 발견 사항 cross-link)

LP-3 stress (R=500) / LP-4 spike (100→1000→100) 측정 진입 전 다음 절차 권장:

1. **측정 호스트 idle 화** — Chrome / Slack / IDE 닫기 (PRD `02` §7.3). M-LOAD-2 의 baseline ms 영역 노이즈 cross-link.
2. **Docker Desktop 재시작** — 누적 VM 상태 + 캐시 노이즈 제거. M-LOAD-3 측정 직후 누적 가능.
3. **측정 분산 ±5% 초과 시 즉시 사용자 보고** — PRD §7.2 1차 대응 절차 정합.
4. **`run-lp-3.sh` / `run-lp-4.sh` 작성 시 `run-lp-2.sh` 안전망 패턴 동일 적용** — fail-fast readiness + trap cleanup + `--build` + `[5b]` api/worker logs capture.
5. **LP-3 의 페이로드 = large 64KB 고정** — 결정성 패딩 시 `_pad` 길이 재계산. lp-2.js 의 동적 계산 패턴 mirror.

### Q-LOAD-1~13 잠금 표 (단일 출처: `prd-phase4/00-decisions-needed.md`)

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

### Handoff 메커니즘 메모

- 정확한 슬래시 명령 이름: `/load-state`, `/save-state`.

### 회귀 가드 누적

- **단위 (UT):** UT-1~6 + 보강 (metrics-c-catalog, metrics-d-w-catalog).
- **1~2단계 IT:** IT-S1~S7 + 보강(IT-S1b, IT-S2b, IT-S6b).
- **3단계 IT:** IT-OBS-1~12, IT-R1.
- **M-LOAD-3 신규 IT:** receiver-variants 9 case (단계 7 7 case + fix 회귀 가드 2 case).
- **4단계:** IT-LOAD-N 없음 (Q-LOAD-13 (a) — 부하 회귀는 측정 + 사람 검토 + `docs/prd-phase4/results/` commit 으로 추적).
- 모두 그린 유지가 후속 작업의 진입 조건.

### 후속 정리 항목 (별도 commit 시리즈 / 별도 결정)

- C-LOAD-1/2/4/9/10/11/12/13/14/15 (10건) — architecture.md / README / CLAUDE.md / 신규 PRD 자리 갱신. M-LOAD 마일스톤 종료 시점에 자연스럽게 일부 도래.
- C-LOAD-6/7/8 (SLO PR 트리거 3건) — M-LOAD-6 인계.
- `spawn-server.ts` readyTimeoutMs 보강 (flaky 관찰 cross-link).
- M-LOAD-5 진입 전 PRD `prd-phase4/04` §2.3 재검토 (N=10 over-commit 보조 관찰).
- **(M-LOAD-3 fix)** stub variant 카운터 키 디자인 패턴 (idempotencyKey 우선 + HMAC fallback) 을 architecture.md 또는 별도 ADR 로 명문화 — 향후 다른 stub 변형 추가 시 동일 패턴 적용.
- README.md line 203 의 `현재 상태: 117 tests passed` (stale, 실제 194) — 별도 follow-up commit 으로 갱신 (사용자 명시 요청 시).
