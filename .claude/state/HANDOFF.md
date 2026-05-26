# Handoff Snapshot

> **자동 생성/갱신 파일.** `/save-state` 명령이 갱신하고, `/load-state` 명령이 읽는다.
> 본 파일은 **시점 스냅샷**이지 단일 출처가 아니다. 새 세션은 항상 본 파일을 1차 컨텍스트로 받되, **git/PLAN/테스트로 재검증**한 뒤 작업을 시작한다.

---

## Meta

- **Last updated:** 2026-05-27 (M-OBS-6 완료 + C-MET 13건 후속 정착 + 결정 대기 §1~§3 잠금 완료)
- **At commit:** `5725281`
- **Branch:** `main`
- **Sync:** push 대기(본 commit 1건 + handoff commit 1건 예정 = 2 commits ahead)
- **Working tree:** HANDOFF.md staged 예정 외 clean

---

## Status Overview

- **typecheck:** ✅ 0 errors
- **tests:** ✅ **36 files / 185 passed** / 0 errors / 0 unhandled rejections
- **core boundary grep:** ✅ 0 hits (`webhook|delivery|fastify|receiver|_demo|Payload` 단어 단위; `webhook_relay_*` 접두는 IT-R1 보강 예외)
- **`docker compose config`:** ✅ pass (worker `ports:["3001:3001"]` + Grafana `ports:["3002:3000"]` 변경 후 검증)
- **CI workflow:** `.github/workflows/test.yml` (unit + integration 분리)
- **누적 commit:** `a035dce`(초기) 이후 140+ commits

---

## 본 저장소 워크플로우 (중요 — 다음 세션이 혼동하지 않도록 명시)

- **단독 개발 + main 직접 작업 + push** 패턴. feature 브랜치 없음.
- `/save-state` 가 `git push origin main` 까지를 표준 절차로 잠금.
- **PRD/PLAN 의 "별도 PR" 표현 = "별도 작업 단위/commit 시리즈로 후속 처리"** 라고 읽는다. 형식적 PR 브랜치 만들지 않는다.

---

## Track 진행도

| 트랙 | 상태 | 비고 |
|------|------|------|
| 1단계 MVP (IT-S1) | ✅ 완료 | M1 Bootstrap, M2 MVP |
| 2단계 장애 복구 (IT-S2~S7) | ✅ 완료 | M3~M7 |
| 후속 정산 | ✅ 완료 | Bearer timing-safe, SSRF DNS, PORT=0, DLQ retention, Redis backoff, stalled-loss recovery, 멱등성×재시도 회귀, PRD 정합 패치 |
| API/Worker 분리 | ✅ 완료 | `SERVICE_MODE` + docker compose `api`/`worker` + `--scale worker=N` |
| Handoff 메커니즘 | ✅ 완료 | `/load-state` + `/save-state` + `.claude/state/HANDOFF.md` |
| 3단계 관측성 | ✅ **완료** | M-OBS-1~6 전건 + C-MET-1~17 17건 (✅ 4건 본 PLAN 내 + ✅ 13건 후속) 정착. `09-acceptance-gates.md` §6/§8 표 최종 잠금 |
| 결정 대기 누적 정리 | ✅ **완료** | §1 IT-R1 `http` token (PRD §6.1 조정), §2 worker 호스트 포트 (3001 매핑 + Grafana 3002 이동), §3 step 10 commit (현 상태 유지 결정) |
| 4단계 부하·측정 | ⏳ 미착수 | PRD/PLAN 미작성 |
| 부록 트랙 (Streams Internals) | ⏳ 미착수 | `packages/streams-internals/` 자리만 예약 |

---

## 3단계 마일스톤 진행도 (전건 완료, 참조용)

| ID | 이름 | 상태 | 핵심 |
|----|------|------|------|
| **M-OBS-1** | Bootstrap | ✅ | prom-client 도입, `core/metrics.ts` 진화, IT-R1 grep `webhook_relay_` 예외, `/metrics` 라우트 골격 |
| **M-OBS-2** | Core Metrics Wiring | ✅ | C1~C11 카탈로그 wiring |
| **M-OBS-3** | Demo Metrics Wiring | ✅ | D1~D3 / W1~W4 wiring + 라벨 enum 잠금 + IT-OBS-4/5/6 |
| **M-OBS-4** | Grafana Provisioning | ✅ | 대시보드 4종 + Dockerfile `ARG GIT_COMMIT` + worker `expose:3001` → 후속에서 `ports:3001:3001` 로 갱신(2026-05-27 §2) + Grafana 3002 이동 |
| **M-OBS-5** | SLO + Alerting Rules | ✅ | rule YAML 4종 + alert 10종 + IT-OBS-10 (정규식 단언, 새 의존성 0건) |
| **M-OBS-6** | Refinement | ✅ | IT-OBS-11 카디널리티 + IT-OBS-12 로그/메트릭 정합 + `09` C-MET 표 최종 확정 |

PLAN 본문: `docs/plan-phase3/02-m-obs-1-bootstrap.md` ~ `07-m-obs-6-refinement.md`. 최종 게이트: `09-acceptance-gates.md` §5.

---

## ⚠️ 사용자 결정 대기 항목

`docs/plan/00-decisions-needed.md` / `docs/plan-phase3/00-decisions-needed.md` 의 `Status: Open` 항목은 **0건**. 직전 누적 §1~§3 도 본 세션에서 모두 잠금:

| 항목 | 결정 (2026-05-27) | 처리 commit |
|------|-------------------|-------------|
| §1 IT-R1 `http` token deviation | **B. PRD 정의 조정** — `prd-phase3/01` §6.1 의 도메인 식별자 집합에서 `http` 제외. `httpServer`/`httpStatus` 식별자(RFC HTTP 어휘) 는 `core` 내부 허용 | `506be9a` |
| §2 worker 호스트 포트 매핑 | **B. 호스트 매핑 + Grafana 3002 이동** — worker `ports:["3001:3001"]`, Grafana `ports:["3002:3000"]`. PRD `prd-phase3/03` §3.1 + README + architecture.md 동기화 | `5725281` |
| §3 M-OBS-4 step 10 commit (`55fa8bf`) | **A. 현 상태 유지** — `packages/demo/src/api/metrics.ts` 주석 7줄 보강(코드 동작 무변경, IT-OBS-9 cross-link) 그대로 유지 | (변경 없음) |

> **잔여 결정 대기 0건.** 다음 세션은 어떤 항목 위에서도 새 결정을 받을 필요 없이 작업 진입 가능.

---

## 다음 작업 한 줄

**3단계 PLAN + 후속 정리 모두 완료. 사용자가 다음 트랙을 선택해야 한다.** 선택지:

- (a) **4단계 PRD/PLAN 작성** — 부하 시나리오, p50/p99 측정, SLO 실측 갱신. `docs/prd-phase4/` 신규 디렉터리. 가장 큰 작업.
- (b) **부록 트랙 진입** — `packages/streams-internals/` 활성화, Raw Redis Streams 직접 구현, BullMQ 대비 추상화 비용 벤치마크.
- (c) **로컬 sanity (수동)** — `GIT_COMMIT=$(git rev-parse HEAD) docker compose build && docker compose up` 후 Grafana `http://localhost:3002` 4 대시보드 + Prometheus `http://localhost:9090/api/v1/rules` 4 rule group + `curl http://localhost:3001/metrics` (worker) 자동 동작 확인. 메인 트랙 안정성 운영 검증.
- (d) **CI 보강** — 현재 `.github/workflows/test.yml` 이 unit/integration 분리. 추가 가드: `docker compose config` 검증, `IT-OBS-7~12` 명시 실행 분리, lint 통합 등.

---

## Recent commits (head → 10개)

```
5725281 feat(docker-compose): expose worker /metrics on host 3001, relocate Grafana to 3002
506be9a docs(prd-phase3/01): exclude 'http' from domain-identifier set (§6.1)
4bfc992 docs(plan-phase3/09): C-MET 위임 13건 모두 ✅ 처리 commit SHA 매핑 추가
b0bb9e5 docs(prd/03): §5.1 IT-OBS-1~12 시나리오 정의 + phase3 cross-link (C-MET-17)
05604d6 docs(claude): §3 폴더 구조에 prometheus/rules + grafana/{dashboards,provisioning} 추가 (C-MET-16)
ba28f6b docs(readme): Prometheus URL + Grafana admin 변경 + SLO 잠정값 명시 (C-MET-9/10/15)
d8318e8 docs(prd/06): /metrics drained route + 알람 라우팅 비목표 명시 (C-MET-5/14)
2c266d2 docs(prd/05): add §6.1 GET /metrics cross-link to prd-phase3/02 (C-MET-4)
3417733 docs(prd/04): metrics 행을 prom-client + Registry 노출로 갱신 (C-MET-1)
d624154 docs(architecture): wire Prometheus/Grafana into components and guarantees (C-MET-3/6/11/13)
```

전체 이력은 `git log --oneline -50` 으로 확인.

---

## Notes (자유 메모, /save-state 시 누적/정리)

### 본 세션 (2026-05-27) 누적 사항 — 3단계 PLAN closeout

- **CLAUDE.md §7-6 (`8a44c11`):** 사용자 응답은 한국어 존대말 강제.
- **자율 일탈 사전 승인 규칙:** memory `feedback_no_autonomous_plan_deviation.md`. 모든 서브에이전트 브리프에 강화 표기.
- **M-OBS-3 자율 일탈 3건 사후 승인:** step 6+9 통합 commit, IT-OBS-6.S6 attempts 분포 약화, `prom-client` dep 명시화.
- **M-OBS-4 자율 결정 2건:** step 10 commit (`55fa8bf`) 주석 보강(§3 결정으로 유지), worker `expose` 포트(§2 결정으로 `ports:["3001:3001"]` 로 갱신).
- **M-OBS-5 fix → revert → 재정착:** `6f05208` → `41cf9dc` → `d3c8581` (정교한 정규식). history 보존.
- **M-OBS-6 자율 일탈 사전 승인 규칙 준수:** step 2 0건 발견 → 스킵.
- **C-MET-1~17 17건 정착:** ✅ 본 PLAN 내 4건 (C-MET-2/7 일부/8/12) + ✅ 후속 13건 (`d624154`~`b0bb9e5`, 7 commits). 단일 출처: `09-acceptance-gates.md` §6/§8.
- **결정 대기 §1~§3 잠금:** PRD `prd-phase3/01` §6.1 (`http` 제외), worker `ports:["3001:3001"]` + Grafana `ports:["3002:3000"]`, step 10 commit 현 상태 유지.

### M-OBS-1 인계 (여전히 적용)

- 통합 테스트 setup 파일(`vitest.integration-setup.ts`) 이 BullMQ idle close 의 `Connection is closed.` unhandled rejection 만 정확히 swallow.
- IT-R1 `http` token 정책은 §1 결정으로 잠금. PRD `prd-phase3/01` §6.1 본문에 명시.

### Handoff 메커니즘 메모

- 정확한 슬래시 명령 이름: `/load-state`, `/save-state` (어순 주의). `.claude/commands/load-state.md` · `save-state.md` 파일 이름이 그대로 등록명.

### 회귀 가드 누적 (최종)

- **단위 (UT):** UT-1~6, ssrf-guard, reconnect-backoff, hmac, classify-error, idempotency-key, config, webhook-create-request-schema, metrics-unit, metrics-c-catalog, metrics-d-w-catalog.
- **1~2단계 IT:** IT-S1~S7 + 보강(IT-S1b, IT-S2b, IT-S6b).
- **3단계 IT:** IT-OBS-1~12 (S1~S7+S6b 매트릭스 포함), IT-R1(보강).
- 모두 그린 유지가 후속 작업의 진입 조건.

### M-OBS-4/5 추가 변경 (사용자 사전 승인 후속)

- `packages/demo/Dockerfile` `ARG GIT_COMMIT=unknown` + `ENV GIT_COMMIT=$GIT_COMMIT`. 로컬 빌드: `GIT_COMMIT=$(git rev-parse HEAD) docker compose build`.
- `docker-compose.yml` `api`/`worker` 서비스 `build.args.GIT_COMMIT: ${GIT_COMMIT:-unknown}` + worker `ports:["3001:3001"]` + Grafana `ports:["3002:3000"]`.
- `README.md` 운영 노트: BullMQ stalled recovery + Grafana admin 변경 + SLO 잠정값 + Grafana URL `http://localhost:3002`.
