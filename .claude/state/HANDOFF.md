# Handoff Snapshot

> **자동 생성/갱신 파일.** `/save-state` 명령이 갱신하고, `/load-state` 명령이 읽는다.
> 본 파일은 **시점 스냅샷**이지 단일 출처가 아니다. 새 세션은 항상 본 파일을 1차 컨텍스트로 받되, **git/PLAN/테스트로 재검증**한 뒤 작업을 시작한다.

---

## Meta

- **Last updated:** 2026-05-27 (M-LOAD-1 Bootstrap closeout, 7 commits)
- **At commit:** `7e93eed`
- **Branch:** `main`
- **Sync:** `origin/main` 0/0 동기 완료
- **Working tree:** clean (HANDOFF.md 갱신 stage 예정 외)

---

## Status Overview

- **typecheck:** ✅ 0 errors
- **tests:** ✅ **36 files / 185 passed**
- **core boundary grep:** ✅ 0 hits
- **`docker compose config`:** ✅ default 5 서비스 + `--profile measure` 6 서비스 (k6 추가)
- **CI workflow:** `.github/workflows/test.yml` (unit + integration 분리)
- **누적 commit:** `a035dce`(초기) 이후 172+ commits

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
| **4단계 구현 (k6 시나리오 + 측정)** | 🟡 M-LOAD-1 완료 | M-LOAD-1 7 commits closeout. **M-LOAD-2 대기** |
| 부록 트랙 (Streams Internals) | ⏳ 미착수 | `packages/streams-internals/` 자리만 예약 |

---

## 4단계 마일스톤 진행도 (`docs/plan-phase4/01-milestones.md` 표 정합)

| ID | 이름 | 상태 | 핵심 |
|----|------|------|------|
| M-LOAD-1 | Bootstrap (k6 서비스 + 골격 + 메타데이터 헬퍼) | ✅ 완료 | 7 commits `7fa3640` → `7e93eed` |
| **M-LOAD-2** | LP-1 baseline 측정 | ⏳ **다음** | `03-m-load-2-lp1-baseline.md` |
| M-LOAD-3 | LP-2 nominal sustained (4 변형) | ⏳ 미착수 | `04-m-load-3-lp2-nominal.md` |
| M-LOAD-4 | LP-3 stress + LP-4 spike (knee point 1차) | ⏳ 미착수 | `05-m-load-4-lp3-lp4.md` |
| M-LOAD-5 | 수평 확장 N ∈ {1,2,5,10} × LP-2 + SLO-H 검증 | ⏳ 미착수 | `06-m-load-5-horizontal-scaling.md` |
| M-LOAD-6 | Redis knee + 최종 보고서 + SLO 임계 갱신 PR 인계 | ⏳ 미착수 | `07-m-load-6-redis-knee-and-final-report.md` |

---

## M-LOAD-1 Bootstrap closeout (2026-05-27, 7 commits)

| Commit | 단계 | 변경 |
|--------|------|------|
| `7fa3640` | 1 | feat(docker-compose): k6 서비스 (profile=measure, cgroup 2.0 cpus / 1G mem) |
| `93ac01d` | 2 | feat(prometheus): remote write receiver. **사용자 결정 (b) 3 인자** — `--config.file` + `--storage.tsdb.path=/prometheus` + `--web.enable-remote-write-receiver` (default CMD 보존) |
| `895243b` | 3 | feat(docker/k6): scenarios + results .gitkeep |
| `07e5aaf` | 4 | feat(docker/k6/scripts): collect-metadata.sh (POSIX sh, macOS/Linux, PRD §5.2 YAML 정합, 8 항목 + hostname) |
| `f226037` | 5 | feat(docs/prd-phase4/results): README.md (150 lines, 5 절) + .gitkeep |
| `3ab4c1a` | 6 | docs(plan-phase4): cgroup 호환성 체크. **사용자 결정 (A) PLAN §5a 신설** — 호스트 12 cores / 32 GB / Docker 29.4.3 통과 |
| `7e93eed` | 7 | docs(.env.example): K6_TARGET_URL / K6_API_BEARER_TOKEN / K6_PROMETHEUS_RW_SERVER_URL (C-LOAD-5 적용) |

---

## ⚠️ M-LOAD-5 진입 전 보조 관찰 (단계 6 §5a 결론)

- N=1/2/5 시 cgroup 호환성 통과. cgroup 격리 의미 손상 없음.
- **N=10 시 §4 단계 6 기준 3건은 모두 통과** (worker × N = 10 ≤ 호스트 코어-1 = 11).
- 보조 관찰: 전체 6 서비스 cgroup 총합(15.0 cpus) 이 호스트 코어(12) **over-commit**. M-LOAD-5 진입 전 PRD `prd-phase4/04` §2.3 정합 재검토 권장 (매트릭스 축소 결정 위임 가능).

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
의 `Status: Open` 항목은 **0건**.

> **잔여 결정 대기 0건.** 다음 세션은 어떤 항목 위에서도 새 결정을 받을 필요 없이
> 작업 진입 가능. 단, M-LOAD-5 진입 전 §M-LOAD-5 진입 전 보조 관찰 참조.

---

## 다음 작업 한 줄

**M-LOAD-2 LP-1 Baseline 측정** — `docs/plan-phase4/03-m-load-2-lp1-baseline.md` 정독 후 첫 측정 사이클 진입 (LP-1 baseline 시나리오 + 결과 보고서 `LP-1_<date>.md` commit). 진입 전 측정 호스트를 idle 상태로 (Chrome / Slack / IDE 백그라운드 닫기 권장 — PRD `02` §7.3 격리 정책).

---

## Recent commits (head → 10개)

```
7e93eed docs(.env.example): add k6 environment variable keys
3ab4c1a docs(plan-phase4): document cgroup host compatibility check procedure
f226037 feat(docs/prd-phase4/results): add directory + README (Q-LOAD-12 정합)
07e5aaf feat(docker/k6/scripts): add measurement host metadata collector
895243b feat(docker/k6): scenarios + results directory placeholder
93ac01d feat(prometheus): enable remote write receiver for k6 metrics
7fa3640 feat(docker-compose): add k6 service (profile=measure)
9523c17 chore(handoff): snapshot at fba5258 — 4단계 PRD+PLAN closeout, M-LOAD-1 진입 대기
fba5258 docs(plan-phase4/10): risks & rollback — 10 핵심 리스크 + 롤백 전략 + 측정 환경 가드
283919a docs(plan-phase4/09): acceptance gates — 마일스톤별 Exit Gate + 최종 게이트 + C-LOAD 매핑
```

전체 이력은 `git log --oneline -30` 으로 확인.

---

## Notes (자유 메모, /save-state 시 누적/정리)

### M-LOAD-1 Bootstrap closeout (2026-05-27)

- 7 commits, **code 변경 0건**. `packages/` / `docker/prometheus.yml` 본문 / `docker/grafana/**` / outline 3 파일 / `docs/prd-phase4/00~05.md` 모두 보존.
- 사용자 결정 2건 (모두 잠금 + commit 메시지에 명시):
  - **단계 2:** prometheus.command 형태 (b) 3 인자. PLAN 잠정 형태 2 인자 시 `--storage.tsdb.path=/prometheus` 사라져 image default 시맨틱 손실 우려 — default CMD 명시적 재선언으로 해결.
  - **단계 6:** cgroup 호환성 체크 형태 (A) PLAN `02-m-load-1-bootstrap.md` §5a 신설. 호스트 12 cores / 32 GB 통과 + N=10 over-commit 보조 관찰 (위 §M-LOAD-5 진입 전 보조 관찰).
- **C-LOAD-3** (k6 서비스 추가) PLAN 안 적용 완료 (`7fa3640`).
- **C-LOAD-5** (.env.example k6 키) PLAN 안 적용 완료 (`7e93eed`).
- 나머지 C-LOAD 13건 (1/2/4/6/7/8/9/10/11/12/13/14/15) 은 별도 commit 시리즈 또는 M-LOAD-6 인계 (PLAN `08-cross-cutting.md` §10 / `09-acceptance-gates.md` §8 단일 출처).

### 4단계 PRD + PLAN closeout (2026-05-27) — 직전 세션

- 4단계 PRD 묶음 9 commits (`34f81d5` → `503452b`).
- 4단계 PLAN 묶음 10 commits (`ba4c613` → `fba5258`).
- C-LOAD-1~15 카탈로그 사후 승인.

### IT-S7 / IT-OBS-9 spawn timeout flaky 관찰 (2026-05-27)

- 직전 세션 `/save-state` 검증 시 IT-S7 + IT-OBS-9 가 1회차 / 2회차 실패, 3회차 통과 사례 1건.
- 실패 메시지: `child server did not start within 8000ms`.
- 본 세션 검증 3회 (단계 8 회귀 + `/save-state` §1 + 단계 4 직전) 모두 1회 통과 — 재발 없음.
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
