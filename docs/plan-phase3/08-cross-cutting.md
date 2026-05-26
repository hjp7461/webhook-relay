# 08. Cross-Cutting Concerns — 횡단 관심사 (Phase 3 Observability)

> 본 문서는 특정 마일스톤에 귀속되지 않고 **여러 마일스톤에 걸쳐 일관되게 적용**
> 되어야 하는 정책을 모은다. 각 항목은 "어느 마일스톤에서 처음 도입되는가"를
> 표로 명시한다.
>
> **AI 협업 5원칙 적용:** 본 문서의 정책은 CLAUDE.md §4·§8, PRD `prd-phase3/01`·`02`·`04`
> 의 규약을 PLAN 수준으로 풀어 적은 것. **임의 결정을 더하지 않는다.** 모호 사항은
> `00-decisions-needed.md` 의 새 Q-OBS-# 행으로 보낸다.

---

## 1. 카디널리티 통제

### 정책 (PRD `prd-phase3/01` §4)

- **메트릭 × 라벨 조합 ≤ 1000** (단일 워커 프로세스 기준).
- **라벨 값은 폐쇄 enum**. 자유 문자열 금지.
- **새 라벨 추가 시 상한 추정 의무.** 상한이 없으면 라벨로 두지 않음.
- **라벨로 두지 않는 식별자(명시적 금지):** `idempotencyKey`, `jobId`, `url`,
  `payload` 내용, `attempt` raw, `requestId`, 외부 수신자 hostname/IP, HTTP raw
  status code (Q-OBS-5 (a)).

### 도입 시점 매트릭스

| 마일스톤 | 도입 항목 |
|---------|-----------|
| **M-OBS-1** | (없음 — 메트릭 자체가 등장 안 함) |
| **M-OBS-2** | C1~C11 라벨 enum이 `core/constants.ts` 에 잠김 |
| **M-OBS-3** | D1~D3, W1~W4 라벨 enum이 `demo/constants.ts` 에 잠김 |
| **M-OBS-4** | (Grafana 패널이 라벨 enum 가정 — PromQL 단언) |
| **M-OBS-5** | (Alerting rule PromQL 이 라벨 enum 가정 — IT-OBS-10 단언) |
| **M-OBS-6** | **IT-OBS-11 카디널리티 가드** (메트릭당 ≤ 1000 + §4.4 상한) |

### 위반 시 검출

- IT-OBS-11 (`it-obs-11-cardinality-guard.integration.test.ts`) 가 통합 테스트
  실행 시 실측치 단언으로 검출. 위반 시 빨강.
- Grafana 패널 PromQL 이 라벨 enum 밖의 값을 참조하면 PromQL evaluation 실패 →
  대시보드에서 visible.

### 운영 규칙

- 새 라벨 추가 절차:
  1. PRD `prd-phase3/01` §4.2 표에 enum 잠금 행 추가.
  2. §4.4 메트릭별 상한 표 갱신.
  3. 1000 예산 초과 시 거부.
  4. 본 PLAN `00-decisions-needed.md` 에 새 Q-OBS-# 추가 — 임의 추가 금지.

---

## 2. Counter 리셋 ↔ PromQL `rate()` 안전성

### 정책 (PRD `prd-phase3/01` §7)

- **Counter 는 워커 프로세스 생명주기 동안만 유효.** 워커 재시작 시 0으로 리셋.
- **Prometheus 는 `rate()`/`increase()` 로 변화량을 계산** — 리셋은 음의 변화로
  탐지되어 자동 처리됨.
- **자체 누적 저장 금지** — Counter 값을 Redis 등에 영속화하지 않는다.
- **워커 수평 확장 시:** `instance` 라벨로 합산되며 Prometheus 표준.

### 도입 시점

| 마일스톤 | 적용 |
|---------|------|
| M-OBS-2 | C1~C11 의 헬프 텍스트에 "process lifetime only" 명시 (필요 시) |
| M-OBS-4 | Grafana 대시보드 PromQL 이 모두 `rate()`/`increase()` 기반 (PRD `03` §4 표 그대로) |
| M-OBS-5 | Alerting rule 의 임계가 `rate()` 기반 비율 (PRD `04` §5 표 그대로) |

### 잠재 함정

- **대시보드의 절대값 패널 금지:** "총 처리량" 패널은 `webhook_relay_jobs_processed_total`
  의 raw 값이 아니라 `rate(...[1m])` 또는 `increase(...[1h])` 로 표시. PRD §4
  표가 이미 그렇게 작성됨.
- **알람 임계의 분모 0 방지:** SLO-4 DLQ 비율은 `clamp_min(sum(...), 1)` 로
  분모 0 방어 (PRD §5.2.3 `WebhookRelayDlqRateHigh` 에 이미 적용).

---

## 3. prom-client Registry 단일성

### 정책 (PRD `prd-phase3/02` §4.1)

- **단일 default registry 만 사용.** 멀티 registry 도입 금지.
- `core/metrics.ts::getMetricsRegistry()` 가 default registry 핸들 반환.
- `core` 와 `demo` 가 같은 default registry 에 메트릭 등록 → `/metrics` 라우트
  는 단일 응답.

### 도입 시점

| 마일스톤 | 적용 |
|---------|------|
| M-OBS-1 | `core/metrics.ts::getMetricsRegistry()` 정의 — `prom-client` `register` 그대로 반환 |
| M-OBS-2 | C1~C11 정의 시 모두 default registry 에 자동 등록 |
| M-OBS-3 | D1~D3, W1~W4 정의 시 모두 default registry 에 자동 등록 |

### 통합 테스트의 격리

- IT-OBS-6.* 같은 시나리오별 통합 테스트가 default registry 를 공유하면 다른
  테스트의 메트릭 값이 누적되어 단언 실패할 수 있음.
- **해결:** 각 IT-OBS-N 의 setup 에서 `prom-client::register.clear()` 호출.
  단, 이는 **테스트 전용**이며 운영 코드에서는 절대 호출하지 않음 — `register.clear()`
  는 모든 메트릭 정의를 지우므로 운영 중 호출 시 `/metrics` 가 빈 응답.

### 위반 시 검출

- `core/metrics.ts` 안에서 `new Registry()` 인스턴스 직접 생성 금지 — IT-OBS-3
  의 도메인 격리 검사를 보강해서 `new Registry(` 등장 0건 단언 가능 (M-OBS-2
  에서 IT-OBS-3 추가).

---

## 4. IT-R1 보강 정책 — `webhook_relay_` 접두 예외

### 정책 (Q-OBS-14 (a), C-MET-2)

- IT-R1 의 도메인 식별자 grep 룰에서 **`webhook_relay_` 접두를 가진 토큰만
  예외 처리**한다.
- 예외 처리는 **단어 토큰 단위**로 수행:
  - 각 줄을 단어 단위로 토큰화 (`\b[A-Za-z_][A-Za-z0-9_]*\b`).
  - 토큰이 `webhook_relay_` 로 시작하면 검사에서 제외.
  - 나머지 토큰을 도메인 식별자 BANNED 세트와 비교 (case-insensitive).
- **PascalCase split:** `WebhookDelivery` 같은 식별자도 잡기 위해 토큰 추출 시
  PascalCase 를 단어 단위로 분리 — `Webhook`, `Delivery` 두 단어가 잡혀야 실패.

### 도입 시점

| 마일스톤 | 적용 |
|---------|------|
| M-OBS-1 | IT-R1 grep 룰 갱신 (`it-r1-domain-boundary.integration.test.ts`) |

### 검증

- §3의 의사 코드 단계에서 BANNED 토큰 검출 케이스 단언:
  - `webhook_relay_queue_depth` → 통과.
  - `processWebhook()` → 실패 (`Webhook` 단어 검출).
  - `httpStatus` → 실패 (`http` 단어 검출).
  - `httpsAgent` → 통과 (`http` 부분이 `https` 안에 있으나 단어 단위로 토큰
    `httpsAgent` 가 검색되고, 그 안에서 `https` 와 `Agent` 가 분리됨 — `http` 와
    정확히 일치하는 단어는 없음).
  - `// WebhookDelivery: TODO` → 실패 (PascalCase split 으로 `Webhook`, `Delivery`
    검출).

### 임의 결정 금지

- 새 식별자(예: `Notification`)가 도메인 식별자로 추가되어야 한다면 PRD
  `architecture.md` §2 의 도메인 식별자 정의를 갱신하는 별도 PR이 선행되어야
  함 (C-MET-2 의 범위 확장). 본 PLAN 에서는 BANNED 세트를 임의로 늘리지 않음.

---

## 5. 메트릭 갱신 hot path 영향 0건 정책

### 정책

- prom-client `inc()`/`observe()`/`set()` 은 **동기·비차단**.
- 메트릭 갱신이 핸들러의 동기 흐름을 변경해선 안 됨 — `await` 추가 금지.
- `getJobCounts()` 같은 라이브 Redis 조회는 **scrape 시점**(prom-client
  `collect()` hook) 에서만 호출.

### 도입 시점

| 마일스톤 | 적용 |
|---------|------|
| M-OBS-2 | C1~C11 wiring 시 `collect()` hook 만 비동기 가능. 핸들러 hot path 는 동기. |
| M-OBS-3 | D1~D3, W1~W4 wiring 시 Fastify hook (onRequest/onResponse) 또는 try/finally 에서 동기 호출. |

### 회귀 보호

- 1~2단계 IT-S3 (fake timer 기반 백오프 검증) 가 메트릭 도입 후에도 그린 →
  메트릭 갱신이 시간 흐름을 변경하지 않음을 증명.
- 1~2단계 IT-S2 (멱등성) 가 그린 → 메트릭 갱신이 jobId 비교/idempotency 흐름을
  변경하지 않음.

---

## 6. 로그 ↔ 메트릭 라벨 명명 정합

### 정책 (PRD `prd-phase3/00` §8 계승 원칙)

- 메트릭 라벨과 로그 컨텍스트가 **같은 식별자**를 쓰도록 권장:
  - 로그: `attempt`, `errorClass`, `httpStatus`, `queueName`, `jobId`,
    `idempotencyKey`.
  - 메트릭 라벨: `outcome` (with `error_class` 정보), `http_status_class`,
    `queue`, `job_state`, `reason`.
- **변환 규칙:** 카멜케이스(로그) ↔ 스네이크케이스(메트릭) 자동 변환.
  - `errorClass` ↔ `error_class`
  - `httpStatus` ↔ `http_status_class` (값 변환: raw → 클래스)
  - `queueName` ↔ `queue`

### 도입 시점

| 마일스톤 | 적용 |
|---------|------|
| M-OBS-3 | 라벨 enum 정의 시 `error_class`/`http_status_class` 사용 |
| M-OBS-6 | IT-OBS-12 정합 단언 |

### 의도적 차이

- 메트릭 라벨에는 **카디널리티 보호** 목적으로 `idempotencyKey`/`jobId` 가
  등장 안 함. 로그에는 등장 (필수 컨텍스트).
- 메트릭 라벨에는 `attempt` raw 가 없음 (W3 histogram bucket 으로 분해 —
  Q-OBS-6 (a)). 로그에는 raw `attempt` 등장.

---

## 7. Grafana provisioning 의 idempotency

### 정책

- Grafana provisioning 은 컨테이너 기동 시마다 datasource + dashboards 를 재로드.
- `editable: false` (datasource), `allowUiUpdates: false` (dashboards) 로 GUI
  변경이 영속화되지 않도록.
- 대시보드 JSON 의 `id: null` 으로 임포트 시 자동 ID 배정. `uid` 는 안정값으로
  잠금 (PRD `prd-phase3/03` §4.0).

### 도입 시점

| 마일스톤 | 적용 |
|---------|------|
| M-OBS-4 | provisioning YAML 2종 + 대시보드 JSON 4종 + UID 안정값 |

### 위반 시 검출

- IT-OBS-7 가 provisioning YAML 필드 단언.
- IT-OBS-8 가 UID 안정값 단언.
- Grafana 컨테이너 재기동 후 GUI 에서 datasource 추가/대시보드 저장이 거부됨을
  수동 확인 (선택).

---

## 8. 새 의존성 금지 정책 (CLAUDE.md §2)

### 본 PLAN 에서 추가 가능한 의존성

- **`prom-client`** (M-OBS-1) — CLAUDE.md §2 사전 잠금. 정당성 명시.
- 그 외 npm 의존성 추가 금지.

### 본 PLAN 에서 추가 가능한 Docker 의존성

- **`prom/prometheus`** (M-OBS-4) — `docker-compose.yml` 에 컨테이너 추가.
- **`grafana/grafana`** (M-OBS-4) — 동일.

### 본 PLAN 에서 추가 금지인 의존성 (회피)

- `pino`/`winston` 등 로깅 라이브러리 — 1~2단계 PLAN `09-cross-cutting.md` §1 의
  방침과 동일 (Fastify 내장 pino 활용).
- `grafonnet`/`jsonnet` — Q-OBS-7 (a) 결정에 따라 도입 금지.
- `@grafana/*`, `bull-board`, `pino-pretty`, `gzip` 미들웨어 (Q-OBS-10 (a)) —
  모두 도입 금지.

### 위반 시

- PR 리뷰에서 거부. CLAUDE.md §2 위반 신호.

---

## 9. 횡단 정책 간 우선순위

본 문서의 정책이 서로 충돌할 때:

1. **카디널리티 통제** (§1) > 다른 모든 항목 — 라벨 폭주는 운영 차단.
2. **`core` 도메인 격리** (§4) > 메트릭 노출 — `core` 에 도메인 식별자 누수는
   IT-R1 으로 즉시 차단.
3. **hot path 무영향** (§5) > 메트릭 풍부함 — 메트릭이 1~2단계 보장(I*)을
   침범해선 안 됨.
4. **Registry 단일성** (§3) > 테스트 격리 — 테스트 격리는 `register.clear()`
   로 해결, 운영 코드는 단일 registry 유지.

---

## 10. 외부 PR 위임 정책 (C-MET 17건)

- 본 PLAN 안에서 직접 적용되는 C-MET 4건: **C-MET-2, C-MET-7 (일부), C-MET-8,
  C-MET-12**.
- 나머지 13건은 **별도 PR 위임** — 사용자가 PRD/architecture/CLAUDE.md/README
  본문 갱신을 결정한 뒤 PR 진행.
- 본 PLAN 의 어떤 마일스톤도 위 별도 PR 들의 완료를 **전제로 하지 않는다**.
  따라서 본 PLAN 은 별도 PR 의 일정과 독립적으로 실행 가능.

> 상세 매핑은 `09-acceptance-gates.md` §6 표 단일 출처.
