# 00. Decisions Needed — Phase 3 결정 필요 항목 (Q-OBS-1~15)

> 본 문서는 PRD `docs/prd-phase3/05-out-of-scope-and-open-questions.md` §2의 **모든
> 오픈 퀘스천 15건**을 그대로 가져와, PLAN 단계의 작업 의존성과 함께 한 곳에 모은
> 단일 출처다.
>
> **전건 Resolved (2026-05-27 — provisional default 일괄 채택).** 사용자가 명시적
> "기본값으로 진행" 결정. 본 문서의 권장 기본값은 PRD `prd-phase3/05`의 Provisional을
> 그대로 옮긴 것이며, 사용자가 2026-05-27에 일괄 잠금한 결과를 §2의 각 항목 Status
> 줄에 기록한다.
>
> **AI 협업 5원칙(CLAUDE.md §7) 적용:** 원칙 4(불확실하면 멈추고 묻는다) —
> 본 PLAN 실행 중 새 결정이 필요해지면 본 문서에 새 Q-OBS-# 행을 추가한다.
> 임의 결정 금지.

---

## 0. 사용법

- 각 항목은 PRD `prd-phase3/05` §2의 `Q-OBS-N` ID를 그대로 보존한다(추적성).
- "막히는 PLAN 항목"은 본 결정이 잠기지 않으면 착수할 수 없는 마일스톤(M-OBS-N)을
  가리킨다.
- "권장 기본값"은 PRD `prd-phase3/05`의 Provisional을 그대로 따른다.
- 사용자가 2026-05-27에 15건 모두 provisional default로 일괄 잠금하였으므로
  각 항목의 Status에 동일 라벨을 기록한다.
- 본 결정이 1~2단계의 Resolved 21건과 충돌하지 않음을 각 항목 끝줄에서 확인한다.

---

## 1. 결정 우선순위 (가장 시급한 항목)

다음 5건은 **M-OBS-1 착수 전에 반드시 잠겨야 한다** (모두 2026-05-27 Resolved).
나머지는 해당 마일스톤 착수 전에 잠기면 된다.

| 우선 | Q-ID | 한 줄 질문 | 권장 기본값 (잠긴 결정) | 막히는 마일스톤 |
|-----|------|------------|--------------------------|------------------|
| ★★★ | Q-OBS-1 | `/metrics` 인증 정책 | (a) 인증 없음 + README 경고 | M-OBS-1, M-OBS-2 |
| ★★★ | Q-OBS-3 | `SERVICE_MODE=worker` `/metrics` 노출 방법 | (a) 워커 최소 HTTP 서버 (`WORKER_METRICS_PORT=3001`) | M-OBS-1 (HTTP 골격), M-OBS-2 (라우트) |
| ★★★ | Q-OBS-2 | 셧다운 진행 중 `/metrics` 응답 | (a) 200 유지 | M-OBS-4 (IT-OBS-9 단언) |
| ★★☆ | Q-OBS-5 | HTTP raw status code를 라벨로 둘지 | (a) status_class enum 유지 | M-OBS-3 (D1·W1 라벨 정의) |
| ★★☆ | Q-OBS-11 | SLO 목표 숫자 확정 시점 | (a) 잠정값 확정 + 4단계 실측 후 재조정 | M-OBS-5 (alerting rule YAML) |

---

## 2. 결정 항목 전체 (PRD `prd-phase3/05` §2 순서 보존)

### 2.1 엔드포인트 / 인증 (3건)

#### Q-OBS-1 — `/metrics` 엔드포인트 인증 정책

- **선택지:**
  - (a) 인증 없음 (내부망 전제)
  - (b) 별도 토큰 (`METRICS_BEARER_TOKEN`, ≥ 32 bytes — Q-SEC-3 정합)
  - (c) 동일 Bearer (`API_BEARER_TOKEN` 재사용)
- **트레이드오프:**
  - (a) — Prometheus scrape 표준 관행. 외부 노출 시 위험.
  - (b) — 권한 분리 우수. 환경변수 추가, scrape 설정 복잡.
  - (c) — 환경변수 단일. 권한 분리 없음.
- **권장 기본값:** **(a) 인증 없음** + README "운영 노트"에 외부 노출 시 (b)로
  격상 권장 명시.
- **막히는 PLAN:** M-OBS-1 (`/metrics` 라우트 인증 미들웨어 형태), M-OBS-4
  (`docker-compose.yml` 환경변수).
- **Status:** Resolved (2026-05-27 — provisional default 일괄 채택). 사용자
  결정.
- **1~2단계 결정과의 충돌 확인:** Q-API-1 (b) "Bearer는 `/webhooks`에만"과 정합
  (`/metrics`는 별도 정책). 충돌 없음.

#### Q-OBS-2 — 셧다운 진행 중 `/metrics` 응답 정책

- **선택지:**
  - (a) 200 유지 (관측 보존)
  - (b) 503으로 거부 (셧다운 명확 신호)
- **트레이드오프:**
  - (a) — 셧다운 진행 상태(C9 `shutdown_state=draining`, C10 `shutdown_remaining_jobs`)를
    외부에서 관측 가능. 1~2단계 PRD `06` §6.2의 `/dashboard`/`/_demo/receiver`
    /`/api/queue/stats`도 200 유지 패턴과 일관.
  - (b) — 셧다운 중인 인스턴스에 메트릭 의존하지 않음을 명확히. 셧다운 SLO 측정
    불가.
- **권장 기본값:** **(a) 200 유지**.
- **막히는 PLAN:** M-OBS-1 (`/metrics` 라우트가 draining 토글의 영향 받지 않도록
  골격 작성), M-OBS-4 (IT-OBS-9 — draining 시 200 유지 단언).
- **Status:** Resolved (2026-05-27 — provisional default 일괄 채택). 사용자
  결정.
- **1~2단계 결정과의 충돌 확인:** PRD `06` §6.2 표의 `/dashboard`·`/_demo/receiver`·
  `/api/queue/stats` 200 유지 패턴과 일관. Q-SEC-5 (a) `/healthz` 503은 별도
  엔드포인트. 충돌 없음.

#### Q-OBS-3 — `SERVICE_MODE=worker` 컨테이너 `/metrics` 노출 방법

- **선택지:**
  - (a) 워커 프로세스에도 최소 HTTP 서버 추가 (Fastify 재사용, 새 환경변수
    `WORKER_METRICS_PORT`, 기본 3001)
  - (b) Prometheus Pushgateway 사용 (push 모델, 새 컴포넌트)
  - (c) API 인스턴스만 메트릭 노출 (워커 메트릭 누락 — 부적합)
- **트레이드오프:**
  - (a) — Fastify 이미 의존성에 있음. 작은 변경. 워커가 HTTP 노출하므로 보안
    경계 한 줄 추가.
  - (b) — 추가 컴포넌트(Pushgateway). 운영 복잡. 멀티 워커 인스턴스 식별 필요.
  - (c) — 핵심 워커 메트릭(C2/C6/C9) 누락. **부적합.**
- **권장 기본값:** **(a) 워커 최소 HTTP 서버**.
- **막히는 PLAN:** M-OBS-1 (worker 모드 `/metrics` HTTP 골격 + `WORKER_METRICS_PORT`),
  M-OBS-4 (`docker-compose.yml` worker 서비스 포트, `prometheus.yml` scrape
  targets).
- **Status:** Resolved (2026-05-27 — provisional default 일괄 채택). 사용자
  결정.
- **1~2단계 결정과의 충돌 확인:** architecture §2 표의 `SERVICE_MODE` 분기 그대로
  유지. `worker` 모드가 HTTP 1개를 더 띄우는 것은 `api`·`all`의 보장(I2.6 그레이스풀
  셧다운)을 침범하지 않는다. 충돌 없음.

---

### 2.2 대시보드 / 인프라 (2건)

#### Q-OBS-4 — Grafana 인증 정책 (admin/admin 데모 vs 환경변수 주입)

- **선택지:**
  - (a) Grafana admin/admin 기본값 (데모 전제)
  - (b) `GF_SECURITY_ADMIN_PASSWORD`를 환경변수로 강제
- **권장 기본값:** **(a)** + README 운영 노트에 변경 권장 명시.
- **막히는 PLAN:** M-OBS-4 (`docker-compose.yml` Grafana 환경변수, `.env.example`
  반영은 C-MET-7 별도 PR).
- **Status:** Resolved (2026-05-27 — provisional default 일괄 채택). 사용자
  결정.
- **1~2단계 결정과의 충돌 확인:** 1~2단계는 Grafana를 다루지 않음. 충돌 없음.

#### Q-OBS-7 — Grafana dashboard-as-code 라이브러리 도입 여부

- **선택지:**
  - (a) GUI export → JSON PR (새 의존성 없음)
  - (b) `grafonnet` / `jsonnet` 도입 (새 의존성)
- **권장 기본값:** **(a) GUI export**.
- **막히는 PLAN:** M-OBS-4 (`docker/grafana/dashboards/*.json` 파일 생성 방식).
- **Status:** Resolved (2026-05-27 — provisional default 일괄 채택). 사용자
  결정.
- **1~2단계 결정과의 충돌 확인:** CLAUDE.md §2 고정 스택 정합 (새 npm 의존성
  추가 회피). 충돌 없음.

---

### 2.3 라벨 / 카디널리티 (3건)

#### Q-OBS-5 — HTTP raw status code를 라벨로 둘지

- **선택지:**
  - (a) `status_class` enum (2xx/3xx/4xx/5xx/none) — 본 PRD 잠정 채택
  - (b) raw status code (200, 503, ...) — 카디널리티 약 60개 추가
- **트레이드오프:**
  - (a) — 카디널리티 보호. 5xx 세부 분석 손실.
  - (b) — 5xx 분포 추적 가능. 카디널리티 증가.
- **권장 기본값:** **(a) status_class enum**.
- **막히는 PLAN:** M-OBS-3 (`demo` D1/D2/W1 라벨 정의, `demo/constants.ts`의
  라벨 enum 잠금).
- **Status:** Resolved (2026-05-27 — provisional default 일괄 채택). 사용자
  결정.
- **1~2단계 결정과의 충돌 확인:** Q-API-3 outgoing 헤더 블랙리스트 정책과
  독립. 충돌 없음.

#### Q-OBS-6 — `attempt` 번호를 별도 라벨로 둘지

- **선택지:**
  - (a) histogram bucket (W3 `delivery_attempts_per_job`)으로 분해 — 본 PRD
    잠정 채택
  - (b) Counter 라벨에 `attempt` 추가
- **권장 기본값:** **(a) histogram bucket**.
- **막히는 PLAN:** M-OBS-2 (C3 정의), M-OBS-3 (W3 정의).
- **Status:** Resolved (2026-05-27 — provisional default 일괄 채택). 사용자
  결정.
- **1~2단계 결정과의 충돌 확인:** Q-RETRY-3 (a) jitter 없음 → 결정성 우선과
  정합 (`attempt` 라벨 없이 histogram bucket으로 분해해도 결정성 단언 가능).
  충돌 없음.

#### Q-OBS-8 — `route` 라벨에 동적 path가 추가될 때 가이드

- **선택지:**
  - (a) 본 PRD는 동적 path 없음 (모든 라우트가 정적). 미래 라우트 추가 시 PRD
    변경 제안 필수.
  - (b) Fastify route schema에서 자동 path 추출 (위험).
- **권장 기본값:** **(a) 정적 path만 + 운영 규칙**.
- **막히는 PLAN:** M-OBS-3 (Fastify metrics plugin의 라벨 추출 로직).
- **Status:** Resolved (2026-05-27 — provisional default 일괄 채택). 사용자
  결정.
- **1~2단계 결정과의 충돌 확인:** PRD `05-api-and-contracts.md`의 라우트 7개는
  모두 정적 path. 충돌 없음.

---

### 2.4 메트릭 형태 (2건)

#### Q-OBS-9 — Histogram 버킷의 잠금 vs 운영 후 재조정

- **선택지:**
  - (a) 본 PRD가 잠금(`prd-phase3/01` §3 표) — 운영 후 버킷 변경은 시계열 재시작
    과 동등.
  - (b) 운영 측정 후 4단계 PRD에서 재조정 (잠정 잠금 후 갱신).
- **권장 기본값:** **(b) 잠정 잠금 + 4단계 실측 후 재조정**.
- **막히는 PLAN:** M-OBS-2 (C4 정의), M-OBS-3 (D2/D3/W2/W3 정의).
- **Status:** Resolved (2026-05-27 — provisional default 일괄 채택). 사용자
  결정.
- **1~2단계 결정과의 충돌 확인:** 1~2단계는 Histogram을 정의하지 않음. 충돌 없음.

#### Q-OBS-10 — `/metrics` 응답 gzip 압축 도입 여부

- **선택지:**
  - (a) 압축 없음 (Fastify 표준 `Accept-Encoding` 협상에 위임)
  - (b) gzip 강제
- **권장 기본값:** **(a) 압축 없음**.
- **막히는 PLAN:** M-OBS-1 (`/metrics` 라우트 응답 헤더 정책).
- **Status:** Resolved (2026-05-27 — provisional default 일괄 채택). 사용자
  결정.
- **1~2단계 결정과의 충돌 확인:** Fastify 기본 동작 수용. 충돌 없음.

---

### 2.5 SLO / 알람 (3건)

#### Q-OBS-11 — SLO 목표 숫자 확정 시점

- **선택지:**
  - (a) 본 PRD에 잠정값(99.5% / 0.5s / 5s / 1%)을 잠그고, 4단계 PRD에서 실측
    기반 갱신
  - (b) 본 PRD에서 잠정값 없이 4단계까지 미정 표기
- **권장 기본값:** **(a) 잠정값 + 4단계 재조정**.
- **막히는 PLAN:** M-OBS-5 (`docker/prometheus/rules/*.yaml` 작성).
- **Status:** Resolved (2026-05-27 — provisional default 일괄 채택). 사용자
  결정.
- **1~2단계 결정과의 충돌 확인:** 1~2단계는 SLO 숫자를 정의하지 않음. 충돌 없음.

#### Q-OBS-12 — Multi-window multi-burn-rate 표준값 (14.4×/6×) 채택

- **선택지:**
  - (a) 14.4× (5m+1h, page) / 6× (30m+6h, ticket) — Google SRE Workbook 표준
  - (b) 다른 burn rate 조합
- **권장 기본값:** **(a) 표준값 채택**.
- **막히는 PLAN:** M-OBS-5 (alerting rule YAML 작성).
- **Status:** Resolved (2026-05-27 — provisional default 일괄 채택). 사용자
  결정.
- **1~2단계 결정과의 충돌 확인:** 1~2단계는 알람 정책을 다루지 않음. 충돌 없음.

#### Q-OBS-13 — `reason="non_retriable"` (4xx 즉시 DLQ)를 SLO-4에 포함할지

- **선택지:**
  - (a) 포함 (DLQ 적재율 = 운영 신호) — 본 PRD 채택
  - (b) 제외 (클라이언트 책임 분리)
- **권장 기본값:** **(a) 포함**.
- **막히는 PLAN:** M-OBS-5 (DLQ alerting rule PromQL).
- **Status:** Resolved (2026-05-27 — provisional default 일괄 채택). 사용자
  결정.
- **1~2단계 결정과의 충돌 확인:** Q-RETRY-1 (a) "3xx = NonRetriableError"와
  Q-DLQ-1 (a) "DLQ 재투입 두지 않음"과 일관 — DLQ에 적재되는 분류는 모두 SLO-4
  운영 신호. 충돌 없음.

---

### 2.6 운영 / 추적성 (2건)

#### Q-OBS-14 — `webhook_relay_` 접두를 IT-R1 grep 예외로 둘지

- **선택지:**
  - (a) IT-R1의 도메인 식별자 grep 대상에서 `webhook_relay_` 접두를 예외 처리
    (애플리케이션 식별자) — 본 PRD 잠정 채택
  - (b) `core/metrics.ts`의 메트릭 접두를 `core_` / `queue_` 로 변경
- **권장 기본값:** **(a) IT-R1 예외**.
- **막히는 PLAN:** M-OBS-1 (IT-R1 보강 코드 작성 — 단어 경계 + suffix 처리).
- **Status:** Resolved (2026-05-27 — provisional default 일괄 채택). 사용자
  결정.
- **1~2단계 결정과의 충돌 확인:** Q-ARCH-2 (c) "IT-R1 통합 테스트로 도메인 경계
  검증"의 실행 정책 갱신. **IT-R1의 의도(도메인 누수 0건)는 그대로 유지**되며,
  `webhook_relay_`(애플리케이션 식별자 접두)만 예외 처리됨. 충돌 없음 — 오히려
  Q-ARCH-2의 약속을 정확히 이행.

#### Q-OBS-15 — Phase 3 PLAN 디렉터리 위치

- **선택지:**
  - (a) `docs/plan-phase3/` (별도 디렉터리)
  - (b) `docs/plan/` 에 M8+ 마일스톤으로 통합
- **권장 기본값:** **(a) `docs/plan-phase3/`**.
- **막히는 PLAN:** PLAN 묶음 부트스트랩(본 문서 디렉터리 위치).
- **Status:** Resolved (2026-05-27 — provisional default 일괄 채택). 사용자
  결정.
- **1~2단계 결정과의 충돌 확인:** 1~2단계 PLAN(`docs/plan/`)과 분리 추적. 충돌
  없음.

---

## 3. 마일스톤별 결정 의존 매트릭스

마일스톤이 시작되기 전에 어떤 Q-OBS가 잠겨야 하는지 한눈에 본다 (전건 Resolved
이지만 추적용 표).

| 마일스톤 | 필수 잠금 Q-OBS-ID |
|---------|--------------------|
| **M-OBS-1** Bootstrap | Q-OBS-1, Q-OBS-3, Q-OBS-10, Q-OBS-14, Q-OBS-15 |
| **M-OBS-2** Core Metrics | Q-OBS-6, Q-OBS-9 |
| **M-OBS-3** Demo Metrics | Q-OBS-5, Q-OBS-8, Q-OBS-9 |
| **M-OBS-4** Grafana | Q-OBS-2, Q-OBS-4, Q-OBS-7 |
| **M-OBS-5** SLO + Alerts | Q-OBS-11, Q-OBS-12, Q-OBS-13 |
| **M-OBS-6** Refinement (선택) | (없음 — 잔여 정리) |

> **운영 규칙:** PLAN의 어떤 마일스톤도 위 표의 자기 행에 있는 Q-OBS가 모두
> Resolved가 되기 전에는 구현 코드를 작성하지 않는다. **15건 전건 2026-05-27
> Resolved이므로 모든 마일스톤 진행 가능.**

---

## 4. 결정 완료 절차 (참고용 — 이미 완료)

1. ~~사용자가 본 문서를 검토하고 각 Q-OBS에 결정을 기록한다.~~ **완료
   (2026-05-27)**.
2. ~~본 문서의 각 Q에 `Status: Resolved (...)` 표기.~~ **완료**.
3. PRD `prd-phase3/05` §2의 동일 Q에도 동일 결과를 반영 — 본 작업 명세 §6 예외
   2건 중 1번 항목 (PRD `prd-phase3/05` §2 헤더에 일괄 잠금 표 추가)으로 진행.
4. §3 매트릭스에 해당하는 마일스톤 PLAN의 §8 "결정 의존" 섹션을 갱신 — 각
   마일스톤 문서에 반영.
5. 그 이후에만 마일스톤 구현 단계로 진입한다.

---

## 5. 총계

- 결정 필요 항목 총 **15건** (PRD `prd-phase3/05` §2와 일치).
- 분류:
  - 2.1 엔드포인트 / 인증 — 3건 (Q-OBS-1, Q-OBS-2, Q-OBS-3)
  - 2.2 대시보드 / 인프라 — 2건 (Q-OBS-4, Q-OBS-7)
  - 2.3 라벨 / 카디널리티 — 3건 (Q-OBS-5, Q-OBS-6, Q-OBS-8)
  - 2.4 메트릭 형태 — 2건 (Q-OBS-9, Q-OBS-10)
  - 2.5 SLO / 알람 — 3건 (Q-OBS-11, Q-OBS-12, Q-OBS-13)
  - 2.6 운영 / 추적성 — 2건 (Q-OBS-14, Q-OBS-15)
- 최우선 5건: Q-OBS-1, Q-OBS-3, Q-OBS-2, Q-OBS-5, Q-OBS-11.
- **전건 Status: Resolved (2026-05-27 — provisional default 일괄 채택). 사용자
  결정.**

---

## 6. 1~2단계 결정 21건과의 정합 보증

본 PLAN의 15건 Q-OBS 결정 중 1~2단계의 21건 결정(`docs/plan/00-decisions-needed.md`)
과 충돌하는 항목이 **없음**을 §2의 각 항목 끝줄에서 확인하였다. 종합 요약:

| 본 PLAN Q-OBS | 1~2단계 관련 결정 | 정합 여부 |
|----------------|---------------------|------------|
| Q-OBS-1 (`/metrics` 인증 없음) | Q-API-1 (b) (`/webhooks` Bearer) | **정합** — `/metrics`는 별도 정책 |
| Q-OBS-2 (셧다운 시 `/metrics` 200) | Q-SEC-5 (a) (`/healthz` 503), PRD `06` §6.2 | **정합** — `/dashboard`·`/_demo/receiver`·`/api/queue/stats` 200 유지 패턴과 일관 |
| Q-OBS-3 (worker HTTP 서버 추가) | architecture §2 `SERVICE_MODE` 분기 | **정합** — `worker` 모드 진화일 뿐 보장 불변 |
| Q-OBS-4 (Grafana admin 데모) | (1~2단계 무관) | **정합** |
| Q-OBS-5 (status_class enum) | Q-API-3 (헤더 블랙리스트) | **정합** — 독립 |
| Q-OBS-6 (attempt histogram) | Q-RETRY-3 (a) jitter 없음 | **정합** — 결정성 단언 가능 |
| Q-OBS-7 (Grafana GUI export) | CLAUDE.md §2 (새 의존성 회피) | **정합** |
| Q-OBS-8 (정적 path만) | PRD `05` 라우트 7개 | **정합** — 모두 정적 |
| Q-OBS-9 (histogram 잠정 잠금) | (1~2단계 무관) | **정합** |
| Q-OBS-10 (압축 없음) | (1~2단계 무관) | **정합** |
| Q-OBS-11 (SLO 잠정값) | (1~2단계 무관) | **정합** |
| Q-OBS-12 (burn rate 14.4×/6×) | (1~2단계 무관) | **정합** |
| Q-OBS-13 (non_retriable 포함) | Q-RETRY-1 (a), Q-DLQ-1 (a) | **정합** |
| Q-OBS-14 (IT-R1 grep 예외) | Q-ARCH-2 (c) | **정합** — IT-R1 의도 보존 + 컨벤션 예외 |
| Q-OBS-15 (`docs/plan-phase3/`) | `docs/plan/` 분리 | **정합** |

**충돌 0건. 21+15 = 36건 전건 정합.**
