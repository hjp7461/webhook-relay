# Handoff Snapshot

> **자동 생성/갱신 파일.** `/save-state` 명령이 갱신하고, `/load-state` 명령이 읽는다.
> 본 파일은 **시점 스냅샷**이지 단일 출처가 아니다. 새 세션은 항상 본 파일을 1차 컨텍스트로 받되, **git/PLAN/테스트로 재검증**한 뒤 작업을 시작한다.

---

## Meta

- **Last updated:** 2026-05-27 (M-LOAD-2 closeout, 9 commits)
- **At commit:** `c1bbfbb`
- **Branch:** `main`
- **Sync:** `origin/main` 0/9 — push 대기 (`/save-state` 가 처리)
- **Working tree:** clean (HANDOFF.md 갱신 stage 예정 외)

---

## Status Overview

- **typecheck:** ✅ 0 errors
- **tests:** ✅ **36 files / 185 passed** (코드 변경 0건 — 직전 HANDOFF 동일)
- **core boundary grep:** ✅ 0 hits
- **`docker compose config`:** ✅ default 5 서비스 + `--profile measure` 6 서비스 (k6 + api healthcheck)
- **CI workflow:** `.github/workflows/test.yml` (unit + integration 분리)
- **누적 commit:** `a035dce`(초기) 이후 180+ commits

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
| **4단계 구현 (k6 시나리오 + 측정)** | 🟡 M-LOAD-2 완료 | M-LOAD-2 9 commits closeout. **M-LOAD-3 대기** |
| 부록 트랙 (Streams Internals) | ⏳ 미착수 | `packages/streams-internals/` 자리만 예약 |

---

## 4단계 마일스톤 진행도 (`docs/plan-phase4/01-milestones.md` 표 정합)

| ID | 이름 | 상태 | 핵심 |
|----|------|------|------|
| M-LOAD-1 | Bootstrap (k6 서비스 + 골격 + 메타데이터 헬퍼) | ✅ 완료 | 7 commits `7fa3640` → `7e93eed` |
| **M-LOAD-2** | LP-1 baseline 측정 | ✅ **완료** | 9 commits `5cc57f9` → `c1bbfbb`. **SLO 잠정값 전건 통과 + 분산 ±5% 안** |
| **M-LOAD-3** | LP-2 nominal sustained (4 변형) | ⏳ **다음** | `04-m-load-3-lp2-nominal.md` |
| M-LOAD-4 | LP-3 stress + LP-4 spike (knee point 1차) | ⏳ 미착수 | `05-m-load-4-lp3-lp4.md` |
| M-LOAD-5 | 수평 확장 N ∈ {1,2,5,10} × LP-2 + SLO-H 검증 | ⏳ 미착수 | `06-m-load-5-horizontal-scaling.md` |
| M-LOAD-6 | Redis knee + 최종 보고서 + SLO 임계 갱신 PR 인계 | ⏳ 미착수 | `07-m-load-6-redis-knee-and-final-report.md` |

---

## M-LOAD-2 LP-1 baseline closeout (2026-05-27, 9 commits)

| Commit | 단계 | 변경 |
|--------|------|------|
| `5cc57f9` | 0 | docs(plan-phase4/03): PLAN §4 단계 1 명세 정합 갱신. **사용자 결정 2건 잠금** — HMAC 헤더 부착 제외 + payload 1024 bytes = request body 전체 |
| `6390ac6` | 1 | feat(docker/k6/scenarios): `lp-1.js` k6 시나리오 (constant-arrival-rate, R=10, P=small 1KB 동적 패딩) |
| `05da624` | 2 | feat(docker/k6/scripts): `run-lp-1.sh` 8 단계 측정 자동화 (POSIX shell) |
| `42ddab1` | 3 | chore(docker/k6): `scenarios/README.md` 시나리오 계약 (§1~§4) |
| `ee419ce` | fix | fix(docker-compose): api `/healthz` healthcheck. **사용자 결정** — M-LOAD-1 산출물 (k6.depends_on.api.condition: service_healthy) 의 실효 검증 누락 fix |
| `50e57b4` | fix | fix(run-lp-1.sh): fail-fast readiness gate + trap cleanup. **사용자 결정** — set -e 정합 + cleanup 단일 출처 |
| `11bdd0d` | fix | fix(run-lp-1.sh): --build flag (stale image 방지). 측정 중 발견된 silent staleness 버그 fix |
| `0d5b3e8` | 5 | docs(prd-phase4/results): `LP-1_2026-05-27.md` 결과 보고서 (8 절) |
| `c1bbfbb` | 6 | chore(gitignore): `docker/k6/results/LP-*/ + horizontal-scaling-*/ + final-*/ + micro-n-matrix-*/` ignore. **사용자 결정** — Markdown 보고서 단일 출처 |

### LP-1 측정 핵심 결과 (Run 1 + Run 2 cross-check)

- **SLO 잠정값 전건 통과:** 5xx 0%, 등록 p99 4.99ms (임계 500ms 의 1.0%), 전달 p99 9.94ms (임계 5000ms 의 0.2%), DLQ 0%.
- **분산 ±5% 안 (PRD §7.2):** RPS ±0.0007%, SLO-2 ±0.52%, SLO-3 ±0.18%, 카디널리티 ±0%.
- **측정 환경 한계 발견** — baseline ms 영역의 노이즈 floor 가 Docker Desktop 누적 상태에 민감. 첫 시도 (-13.5% 분산) → Docker Desktop 재시작 + 호스트 idle 화 후 +0.18% 회복.

---

## ⚠️ M-LOAD-5 진입 전 보조 관찰 (M-LOAD-1 단계 6 §5a 결론)

- N=1/2/5 시 cgroup 호환성 통과. cgroup 격리 의미 손상 없음.
- **N=10 시 §4 단계 6 기준 3건은 모두 통과** (worker × N = 10 ≤ 호스트 코어-1 = 11).
- 보조 관찰: 전체 6 서비스 cgroup 총합(15.0 cpus) 이 호스트 코어(12) **over-commit**. M-LOAD-5 진입 전 PRD `prd-phase4/04` §2.3 정합 재검토 권장 (매트릭스 축소 결정 위임 가능).

---

## ⚠️ M-LOAD-3 진입 전 권장 절차 (M-LOAD-2 측정 환경 한계 cross-link)

LP-1 측정에서 발견된 baseline ms 영역의 노이즈 floor 영향으로, M-LOAD-3 sustained 측정 (W_load 30분 + 4 변형) 진입 전 다음 절차 권장:

1. **측정 호스트 idle 화** — Chrome / Slack / IDE 등 백그라운드 닫기 (PRD `02` §7.3 격리 정책).
2. **Docker Desktop 재시작** — 누적 VM 상태 + 캐시 노이즈 제거 (M-LOAD-2 1차 대응 효과 검증됨).
3. **측정 분산 ±5% 초과 시 즉시 사용자 보고** — PRD §7.2 1차 대응 절차 정합 (보고서 `LP-1_2026-05-27.md` §5 cross-link).
4. **`run-lp-2.sh` 작성 시 `run-lp-1.sh` 의 안전망 (fail-fast readiness + trap cleanup + --build) 동일 패턴 적용.**

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

## M-LOAD-2 사용자 결정 잠금 (5건, 본 commit 시리즈 인라인)

| # | 결정 | 적용 commit |
|---|------|-------------|
| 1 | HMAC 헤더 부착 제외 (k6 시나리오 외 책임) | `5cc57f9` + `6390ac6` |
| 2 | payload 1024 bytes = `POST /webhooks` request body 전체 (D3 정합) | `5cc57f9` + `6390ac6` |
| 3 | docker-compose api 서비스에 `/healthz` healthcheck 추가 (M-LOAD-1 산출물 fix) | `ee419ce` |
| 4 | `run-lp-1.sh` 결합 fix — fail-fast readiness gate + trap cleanup (set -e 정합) | `50e57b4` |
| 5 | `.gitignore` raw artifact 디렉터리 전체 (LP-* / horizontal-scaling-* / final-* / micro-n-matrix-*) | `c1bbfbb` |

본 5건은 모두 commit 메시지 본문에 결정 잠금 cross-link 명시.

---

## ⚠️ 사용자 결정 대기 항목

`docs/plan/00-decisions-needed.md` / `docs/plan-phase3/00-decisions-needed.md` /
`docs/prd-phase4/00-decisions-needed.md` / `docs/plan-phase4/00-decisions-needed.md`
의 `Status: Open` 항목은 **0건**.

> **잔여 결정 대기 0건.** 다음 세션은 어떤 항목 위에서도 새 결정을 받을 필요 없이
> 작업 진입 가능. 단, M-LOAD-3 진입 전 §M-LOAD-3 진입 전 권장 절차 + M-LOAD-5
> 진입 전 §M-LOAD-5 진입 전 보조 관찰 참조.

---

## 다음 작업 한 줄

**M-LOAD-3 LP-2 nominal sustained 측정** — `docs/plan-phase4/04-m-load-3-lp2-nominal.md` 정독 후 LP-2 (R=100 RPS, P=80/15/5, W=~32분, 4 변형 normal/s3/s4/s5) k6 시나리오 작성 + IT-S3/S4/S5 부하 변형 stub + SLO 잠정값 검증 분포 확보. 진입 전 §M-LOAD-3 진입 전 권장 절차 (호스트 idle 화 + Docker Desktop 재시작) 준수.

---

## Recent commits (head → 10개)

```
c1bbfbb chore(gitignore): ignore 4단계 measurement raw artifact directories
0d5b3e8 docs(prd-phase4/results): commit LP-1 baseline measurement report
11bdd0d fix(docker/k6/scripts/run-lp-1.sh): pass --build to docker compose up
50e57b4 fix(docker/k6/scripts/run-lp-1.sh): fail-fast readiness gate + trap cleanup
ee419ce fix(docker-compose): add api /healthz healthcheck for k6 depends_on
42ddab1 chore(docker/k6): document LP-1 scenario contract
05da624 feat(docker/k6/scripts): add LP-1 measurement runner script
6390ac6 feat(docker/k6/scenarios): add LP-1 baseline scenario (R=10, P=small)
5cc57f9 docs(plan-phase4/03): align M-LOAD-2 stage 1 spec with system reality (2 user decisions)
b3c58d9 chore(handoff): snapshot at 7e93eed — M-LOAD-1 Bootstrap closeout, M-LOAD-2 진입 대기
```

전체 이력은 `git log --oneline -30` 으로 확인.

---

## Notes (자유 메모, /save-state 시 누적/정리)

### M-LOAD-2 LP-1 baseline closeout (2026-05-27)

- 9 commits, **packages/** 코드 변경 0건** (typecheck/test 카운트 직전 HANDOFF 동일).
- 단계 0 의 PLAN 본문 갱신 (`5cc57f9`) 이 단계 1 사용자 결정 2건 (HMAC 제외 / 페이로드 기준) 의 글자 단위 잠금 — 본 마일스톤 시점 단일 출처.
- **bug fix 3건 (M-LOAD-1 + M-OBS-1 산출물의 실효 검증 누락 fix):**
  - `ee419ce` — docker-compose api 서비스 healthcheck 누락. k6.depends_on.api.condition: service_healthy 가 즉시 실패하던 사일런트 버그.
  - `50e57b4` — run-lp-1.sh 의 readiness 폴링이 timeout 도달 시 fallthrough. set -e 와 의미 불일치. trap EXIT 단일 cleanup 으로 통합.
  - `11bdd0d` — docker compose up 에 --build 없어 stale webhook-relay-api 이미지 (M-OBS-1 이전 시점) 가 cache 로 재사용되어 /metrics 404. 매 측정 사이클 image 갱신 보장.
- **측정 환경 한계 (baseline ms 영역의 노이즈 floor):**
  - 첫 시도 (06-20-52Z / 06-31-01Z): SLO-3 전달 p99 분산 -13.5% (33.95ms → 29.36ms). PRD §7.2 ±5% 초과 → 결과 폐기.
  - 1차 대응 (PRD §7.2): Docker Desktop 재시작 + 호스트 idle 화.
  - 재측정 (06-46-26Z / 06-53-40Z): SLO-3 분산 +0.18% (9.94ms / 9.96ms). 측정 신뢰성 회복.
  - 후속 절차: `LP-1_2026-05-27.md` §5.1 + 본 HANDOFF §M-LOAD-3 진입 전 권장 절차.

### M-LOAD-1 Bootstrap closeout (2026-05-27) — 직전 세션

- 7 commits `7fa3640` → `7e93eed`. 코드 변경 0건. 사용자 결정 2건 잠금 (prometheus.command 형태 + cgroup 호환성 체크 절차).
- **본 마일스톤 (M-LOAD-2) 진행 중 M-LOAD-1 산출물의 실효 검증 누락 발견** — api healthcheck 부재 + run-lp-1.sh stale image 영향. fix commit 3건 (`ee419ce` / `50e57b4` / `11bdd0d`) 으로 보강.

### 4단계 PRD + PLAN closeout (2026-05-27) — 직전 세션

- 4단계 PRD 묶음 9 commits (`34f81d5` → `503452b`).
- 4단계 PLAN 묶음 10 commits (`ba4c613` → `fba5258`).
- C-LOAD-1~15 카탈로그 사후 승인.

### IT-S7 / IT-OBS-9 spawn timeout flaky 관찰 (2026-05-27)

- 직전 세션 `/save-state` 검증 시 IT-S7 + IT-OBS-9 가 1회차 / 2회차 실패, 3회차 통과 사례 1건.
- 실패 메시지: `child server did not start within 8000ms`.
- 본 세션 검증 3회 모두 1회 통과 — 재발 없음.
- 원인 추정: 호스트 부하/디스크 IO/Node.js 초기 로드 지연.
- **후속 권장 (별도 commit 시리즈 / 별도 결정):** `spawn-server.ts` readyTimeoutMs 8000ms → 15000ms 또는 호스트 부하 감지 후 자동 backoff. 본 세션 범위 밖.

### 본 세션 이전 누적 사항 (3단계 PLAN closeout)

- CLAUDE.md §7-6 존대말 (`8a44c11`), 자율 일탈 사전 승인 규칙 memory.
- M-OBS-1~6 + C-MET-1~17.
- 결정 대기 §1~§3 잠금 (IT-R1 `http` PRD §6.1 조정, worker `ports:["3001:3001"]` + Grafana `ports:["3002:3000"]`, step 10 commit 유지).

### Handoff 메커니즘 메모

- 정확한 슬래시 명령 이름: `/load-state`, `/save-state`.

### 회귀 가드 누적

- **단위 (UT):** UT-1~6 + 보강 (metrics-c-catalog, metrics-d-w-catalog).
- **1~2단계 IT:** IT-S1~S7 + 보강(IT-S1b, IT-S2b, IT-S6b).
- **3단계 IT:** IT-OBS-1~12, IT-R1.
- **4단계:** IT-LOAD-N 없음 (Q-LOAD-13 (a) 결정 — 부하 회귀는 측정 + 사람 검토 + `docs/prd-phase4/results/` commit 으로 추적).
- 모두 그린 유지가 후속 작업의 진입 조건.

### 후속 정리 항목 (별도 commit 시리즈 / 별도 결정)

- C-LOAD-1/2/4/9/10/11/12/13/14/15 (10건) — architecture.md / README / CLAUDE.md / 신규 PRD 자리 갱신. M-LOAD 마일스톤 종료 시점에 자연스럽게 일부 도래.
- C-LOAD-6/7/8 (SLO PR 트리거 3건) — M-LOAD-6 인계.
- `spawn-server.ts` readyTimeoutMs 보강 (flaky 관찰 cross-link).
- M-LOAD-5 진입 전 PRD `prd-phase4/04` §2.3 재검토 (N=10 over-commit 보조 관찰).
- **(신규)** M-LOAD-2 발견 — `run-lp-2.sh`/`run-lp-3.sh`/`run-lp-4.sh` 작성 시 `run-lp-1.sh` 의 안전망 (fail-fast readiness + trap cleanup + --build flag) 동일 패턴 적용.
