# 01. Milestones — M-OBS-1 ~ M-OBS-6 Overview

> 본 문서는 PRD(`docs/prd-phase3/`)를 실행 가능한 마일스톤 시퀀스로 번역한다.
> 각 마일스톤의 상세는 같은 디렉터리의 별도 파일에서 다룬다.
>
> **CLAUDE.md §6 규칙:** 각 마일스톤이 끝나는 시점에 **데모는 항상 동작 가능한
> 상태**여야 한다(M-OBS-1 예외: 라우트 골격과 빈 `/metrics` 응답만 존재하나
> 빌드/테스트 그린 + 기존 1~2단계 데모 동작 유지).
>
> **AI 협업 5원칙 적용:** 마일스톤 진입은 **(a)** 본 PLAN 묶음 전체가 승인되고
> **(b)** 해당 마일스톤이 의존하는 Q-OBS가 잠긴(`00-decisions-needed.md` Status:
> Resolved) 뒤에만 가능하다. **15건 전건 2026-05-27 Resolved이므로 모든 마일스톤
> 진행 가능.**

---

## 1. 마일스톤 한 줄 요약

| # | 이름 | 목표 한 줄 | 대응 PRD 단계 | 대응 IT-OBS 시나리오 |
|---|------|------------|----------------|------------------------|
| **M-OBS-1** | Bootstrap | prom-client 의존성 도입 + `core/metrics.ts` 인터페이스 진화(Q-ARCH-3 약속 이행) + IT-R1 grep 룰 보강(C-MET-2) + worker `/metrics` HTTP 서버 골격 | 본 PRD `02` §4·§5·§7, `01` §6.4 | (없음, 단 IT-R1 보강 단언 도입) |
| **M-OBS-2** | Core Metrics Wiring | 도메인 무관 메트릭(C1~C11)을 `core/{queue,worker,shutdown}.ts`에 instrumented. `/metrics` 라우트가 카탈로그 전건 노출 | 본 PRD `01` §3.1, `02` §3 | IT-OBS-1 (`/metrics` 200·Content-Type), IT-OBS-2 (C 카탈로그 전건), IT-OBS-3 (도메인 격리) |
| **M-OBS-3** | Demo Metrics Wiring | 도메인 메트릭(D1~D3, W1~W4)을 `demo/api/`·`demo/handlers/`·`demo/receiver/`에 instrumented. IT 시나리오 ↔ 메트릭 매트릭스(`01` §5) 단언 | 본 PRD `01` §3.2/§3.3, `02` §4.3 | IT-OBS-4 (D 카탈로그 전건), IT-OBS-5 (W 카탈로그 전건), IT-OBS-6 (IT-S1~S7 시 매트릭스 단언) |
| **M-OBS-4** | Grafana Provisioning | 4개 대시보드 JSON + provisioning YAML 2종 + `docker-compose.yml` Grafana/Prometheus 서비스 추가. `prometheus.yml` scrape 설정 갱신 | 본 PRD `03` 전체 | IT-OBS-7 (provisioning 유효성), IT-OBS-8 (대시보드 UID 안정성), IT-OBS-9 (셧다운 시 `/metrics` 200 — Q-OBS-2 (a)) |
| **M-OBS-5** | SLO + Alerting Rules | SLO 4종 + Prometheus alerting rule YAML 4종 작성. `promtool check rules` 통과. Prometheus 컨테이너에 rule_files 마운트 | 본 PRD `04` 전체 | IT-OBS-10 (`promtool check rules` 통과 + PromQL 라벨 카탈로그 정합) |
| **M-OBS-6** | Refinement (선택) | 카디널리티 가드 통합 테스트 + 로그/메트릭 라벨 정합 + scrape 실패 알람 + 잔여 C-MET 정리. 최소 범위로 축소 가능 | 본 PRD `01` §4, `02` §10 | IT-OBS-11 (카디널리티 ≤ 1000), IT-OBS-12 (로그 필드 ↔ 메트릭 라벨 정합 일부) |

> **PLAN 범위 외(명시적 거부):** 4단계(부하/측정/수평 확장), 부록 트랙(`packages/streams-internals/`).
> PRD `prd-phase3/05` §1 그대로 유지.

---

## 2. 의존 그래프 (ASCII)

```
           ┌──────────────────────────────────┐
           │  결정 필요 항목 잠금 (15건)         │
           │  (docs/plan-phase3/00-...md)      │
           │  → 2026-05-27 전건 Resolved       │
           └────────────────┬─────────────────┘
                            ▼
                ┌────────────────────────┐
                │  M-OBS-1: Bootstrap    │
                │  prom-client 도입 +    │
                │  core/metrics.ts 진화 +│
                │  IT-R1 grep 보강 +     │
                │  worker /metrics 골격  │
                └────────────┬───────────┘
                             ▼
                ┌────────────────────────┐
                │  M-OBS-2: Core Metrics │ ← IT-OBS-1,2,3
                │  C1~C11 wiring         │
                └────────────┬───────────┘
                             ▼
                ┌────────────────────────┐
                │  M-OBS-3: Demo Metrics │ ← IT-OBS-4,5,6
                │  D1~D3, W1~W4 wiring   │
                │  IT-S1~S7 매트릭스 단언│
                └────────────┬───────────┘
                             ▼
                ┌────────────────────────┐
                │  M-OBS-4: Grafana      │ ← IT-OBS-7,8,9
                │  4 대시보드 + provisi. │
                │  Prometheus 컨테이너   │
                └────────────┬───────────┘
                             ▼
                ┌────────────────────────┐
                │  M-OBS-5: SLO + Alerts │ ← IT-OBS-10
                │  rule YAML 4종         │
                │  promtool check 통과   │
                └────────────┬───────────┘
                             ▼
                ┌────────────────────────┐
                │  M-OBS-6: Refinement   │ ← IT-OBS-11,12 (선택)
                │  카디널리티 가드 + 정리│
                └────────────┬───────────┘
                             ▼
                ┌────────────────────────┐
                │ All IT-OBS green +     │
                │ IT-S1~S7,IT-R1 green   │
                │ PLAN done.             │
                └────────────────────────┘
```

### 의존 규칙

- **M-OBS-1 → M-OBS-2** 는 직선 의존 (M-OBS-1이 `core/metrics.ts` 인터페이스를
  진화시키고 prom-client를 도입하면, M-OBS-2가 그 위에 C1~C11을 정의).
- **M-OBS-2 → M-OBS-3** 는 직선 의존 (M-OBS-3은 `core` 메트릭이 노출되고 있다는
  전제 위에 `demo` 메트릭을 추가).
- **M-OBS-3 → M-OBS-4** 는 직선 의존 (Grafana 대시보드는 메트릭 전건이 노출되어
  있는 상태에서만 의미 있는 PromQL을 검증할 수 있음).
- **M-OBS-4 → M-OBS-5** 는 직선 의존 (alerting rule이 Prometheus 컨테이너에서
  evaluation 가능해야 `promtool` 검증이 의미 있음).
- **M-OBS-5 → M-OBS-6** 는 직선 의존 (Refinement는 모든 메트릭/대시보드/알람이
  존재한 뒤 카디널리티/정합 가드를 도입).

### 1~2단계 M1~M7과의 격리 확인

본 PLAN의 모든 마일스톤은 1~2단계 PLAN(`docs/plan/`)의 M1~M7과 **시간순으로
직렬**이며, **이미 완료된 M1~M7의 어떤 구조도 변경하지 않는다**(M-OBS-1의 `core/metrics.ts`
인터페이스 진화는 1~2단계 Q-ARCH-3 (a)가 약속한 "3단계 PRD가 형태를 결정"의
이행). 1~2단계 IT(IT-S1~S7, IT-S1b, IT-S2b, IT-S6b, IT-R1, UT-1~6)는 본 PLAN
모든 마일스톤에서 그린 유지.

```
1~2단계 PLAN (완료):
M1 → M2 → M3 → M4 → M5 → M6 → M7
                                  │
                                  ▼ (M7 완료 + 본 PLAN 승인 후)
3단계 PLAN (본 묶음):
M-OBS-1 → M-OBS-2 → M-OBS-3 → M-OBS-4 → M-OBS-5 → M-OBS-6
```

---

## 3. 마일스톤별 Exit Criteria 요약

각 마일스톤 상세 파일에 같은 항목이 더 자세히 들어 있다. 본 표는 한눈 보기용.

### M-OBS-1 — Bootstrap

- `prom-client` 의존성이 `packages/core/package.json` (및 필요 시 `packages/demo/package.json`)
  에 추가됨. 커밋 메시지에 정당성 명시(CLAUDE.md §2 사전 잠금 이행).
- `packages/core/src/metrics.ts`가 빈 export에서 prom-client Registry 핸들과
  도메인 무관 메트릭 factory를 노출하도록 진화 (Q-ARCH-3 약속 이행).
- IT-R1 grep 룰이 `webhook_relay_` 접두를 예외 처리하도록 보강(C-MET-2).
  단순 substring grep이 아닌 단어 경계 + suffix 처리(예: `\bwebhook\b` 검색
  하되 `webhook_relay_` prefix는 예외).
- `SERVICE_MODE=worker` 분기에서 별도 HTTP 서버(`WORKER_METRICS_PORT`, 기본 3001)
  골격이 추가되어 `GET /metrics`가 빈 응답(prom-client 기본만이라도)을 200으로
  반환.
- `GET /metrics` 라우트가 `demo/api/` 에 도입(API/all 모드에서 동작).
- 회귀: IT-S1~S7, IT-S1b, IT-S2b, IT-S6b, IT-R1, UT-1~6 전건 그린.
- `pnpm install`/`pnpm typecheck`/`pnpm test:unit`/`pnpm test:integration` 그린.

### M-OBS-2 — Core Metrics Wiring

- C1~C11 (도메인 무관 메트릭) 전건이 `core/`의 적합한 모듈에서 갱신.
- IT-OBS-1 (`/metrics` 200 + Content-Type `text/plain; version=0.0.4; charset=utf-8`)
  그린.
- IT-OBS-2 (메트릭 카탈로그 C1~C11 전건이 `/metrics` 응답에 등장 — 값이 0이어도
  메트릭 정의 자체는 노출) 그린.
- IT-OBS-3 (도메인 격리 — `core/metrics.ts`에 도메인 식별자 0건, IT-R1 보강
  정합) 그린.
- 회귀: M-OBS-1 + 1~2단계 IT 전건 그린.

### M-OBS-3 — Demo Metrics Wiring

- D1~D3, W1~W4 (도메인 메트릭) 전건이 `demo/`의 적합한 모듈에서 갱신.
- IT-OBS-4 (D 카탈로그 전건) 그린.
- IT-OBS-5 (W 카탈로그 전건) 그린.
- IT-OBS-6 (IT-S1~S7 시나리오 실행 후 `prd-phase3/01` §5 매트릭스 단언 전건)
  그린.
- 라벨 enum이 `demo/constants.ts` (또는 등가의 단일 출처)에 잠금됨.
- 회귀: M-OBS-1~2 + 1~2단계 IT 전건 그린.

### M-OBS-4 — Grafana Provisioning

- `docker/grafana/dashboards/01-overview.json` ~ `04-shutdown.json` 4종 존재
  (UID 안정값: `webhook-relay-overview` 등).
- `docker/grafana/provisioning/datasources/prometheus.yaml` + `docker/grafana/provisioning/dashboards/webhook-relay.yaml`
  존재.
- `docker-compose.yml` 에 Prometheus + Grafana 서비스 추가, 마운트 경로 정확.
- `docker/prometheus.yml` 의 scrape_configs에 `webhook-relay-api` + `webhook-relay-worker`
  잡 정의 (Q-OBS-3 (a) 정합).
- IT-OBS-7 (Grafana provisioning YAML 파일이 Grafana 9+ 스키마와 일치 —
  apiVersion·필수 필드 정합 단언) 그린.
- IT-OBS-8 (대시보드 JSON 4종의 UID가 `01` §4.0의 잠금값과 정확히 일치) 그린.
- IT-OBS-9 (셧다운 진행 중 `/metrics`가 200 유지 — Q-OBS-2 (a) 단언) 그린.
- `docker compose up` 후 `http://localhost:3001` 접속 시 4개 대시보드 자동 import.
- 회귀: M-OBS-1~3 + 1~2단계 IT 전건 그린.

### M-OBS-5 — SLO + Alerting Rules

- `docker/prometheus/rules/webhook-relay-availability.yaml`, `...-latency.yaml`,
  `...-dlq.yaml`, `...-platform.yaml` 4종 존재.
- `prometheus.yml` 의 `rule_files: ["/etc/prometheus/rules/*.yaml"]` 설정.
- IT-OBS-10 (`promtool check rules docker/prometheus/rules/*.yaml` 통과 +
  PromQL의 메트릭 이름·라벨이 `prd-phase3/01` §3 카탈로그와 글자 단위 일치)
  그린.
- 회귀: M-OBS-1~4 + 1~2단계 IT 전건 그린.

### M-OBS-6 — Refinement (선택)

- IT-OBS-11 (카디널리티 가드 — 실측 시계열 수 × 라벨 조합이 메트릭당 ≤ 1000 ·
  `prd-phase3/01` §4.4 표 준수) 그린.
- IT-OBS-12 (구조화 로그 필드 ↔ 메트릭 라벨 명명 정합 — 핵심 5종: `attempt`,
  `errorClass`, `httpStatus`, `queueName`, `jobId`) 그린.
- 잔여 C-MET 17건 중 PLAN 내 적용 가능 항목 확인 (대부분 별도 PR 위임 — `09-acceptance-gates.md`
  §6 표 참조).
- 회귀: M-OBS-1~5 + 1~2단계 IT 전건 그린.

> **M-OBS-6은 선택 마일스톤.** M-OBS-5 종료 시점에 카디널리티 가드와 로그 정합
> 가드가 이미 도입되어 있다면 M-OBS-6을 건너뛸 수 있다. 단, 본 PLAN의 최종 게이트
> (`09-acceptance-gates.md` §5)는 IT-OBS-11/12를 어느 마일스톤에서든 그린화하기를
> 요구한다.

---

## 4. 마일스톤 간 회귀 방지 약속

- 각 마일스톤 종료 시점에 **이전 모든 마일스톤의 테스트가 그린**이어야 PR을
  닫을 수 있다.
- 이를 위해 각 마일스톤 PLAN은 §9 "회귀 점검" 단계를 둔다.
- 1~2단계 IT 회귀 보장:
  - IT-S1, IT-S1b, IT-S2, IT-S2b, IT-S3, IT-S4, IT-S5, IT-S6, IT-S6b, IT-S7,
    IT-R1, UT-1~6 — 본 PLAN 전 마일스톤에서 그린 유지.
- 메트릭 부수 효과 금지: `prom-client.inc()`/`observe()` 호출이 1~2단계 핸들러의
  동기 응답·재시도·idempotency 검증을 변경하지 않아야 한다(상세 §10 횡단 관심사
  참조).

---

## 5. 본 PLAN의 자체 가드

- **범위 통제(CLAUDE.md §7-3):** 4단계, 부록 트랙은 어떤 마일스톤 PLAN에서도
  다루지 않는다. 위반 발견 시 PR 거절.
- **테스트 우선(CLAUDE.md §7-2):** M-OBS-2~5 각 마일스톤의 1단계는 "실패하는
  IT-OBS-N 테스트 작성". 구현 단계가 그 테스트를 통과시키는 방향으로만 좁아진다.
- **불확실하면 묻기(CLAUDE.md §7-4):** 본 PLAN 실행 중 새 결정이 필요해지면
  `00-decisions-needed.md`에 새 Q-OBS-# 행을 추가한다. 임의 결정 금지.
- **PRD 변경 제안:** PLAN 작성 중 PRD 보강이 필요해 보이면 각 마일스톤 문서의
  §10 "C-MET 적용 시점" 섹션과 `09-acceptance-gates.md` §6 표에만 기록한다.
  PRD 직접 수정은 별도 PR (본 작업 명세 §6 예외 1건 제외).

---

## 6. 다음 단계

1. 본 문서와 `00-decisions-needed.md`를 사용자가 검토(15건 Resolved 확인).
2. M-OBS-1부터 순차 진행. 각 마일스톤은 본 문서의 의존 그래프를 따른다.
3. 각 마일스톤 진입 전 `09-acceptance-gates.md`의 공통 게이트 + 마일스톤별
   게이트를 확인.
4. M-OBS-5 (또는 M-OBS-6) 종료 후 `09-acceptance-gates.md` §5 최종 게이트
   통과 → 본 PLAN 완료.
