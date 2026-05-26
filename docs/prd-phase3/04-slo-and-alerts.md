# 04. SLO & Alerts — SLO 정의 · 측정 윈도우 · Error Budget · Alerting Rule YAML

> 담당 페르소나: **SLO Specialist** + **SRE/Observability Lead**
> 본 문서는 본 시스템이 약속하는 SLO와 그것이 깨질 때 발화될 알람 규칙의 PRD 수준
> 요구사항을 잠근다.
> 구현 코드(YAML 파일)는 본 PRD가 승인된 뒤 **후속 PLAN 단계**에서 작성한다.

---

## 1. 컨텍스트 / 배경

SLO 없는 메트릭은 "보기 좋은 그래프"에 불과하다. 본 PRD는 1~2단계의 불변식
(I1.1~I6.4)을 **운영 중 측정 가능한 약속**으로 번역한다.

SLO는 "100% 보장"이 아니라 **에러 예산(error budget)** 모델로 운영한다.

- 약속: 가용성 99.5% (28일 기준)
- 에러 예산: 28일 × 0.5% = **약 3.36시간** 다운/실패 허용
- 예산을 다 쓰면: 신기능 배포 중단, 안정화 우선(운영 정책 — 본 PRD 범위 밖)

본 PRD는 **SLO 정의 + 알람 규칙(YAML 명세)** 까지 다룬다. 알람 라우팅/온콜/
인시던트 프로세스는 명시적 비목표(`00` §3 N3.2, `05` §1).

> **4단계와의 경계:** 본 PRD가 정의하는 SLO 임계값은 **잠정값**이다. 운영 부하
> 측정 후 4단계 PRD에서 **실측 기반 갱신** 가능. 본 PRD는 "측정 가능한 형태로
> 정의"까지만 책임진다.

---

## 2. 목표 (Goals)

- **G4.1** SLO 4종(가용성 / 등록 지연 / 전달 지연 / DLQ 적재율)을 잠근다.
- **G4.2** 각 SLO의 SLI(측정 지표) — PromQL 표현식을 잠근다.
- **G4.3** 측정 윈도우(28d / 7d / 1h)를 잠근다.
- **G4.4** Error budget 계산 공식을 잠근다.
- **G4.5** SLO 위반/위험 시 발화될 Prometheus alerting rule YAML의 잠정 형태를
  명세한다. 라우팅·온콜은 본 PRD 범위 밖.

---

## 3. SLO 정의

### 3.1 SLO 카탈로그 (잠정값 — `05` Q-OBS-11)

| SLO ID | 한 줄 | SLI (PromQL) | 목표 | 측정 윈도우 |
|--------|-------|--------------|------|--------------|
| **SLO-1 (가용성)** | API `POST /webhooks`가 5xx로 실패하지 않는다 | `sum(rate(webhook_relay_api_requests_total{route="/webhooks",status_class="5xx"}[5m])) / sum(rate(webhook_relay_api_requests_total{route="/webhooks"}[5m]))` | **5xx 비율 ≤ 0.5%** = 가용성 ≥ 99.5% | 28일 (장기), 1시간 (단기 알람) |
| **SLO-2 (등록 지연)** | `POST /webhooks`의 응답 지연 p99가 500ms 이내 | `histogram_quantile(0.99, sum by (le) (rate(webhook_relay_api_request_duration_seconds_bucket{route="/webhooks"}[5m])))` | **p99 ≤ 0.5s** | 7일 |
| **SLO-3 (전달 지연)** | 작업 등록 → 외부 송신 성공까지의 wall-clock p99가 5초 이내 (재시도 미포함, 첫 시도 기준) | `histogram_quantile(0.99, sum by (le) (rate(webhook_relay_worker_processing_duration_seconds_bucket{outcome="success"}[5m])))` | **p99 ≤ 5s** | 7일 |
| **SLO-4 (DLQ 적재율)** | 종단 처리 작업 중 DLQ 적재 비율이 낮다 | `sum(rate(webhook_relay_dlq_jobs_total[1h])) / sum(rate(webhook_relay_jobs_processed_total[1h]))` | **DLQ 적재율 ≤ 1%** | 1일 (단기), 28일 (장기) |

### 3.2 SLI ↔ 불변식 매핑

| SLI | 검증되는 불변식 (1~2단계) |
|-----|---------------------------|
| SLO-1 가용성 | I1.1 (등록된 작업은 큐에 존재), I2.1 (at-least-once 도달) |
| SLO-2 등록 지연 | (직접 매핑 없음 — 새 약속) |
| SLO-3 전달 지연 | I6.2 (타임아웃 강제), I2.3 (분류 결정성으로 무한 재시도 방지) |
| SLO-4 DLQ 적재율 | I2.4 (DLQ 단방향, 운영 신호) |

### 3.3 측정 윈도우 선택 근거

- **28일**: 표준 가용성 측정 윈도우(Google SRE Book 관행). 본 PRD는 28d를 기본
  장기 윈도우로 채택.
- **7일**: 지연 SLO의 측정 윈도우. 지연은 가용성보다 빠르게 회복하므로 짧은
  윈도우가 적합.
- **1일**: DLQ 단기 윈도우 — poison message 패턴의 빠른 감지.
- **5분**: 알람 발화의 burn rate 측정 윈도우(§5).

### 3.4 SLO 잠정성 명시

위 목표값은 **잠정값**이다. 운영 부하 측정(4단계 PRD) 이전에는:

- 본 PRD가 정의한 **형태**(SLI PromQL, 윈도우 정의, error budget 공식)는 잠금.
- 본 PRD가 정의한 **목표 숫자**는 4단계에서 재조정 가능 (Q-OBS-11).
- 알람 임계 burn rate는 본 PRD에서 잠금(§5.3) — 표준 패턴이므로.

---

## 4. Error Budget

### 4.1 계산 공식

`Error Budget = (1 - SLO 목표) × 측정 윈도우`

| SLO | 목표 | 28일 기준 Error Budget |
|-----|------|------------------------|
| SLO-1 가용성 99.5% | 5xx 비율 ≤ 0.5% | 28d × 0.5% = **약 3.36시간** 5xx 허용 |
| SLO-2 등록 지연 (7d) | p99 ≤ 0.5s | 7d × 1% = **약 1.68시간** p99 초과 허용 |
| SLO-3 전달 지연 (7d) | p99 ≤ 5s | 7d × 1% = **약 1.68시간** p99 초과 허용 |
| SLO-4 DLQ 적재율 (1d) | ≤ 1% | 1d × 1% × 처리 작업 수 = 작업 수의 1%까지 DLQ 허용 |

> 본 PRD는 "p99 SLO 위반 시간"의 정확한 정의(미세 시간 적분)를 잠그지 않는다.
> Prometheus의 표준 `rate()` 기반 비율 계산을 채택(Google SRE Book 4장).

### 4.2 Error Budget 정책 (운영 규칙 — 본 PRD 범위 밖)

다음은 본 PRD 범위 밖이지만 참고용 기록.

- 예산을 50% 소진: 안정화 우선 권장 (신기능 개발 지속 가능)
- 예산을 100% 소진: 신기능 배포 중단, 안정화 작업만 (운영 정책 PRD)
- 예산 회복: 다음 윈도우(예: 28일) 종료 시 자동

본 PRD는 **예산을 추적할 메트릭/알람**까지만 다룬다.

### 4.3 Multi-window Multi-burn-rate

Google SRE Workbook의 표준 패턴(2 윈도우 × 2 burn rate). 잠정 적용:

| Tier | 짧은 윈도우 | 긴 윈도우 | Burn rate | 의미 |
|------|--------------|------------|-----------|------|
| **Page (즉시)** | 5m | 1h | 14.4× | 1시간 안에 28일 예산의 2% 소진 — 즉시 페이지 |
| **Ticket (지연)** | 30m | 6h | 6× | 6시간 안에 28일 예산의 5% 소진 — 티켓 작성 |

본 PRD는 burn rate 14.4× / 6×의 **표준값**을 채택한다(Q-OBS-12 결정 보류).

---

## 5. Alerting Rule YAML

### 5.1 파일 위치

`docker/prometheus/rules/` 아래 분류별로 둔다:

```
docker/prometheus/rules/
├── webhook-relay-availability.yaml   # SLO-1
├── webhook-relay-latency.yaml        # SLO-2 + SLO-3
├── webhook-relay-dlq.yaml            # SLO-4
└── webhook-relay-platform.yaml       # 플랫폼 헬스 (Redis 끊김 등 — SLO 외)
```

### 5.2 잠정 YAML 형태 (예시 — 정확한 YAML은 PLAN)

다음은 **형식 예시**이며 PLAN 단계에서 정식 작성한다. burn rate 계산식은
Google SRE Workbook 표준을 따른다.

#### 5.2.1 가용성 — `webhook-relay-availability.yaml`

```yaml
groups:
  - name: webhook-relay-availability
    interval: 30s
    rules:
      # SLO-1: POST /webhooks 5xx 비율 ≤ 0.5%
      # Page alert: 5m + 1h, burn rate 14.4×
      - alert: WebhookRelayAvailabilityBurnRateFast
        expr: |
          (
            sum(rate(webhook_relay_api_requests_total{route="/webhooks",status_class="5xx"}[5m]))
            /
            sum(rate(webhook_relay_api_requests_total{route="/webhooks"}[5m]))
          ) > (14.4 * 0.005)
          and
          (
            sum(rate(webhook_relay_api_requests_total{route="/webhooks",status_class="5xx"}[1h]))
            /
            sum(rate(webhook_relay_api_requests_total{route="/webhooks"}[1h]))
          ) > (14.4 * 0.005)
        for: 2m
        labels:
          severity: page
          slo: SLO-1-availability
        annotations:
          summary: "POST /webhooks 5xx rate burning 28d error budget too fast"
          description: |
            POST /webhooks 5xx 비율이 burn rate 14.4× 를 5m+1h 윈도우에서 초과 중.
            28일 error budget 의 2%가 1시간 안에 소진되는 속도.
          runbook_url: ""  # 본 PRD 범위 밖 — 운영 PRD에서 작성
      # Ticket alert: 30m + 6h, burn rate 6×
      - alert: WebhookRelayAvailabilityBurnRateSlow
        expr: |
          (
            sum(rate(webhook_relay_api_requests_total{route="/webhooks",status_class="5xx"}[30m]))
            /
            sum(rate(webhook_relay_api_requests_total{route="/webhooks"}[30m]))
          ) > (6 * 0.005)
          and
          (
            sum(rate(webhook_relay_api_requests_total{route="/webhooks",status_class="5xx"}[6h]))
            /
            sum(rate(webhook_relay_api_requests_total{route="/webhooks"}[6h]))
          ) > (6 * 0.005)
        for: 15m
        labels:
          severity: ticket
          slo: SLO-1-availability
        annotations:
          summary: "POST /webhooks 5xx rate sustained burn"
```

#### 5.2.2 지연 — `webhook-relay-latency.yaml`

```yaml
groups:
  - name: webhook-relay-latency
    interval: 30s
    rules:
      - alert: WebhookRelayRegisterLatencyP99High
        expr: |
          histogram_quantile(
            0.99,
            sum by (le) (rate(webhook_relay_api_request_duration_seconds_bucket{route="/webhooks"}[5m]))
          ) > 0.5
        for: 10m
        labels:
          severity: ticket
          slo: SLO-2-register-latency
        annotations:
          summary: "POST /webhooks p99 latency > 500ms for 10m"
      - alert: WebhookRelayDeliveryLatencyP99High
        expr: |
          histogram_quantile(
            0.99,
            sum by (le) (rate(webhook_relay_worker_processing_duration_seconds_bucket{outcome="success"}[5m]))
          ) > 5
        for: 10m
        labels:
          severity: ticket
          slo: SLO-3-delivery-latency
        annotations:
          summary: "Worker success processing p99 latency > 5s for 10m"
```

#### 5.2.3 DLQ — `webhook-relay-dlq.yaml`

```yaml
groups:
  - name: webhook-relay-dlq
    interval: 30s
    rules:
      - alert: WebhookRelayDlqRateHigh
        expr: |
          (
            sum(rate(webhook_relay_dlq_jobs_total[1h]))
            /
            clamp_min(sum(rate(webhook_relay_jobs_processed_total[1h])), 1)
          ) > 0.01
        for: 30m
        labels:
          severity: ticket
          slo: SLO-4-dlq-rate
        annotations:
          summary: "DLQ ratio > 1% over 1h (sustained 30m)"
      - alert: WebhookRelayDlqStalledLoss
        expr: |
          increase(webhook_relay_dlq_jobs_total{reason="stalled_loss_recovered"}[15m]) > 0
        for: 0m
        labels:
          severity: page
        annotations:
          summary: "stalled-loss recovery fired — worker crashed mid-job"
          description: |
            BullMQ 'failed(job===undefined)' 케이스가 발생해 best-effort
            recovery 가 DLQ 에 적재됨. 워커 강제 종료/메타데이터 손실 신호.
```

#### 5.2.4 플랫폼 — `webhook-relay-platform.yaml`

```yaml
groups:
  - name: webhook-relay-platform
    interval: 30s
    rules:
      - alert: WebhookRelayRedisDown
        expr: webhook_relay_redis_up == 0
        for: 1m
        labels:
          severity: page
        annotations:
          summary: "Redis disconnected (worker view)"
      - alert: WebhookRelayRedisReconnectStorm
        expr: increase(webhook_relay_redis_reconnects_total[5m]) > 10
        for: 0m
        labels:
          severity: ticket
        annotations:
          summary: "Redis reconnect storm (>10 reconnects in 5m)"
      - alert: WebhookRelayInstanceDown
        expr: up{job=~"webhook-relay-.*"} == 0
        for: 2m
        labels:
          severity: page
        annotations:
          summary: "Instance scrape failing for >2m"
      - alert: WebhookRelayShutdownTimedOut
        expr: increase(webhook_relay_shutdown_remaining_jobs[10m]) > 0
        for: 0m
        labels:
          severity: ticket
        annotations:
          summary: "Graceful shutdown timed out (remaining active jobs at exit)"
```

### 5.3 잠금된 항목 vs 결정 보류

본 PRD가 **잠금**:

- SLO 4종의 SLI (PromQL 표현식 형태)
- 측정 윈도우(28d/7d/1d/1h/5m)
- Error budget 계산 공식
- burn rate 14.4×/6× 표준 패턴
- alerting rule 파일 위치 + YAML 구조

본 PRD가 **결정 보류** (Q-OBS-11/12, `05` §2):

- SLO 목표 숫자(99.5% / 0.5s / 5s / 1%) — 운영 측정 후 4단계에서 갱신 가능
- burn rate를 14.4×/6×에서 다르게 잠글 것인가
- ticket/page severity 라벨의 운영 의미

### 5.4 알람 라우팅 명시적 비목표

- Alertmanager 설정(`alertmanager.yml`)
- PagerDuty / Slack / Email 라우팅
- 온콜 로테이션, 인시던트 런북

이들은 본 PRD 범위 밖(`00` §3 N3.2). 본 PRD는 **알람이 발화되는 조건**까지만
정의하고, "어디로 보낼지"는 별도 운영 PRD에서 다룬다.

---

## 6. SLO ↔ 1~2단계 IT 시나리오 매트릭스

1~2단계 IT 시나리오가 정상 동작할 때 SLO가 어떻게 측정되는지.

| IT | SLO 영향 |
|----|----------|
| IT-S1 (해피패스) | SLO-1: 2xx 응답 → 가용성 유지. SLO-2: API 지연 측정. SLO-3: 워커 처리 지연 측정. SLO-4: DLQ 미증가. |
| IT-S2 (멱등성) | SLO-1: N회 모두 2xx → 가용성 유지. |
| IT-S3 (재시도) | SLO-3: 워커 처리 지연이 백오프로 증가. 단, `outcome="success"` 만 측정하므로 마지막 시도 시간만 측정. 본 PRD는 "재시도 전체 wall-clock"을 별도 SLO로 두지 않음. |
| IT-S4 (max attempts → DLQ) | SLO-4: DLQ 적재율 증가 → 알람 발화 가능. |
| IT-S5 (4xx 즉시 DLQ) | SLO-4: DLQ 적재율 증가. 단, `reason="non_retriable"`은 클라이언트 책임이므로 SLO 차감을 다르게 볼 수도 있음(Q-OBS-13). |
| IT-S6 (stalled 회수) | SLO-3: 회수까지의 stalledInterval 만큼 추가 지연 → p99 영향 가능. |
| IT-S6b (stalled-loss recovery) | `WebhookRelayDlqStalledLoss` page 알람 즉시 발화 (예상 동작 — 워커 강제 종료). |
| IT-S7 (그레이스풀 셧다운) | `WebhookRelayShutdownTimedOut` 알람 — 정상 완료 시 미발화. 타임아웃 시 발화. |

---

## 7. 비기능 요구사항

| 분류 | 요구 |
|------|------|
| **신뢰성** | Prometheus rule evaluation interval 30s 권장. 알람 발화까지 wall-clock 지연 ≤ 1분(rule evaluation + scrape interval 합). |
| **결정성** | PromQL은 `01-metrics-and-labels.md`의 라벨 enum에 닫혀 있다. |
| **유지보수성** | Rule YAML은 SLO별 파일로 분리. 코드로 버전 관리. |
| **호환성** | Prometheus rule 표준 형식. `apiVersion`은 없음(rule 파일은 Kubernetes CRD가 아니라 Prometheus 형식). |

---

## 8. 수용 기준 (AC)

- **AC6.1** `docker/prometheus/rules/` 아래에 §5.1 파일 4개가 존재한다.
- **AC6.2** Prometheus 컨테이너 기동 시 rule 파일이 로드되고(`rule_files:`
  설정), `promtool check rules` 가 통과한다.
- **AC6.3** SLO-4 DLQ 적재율 알람이 IT-S4 실행 후 1시간 윈도우에서 발화 조건을
  만족한다(테스트는 본 PRD 범위 밖 — PLAN/Q-OBS-N에서 결정).
- **AC6.4** SLO 정의의 PromQL이 `01-metrics-and-labels.md` §3의 메트릭 이름·
  라벨과 정확히 일치한다.
- **AC6.5** 알람 라벨에 `severity` + `slo`가 있다(라우팅·온콜 PRD가 사용할 수
  있는 구조).

---

## 9. 불변식 (Invariants)

- **I6.1 (SLO 형태 안정성)** SLO의 SLI PromQL 형태(메트릭 이름·라벨·집계 함수)는
  변경되지 않는다. 목표 숫자만 갱신 가능.
- **I6.2 (Burn rate 패턴 보존)** Multi-window multi-burn-rate 패턴(14.4×/6×)을
  본 PRD가 잠근다. 변경은 별도 결정.
- **I6.3 (알람 = 메트릭의 그림자)** 알람 규칙은 새 메트릭을 만들지 않는다. 기존
  메트릭의 비율/quantile만 평가한다(`01` §4 카디널리티 예산 보존).
- **I6.4 (라우팅 분리)** 본 PRD의 알람은 라우팅을 명시하지 않는다(severity 라벨
  까지만). 라우팅은 별도 PRD.

---

## 10. 리스크 / 오픈 퀘스천

- **R7.1** **Q-OBS-11** — SLO 목표 숫자 확정 시점 (본 PRD 잠정값 vs 4단계 실측
  기반 갱신) → `05` §2 위임.
- **R7.2** **Q-OBS-12** — burn rate 표준값 (14.4×/6×) 채택 → `05` §2 위임.
- **R7.3** **Q-OBS-13** — 4xx 응답(클라이언트 오작동)을 SLO-1 가용성에서 차감
  할 것인가. 일반적으로 차감 안 함(가용성 SLO는 5xx만) → 본 PRD 채택. 단,
  SLO-4 DLQ 적재율에는 `reason="non_retriable"`가 포함되어 있음 — 의도된 동작
  (poison message 비율 = 운영 신호). 사람 결정 필요 시 `05`.
- **R7.4** Alertmanager 라우팅·온콜은 본 PRD 범위 밖. README 운영 노트에 명시
  필요.

---

## 11. PRD 변경 제안

전체는 [`05-out-of-scope-and-open-questions.md`](./05-out-of-scope-and-open-questions.md)
§3 통합 표 참조. 본 문서 발견 항목:

- **C-MET-13:** `docs/architecture.md` §5에 "보장한다" 절에 SLO-1~4 추가 제안
  (본 PRD 승인 후, 운영 측정 기반 갱신은 4단계에서).
- **C-MET-14:** `docs/prd/06-security-and-ops.md`의 운영 노트 절에 "알람
  라우팅·온콜은 본 PRD 범위 밖이며 별도 운영 PRD" 추가 제안.
- **C-MET-15:** `README.md` 운영 노트에 "SLO 임계는 잠정값이며 4단계 실측 후
  재조정" 추가 제안.
