# 09. Acceptance Gates — 마일스톤별 Exit Gate 체크리스트 (Phase 3)

> 본 문서는 각 마일스톤이 끝나는 시점에 사용자가 PR 을 닫기 전 확인해야 할
> **Done Gate** 를 단일 출처로 모은다.
>
> **운영 규칙:** 본 체크리스트의 모든 항목이 통과되지 않으면 다음 마일스톤으로
> 진입하지 않는다. 회귀가 발생하면 이전 마일스톤의 게이트로 되돌아간다.

---

## 0. 전 마일스톤 공통 게이트 (모든 PR에 적용)

각 마일스톤이 닫히기 전에 **공통으로** 통과해야 한다.

- [ ] `pnpm install` 이 0 에러.
- [ ] `pnpm typecheck` 0 에러(모든 패키지).
- [ ] `pnpm test:unit` 그린.
- [ ] `pnpm test:integration` 그린.
- [ ] `IT-R1-domain-boundary` 그린 (M-OBS-1 의 보강 룰 적용 후).
- [ ] `core/**` 의 모든 식별자가 도메인 식별자 검사 통과 — `webhook_relay_`
  접두만 예외.
- [ ] 새 의존성을 추가했다면 정당성이 커밋 메시지에 명시되어 있고, CLAUDE.md
  §2 고정 스택 내에 속함 (본 PLAN 전체에서 새 의존성은 `prom-client` 1건만 +
  Docker 이미지 `prom/prometheus`/`grafana/grafana`).
- [ ] Conventional Commits 형식의 커밋 메시지 (원자적, 관심사 분리).
- [ ] 매직 스트링 0건 (`constants.ts`/`config.ts` 외부).
- [ ] `streams-internals/**` 변경 0건.
- [ ] 1~2단계 IT(IT-S1~S7, IT-S1b, IT-S2b, IT-S6b) + UT-1~6 모두 그린.
- [ ] **본 PLAN 범위 안 파일만 수정:** `packages/`, `docker/`, `docker-compose.yml`,
  `.env.example`, `docs/plan-phase3/`. `prd/`, `prd-phase3/00.md~04.md`,
  `architecture.md`, `CLAUDE.md`, `README.md`, `docs/adr/`, `docs/plan/` 변경
  금지 (예외는 PRD `prd-phase3/05` 헤더 보강 1건 — 본 작업 명세 §6).

---

## 1. M-OBS-1 — Bootstrap

### 통과 조건

- [ ] `prom-client` 의존성이 `packages/core/package.json` 에 추가.
- [ ] `packages/core/src/metrics.ts` 가 `getMetricsRegistry()` + `enableDefaultMetrics()`
  export.
- [ ] `metrics.unit.test.ts` 그린 — Registry 인스턴스 + default metrics 등장
  단언.
- [ ] `metrics-route.integration.test.ts` 그린 — api 모드 `/metrics` 200 + Content-Type.
- [ ] `worker-metrics-route.integration.test.ts` 그린 — worker 모드 `/metrics` 200.
- [ ] `IT-R1-domain-boundary` 그린 — 단어 경계 + `webhook_relay_` 접두 예외 적용.
- [ ] `WORKER_METRICS_PORT=3001` 이 `.env.example` 에 등장.
- [ ] `demo/constants.ts` 에 `ROUTE_METRICS = "/metrics"` 상수 등장.
- [ ] §0 공통 게이트 전건.

### 데모 동작 가능 상태

- 1~2단계 데모 동작 그대로 + `curl http://localhost:3000/metrics` (api 모드)
  와 `curl http://localhost:3001/metrics` (worker 모드 단독 인스턴스) 가 200
  응답 (기본 prom-client 메트릭만).

### 회귀 보호

- 1~2단계 IT 전건 그린. IT-R1 보강 룰이 새 가드 도입.

---

## 2. M-OBS-2 — Core Metrics Wiring

### 통과 조건

- [ ] IT-OBS-1 그린 — `/metrics` 200 + Content-Type 정합.
- [ ] IT-OBS-2 그린 — C1~C11 카탈로그 11종 전건 `/metrics` 응답에 등장.
- [ ] IT-OBS-3 그린 — `core/` 의 메트릭 이름 정규식 통과 + 헬프 텍스트 도메인
  식별자 0건.
- [ ] `metrics-c-catalog.unit.test.ts` 그린 — C1~C11 의 type/labels/buckets
  PRD 표 정합.
- [ ] PRD `prd-phase3/01` §3.1 의 모든 메트릭 이름·라벨이 `core/` 코드와 글자
  단위 일치 (AC3.1).
- [ ] 라벨 enum 이 `core/constants.ts` 단일 출처 (자유 문자열 0건, AC3.2).
- [ ] §0 공통 게이트 전건.

### 데모 동작 가능 상태

- `curl POST /webhooks` 처리 후 `curl GET /metrics` 가 C1~C11 + 기본 메트릭
  노출.

### 회귀 보호

- 1~2단계 IT 전건 그린 (메트릭 부수 효과 0건).

---

## 3. M-OBS-3 — Demo Metrics Wiring

### 통과 조건

- [ ] IT-OBS-4 그린 — D1~D3 전건 노출.
- [ ] IT-OBS-5 그린 — W1~W4 전건 노출.
- [ ] IT-OBS-6.S1 ~ S7 (S6b 포함) 전건 그린 — PRD `prd-phase3/01` §5 매트릭스
  단언 (AC3.5).
- [ ] `metrics-d-w-catalog.unit.test.ts` 그린.
- [ ] 라벨 enum 이 `demo/constants.ts` 단일 출처 (자유 문자열 0건).
- [ ] §0 공통 게이트 전건.

### 데모 동작 가능 상태

- 1~2단계 데모 동작 + `/metrics` 가 C1~C11 + D1~D3 + W1~W4 전건 노출 (라벨
  값 정상 갱신).

### 회귀 보호

- 1~2단계 IT 전건 그린 — 특히 IT-S3 fake timer 단언, IT-S2 멱등성, IT-S7
  셧다운 시퀀스.

---

## 4. M-OBS-4 — Grafana Provisioning

### 통과 조건

- [ ] IT-OBS-7 그린 — provisioning YAML 2종 유효성.
- [ ] IT-OBS-8 그린 — 대시보드 JSON 4종 UID 안정값.
- [ ] IT-OBS-9 그린 — 셧다운 진행 중 `/metrics` 200 유지 + `/webhooks` 503 +
  `/healthz` 503 (회귀 보호).
- [ ] `docker compose config` 유효.
- [ ] `docker compose up` 후 `curl http://localhost:9090/api/v1/targets` 에
  `webhook-relay-api`/`webhook-relay-worker` 두 잡 `up=1`.
- [ ] Grafana `http://localhost:3001` (admin/admin) 에 4 대시보드 자동 import
  (AC5.1).
- [ ] provisioning `editable: false`/`allowUiUpdates: false` (AC5.5).
- [ ] 대시보드 UID 잠금값 일치 (AC5.6).
- [ ] §0 공통 게이트 전건.

### 데모 동작 가능 상태

- `docker compose up` 한 번으로 redis + api + worker + prometheus + grafana
  전체 스택 기동.
- IT-S1 수동 실행 후 Grafana 처리량 패널 1건 증가 (AC5.2).
- IT-S4 수동 실행 후 DLQ 패널 `reason="max_attempts_exceeded"` 증가 (AC5.3).
- SIGTERM 후 shutdown 패널 "Draining 중 인스턴스 수" 1 → 0 (AC5.4).

### 회귀 보호

- 1~2단계 IT 전건 그린, IT-OBS-1~6 그린.

---

## 5. M-OBS-5 — SLO + Alerting Rules

### 통과 조건

- [ ] IT-OBS-10 그린 — alerting rule YAML 4종 + PromQL 메트릭/라벨 카탈로그
  정합 단언 (AC6.4).
- [ ] AC6.1 — 4 rule YAML 파일 존재.
- [ ] AC6.2 — `promtool check rules` 통과 (수동 또는 IT-OBS-10 자동화).
- [ ] AC6.5 — 알람 라벨에 `severity` + `slo` 모두 존재.
- [ ] `http://localhost:9090/api/v1/rules` 에 4 group 등장 (수동 확인 가능).
- [ ] §0 공통 게이트 전건.

### 데모 동작 가능 상태

- Prometheus 가 4 rule group 로드. IT-S4 수동 실행 + 30분 후 `WebhookRelayDlqRateHigh`
  ticket 발화 가능 (외부 라우팅 없음 — 본 PRD 범위 밖).

### 회귀 보호

- 1~2단계 IT 전건 그린, IT-OBS-1~9 그린.

---

## 6. M-OBS-6 — Refinement (선택)

### 통과 조건

- [ ] IT-OBS-11 그린 — 카디널리티 메트릭당 ≤ 1000 + PRD §4.4 표 상한 준수
  (AC3.6).
- [ ] IT-OBS-12 그린 — 로그/메트릭 라벨 명명 정합 (정적 검사).
- [ ] (선택) IT-OBS-13 그린 — scrape 실패 알람 end-to-end.
- [ ] 본 문서의 §6 C-MET 표 최종 확정.
- [ ] §0 공통 게이트 전건.

### 데모 동작 가능 상태

- 모든 기능 완성. 본 PLAN 의 최종 게이트 통과 시점.

---

## 7. 본 PLAN 전체의 최종 게이트

본 PLAN 의 모든 마일스톤이 완료되었을 때 사용자가 확인해야 할 최종 체크리스트.

### 코드 품질

- [ ] `pnpm install` 0 에러.
- [ ] `pnpm typecheck` 0 에러.
- [ ] `pnpm test:unit` 그린 — UT-1~6 + 신규 unit (`metrics.unit.test.ts`,
  `metrics-c-catalog.unit.test.ts`, `metrics-d-w-catalog.unit.test.ts`).
- [ ] `pnpm test:integration` 그린 — IT-S1~S7, IT-S1b, IT-S2b, IT-S6b, IT-R1
  (보강), IT-OBS-1~12 전건.

### 도메인 격리

- [ ] `core/` 의 어떤 식별자도 도메인 식별자 BANNED 세트(`webhook`/`delivery`/
  `http`/`fastify`/`receiver`/`_demo`/`Payload`) 와 단어 단위로 일치하지 않음.
- [ ] `webhook_relay_` 접두는 IT-R1 grep 예외 룰 안에서 통과.

### 데모 동작 (`docker compose up` 한 번)

- [ ] redis + api + worker + prometheus + grafana 5개 컨테이너 정상 기동.
- [ ] `curl POST /webhooks` 가 `202 + jobId` 응답 (1~2단계 보장).
- [ ] 외부 수신자(`/_demo/receiver`) 에 1건 도착 (1~2단계 보장).
- [ ] `curl http://localhost:3000/metrics` (api) 가 C1~C11 + D1~D3 + W1~W4
  전건 노출.
- [ ] `curl http://localhost:3001/metrics` (worker) 도 동일.
- [ ] `http://localhost:9090` Prometheus UI 접속, `/api/v1/targets` 에 2 잡
  `up=1`, `/api/v1/rules` 에 4 rule group.
- [ ] `http://localhost:3001` Grafana 접속 (admin/admin), 4 대시보드 자동 import.

### 카디널리티

- [ ] IT-OBS-11 단언이 메트릭당 ≤ 1000, PRD §4.4 표 상한 준수.

### 셧다운

- [ ] SIGTERM 전송 시 `/webhooks` 503, `/healthz` 503, `/metrics` 200 유지
  (Q-OBS-2 (a)).
- [ ] 잔여 작업 없는 정상 종료 시 exit code 0. 타임아웃 시 exit code 1 (Q-SEC-4 (b)).

### 본 PLAN 범위 보호

- [ ] `packages/streams-internals/` 변경 0건.
- [ ] `docs/prd-phase4/` 자리 만들지 않음.
- [ ] 1~2단계 PRD/CLAUDE.md/README 본문 변경 없음 (예외는 본 작업 명세 §6 의
  `prd-phase3/05` 헤더 1건만).

### 결정 보존

- [ ] 1~2단계 Resolved 21건 모두 보존 (`docs/plan/00-decisions-needed.md`
  변경 없음).
- [ ] 3단계 Resolved 15건 (`docs/plan-phase3/00-decisions-needed.md`) 변경 없음.
- [ ] 본 PLAN 실행 중 새 Q-OBS-# 추가가 있었다면 추적 가능.

---

## 8. PRD 변경 제안 (C-MET-1~17) 최종 매핑

본 PLAN 안에서 직접 적용된 C-MET 와 별도 PR 로 사용자가 결정 위임된 C-MET 를
단일 출처로 정리한다.

> **최종 확정 시점:** M-OBS-6 — 본 PLAN 의 모든 마일스톤 종료 시점에 갱신.
> 표의 ✅ (적용 완료) / ❌ (별도 PR 위임) 상태는 M-OBS-6 단계에서 잠긴다.

### 본 PLAN 내 직접 적용 (4건, ✅)

| 상태 | C-MET ID | 적용 마일스톤 | 적용 형태 |
|------|----------|----------------|------------|
| ✅ | **C-MET-2** | M-OBS-1 | IT-R1 grep 룰을 `webhook_relay_` 접두 예외 처리하도록 갱신. PRD/architecture.md 본문 갱신은 별도 PR. |
| ✅ | **C-MET-7 (일부)** | M-OBS-1 | `.env.example` 에 `WORKER_METRICS_PORT=3001` 추가. `METRICS_BEARER_TOKEN` 은 Q-OBS-1 (a) 결정에 따라 도입 안 함. |
| ✅ | **C-MET-8** | M-OBS-4 | `docker-compose.yml` worker 서비스에 `/metrics` 포트 노출 (Q-OBS-3 (a) 정합). |
| ✅ | **C-MET-12** | M-OBS-4 | `docker/grafana/.gitkeep` 제거 (실제 파일이 들어오므로). |

### 별도 PR 로 사용자 결정 위임 (13건, ❌)

| 상태 | C-MET ID | 대상 문서 | 갱신 제안 | 위임 이유 |
|------|----------|-----------|-----------|-----------|
| ❌ | **C-MET-1** | `prd/04-architecture-boundaries.md` §7 표 | "메트릭 정의(정의만) — 실제 노출은 3단계" 줄을 "3단계 PRD에서 prom-client 도입 + 도메인 무관 메트릭 정의 + Registry 노출" 로 갱신 | PRD 갱신 — 별도 PR. |
| ❌ | **C-MET-3** | `architecture.md` §5 | "Prometheus/Grafana 관측성(3단계 PRD)" 줄을 "보장한다" 로 이동 | 본 PLAN 완료 후 별도 PR. |
| ❌ | **C-MET-4** | `prd/05-api-and-contracts.md` §4 또는 §6 | `GET /metrics` 명세 추가 또는 본 PRD `prd-phase3/02` 로 cross-link | 별도 PR. |
| ❌ | **C-MET-5** | `prd/06-security-and-ops.md` §6.2 표 | `/metrics` 행 추가 (Q-OBS-2 (a) — 200 유지) | 별도 PR. |
| ❌ | **C-MET-6** | `architecture.md` §2 컴포넌트 표 | "Metrics Endpoint" 행 추가 (`packages/demo/src/api/metrics.ts`) | 별도 PR. |
| ❌ | **C-MET-9** | `README.md` 빠른 시작 | "Prometheus: http://localhost:9090" 추가 | 별도 PR. |
| ❌ | **C-MET-10** | `README.md` 운영 노트 | "Grafana admin 기본값 변경" 항목 추가 | 별도 PR. |
| ❌ | **C-MET-11** | `architecture.md` §2 컴포넌트 표 | "Prometheus" / "Grafana" 행 추가 | 별도 PR. |
| ❌ | **C-MET-13** | `architecture.md` §5 "보장한다" | SLO-1~4 항목 추가 | PLAN 완료 후 별도 PR. |
| ❌ | **C-MET-14** | `prd/06-security-and-ops.md` 운영 노트 | "알람 라우팅·온콜은 본 PRD 범위 밖" 명시 | 별도 PR. |
| ❌ | **C-MET-15** | `README.md` 운영 노트 | "SLO 임계는 잠정값이며 4단계 실측 후 재조정" 명시 | 별도 PR. |
| ❌ | **C-MET-16** | `CLAUDE.md` §3 폴더 구조 | `docker/prometheus/rules/` 추가 명시 | **CLAUDE.md 수정**은 본 PLAN 범위 밖. 사용자 결정 후 별도 PR. |
| ❌ | **C-MET-17** | `prd/03-test-strategy.md` 또는 새 phase3 test-strategy | IT-OBS-1~12 시나리오 정의 | 별도 PR. |

> PLAN `07-m-obs-6-refinement.md` §10 의 표가 본 §8 의 단일 출처 짝이며,
> 두 표는 글자 단위로 일치한다(M-OBS-6 잠금 시점 기준).

### 본 PLAN 완료 후 권장 PR 순서

1. **C-MET-1, C-MET-6, C-MET-11** — architecture.md 컴포넌트 표/PRD §7 표 갱신
   (M-OBS-1 직후라도 가능, 본 PLAN 완료 후가 자연스러움).
2. **C-MET-3, C-MET-13** — architecture.md §5 "보장한다" 절 갱신 (본 PLAN 완료
   후).
3. **C-MET-4, C-MET-5** — PRD `05`/`06` 의 라우트/셧다운 표 갱신.
4. **C-MET-9, C-MET-10, C-MET-14, C-MET-15** — README 갱신 (운영 노트 + 빠른
   시작).
5. **C-MET-16** — CLAUDE.md §3 폴더 구조 갱신.
6. **C-MET-17** — PRD `03-test-strategy.md` 또는 신규 phase3 test-strategy
   문서.
