# 03. Targets & Rebaseline — 측정 대상 SLI · 측정 프로토콜 · SLO 재조정 규칙

> 담당 페르소나: **Performance Engineer** · SLO Specialist 보조
> 본 문서는 4단계 PRD 의 **측정 대상 SLI 카탈로그 + 측정 프로토콜 + SLO 잠정값의
> 실측 기반 재조정 규칙** 의 단일 출처를 잠근다. 3단계 SLO (`prd-phase3/04` §3.1) 의
> 잠정성을 본 PRD 가 실측으로 닫는 책임 절이다.
> 구현 코드(측정 자동화 + SLO 재조정 PR) 는 본 PRD 가 승인된 뒤 **후속 PLAN 단계**
> 에서 작성한다.

---

## 1. 컨텍스트 / 배경

3단계 PRD `prd-phase3/04` §3.4 + Q-OBS-11 결정이 명시하듯, 본 시스템의 SLO 임계값은
**잠정값(99.5% / p99 0.5s / p99 5s / 1%)** 이다. 운영 부하 측정 없이 채택된 숫자이며,
"SLI PromQL 형태 + 측정 윈도우는 잠금이되, 목표 숫자만 갱신 가능" 으로 잠금되어 있다
(I6.1 정합).

본 PRD `03` 은 그 잠정성을 닫는다.

- 3단계가 정의한 메트릭 카탈로그(C1~C11 / D1~D3 / W1~W4) 중 본 PRD 가 실측 측정의
  대상으로 삼는 SLI 를 명시한다(§2). **새 메트릭은 도입하지 않는다** (`00-overview`
  §2 G4.3 정합).
- 측정의 정확한 절차(부트스트랩 → 워밍업 → 부하 인가 → Prometheus query → 통계
  추출) 를 잠근다(§3). 측정의 재현성 보호.
- 실측 분포에서 SLO 임계 숫자를 산출하는 **재조정 규칙** 을 옵션 정리 + 결정 위임
  으로 잠근다(§4 / Q-LOAD-9).
- 재조정 결과가 `prd-phase3/04` §3.1 의 임계 숫자만 갱신하고 SLI PromQL 형태 /
  측정 윈도우는 변경하지 않음을 본 §5 가 잠근다(I6.1 보존).

> 본 문서가 잠그는 것은 **측정 절차와 재조정 규칙의 형태** 이지, 측정 후의 실제
> 임계 숫자가 아니다. 후자는 후속 PLAN 단계의 측정 결과로 자동 산출된다.

---

## 2. 측정 대상 SLI

본 §2 는 본 PRD 가 실측하는 SLI 의 카탈로그다. **3단계 메트릭 카탈로그
(`prd-phase3/01` §3) 의 부분 집합** 이며, 새 메트릭 / 라벨 / SLI 추가는 0 건이다
(`00-overview` §3 N4.6 정합).

### 2.1 본 PRD 가 실측하는 메트릭

| ID | 메트릭 이름 | Type | 3단계 출처 | 본 PRD 의 측정 대상 |
|----|-------------|------|-------------|----------------------|
| C1 | `webhook_relay_queue_depth` | Gauge | `prd-phase3/01` §3.1 | 큐 길이 시계열 (steady / spike 패턴 별) |
| C2 | `webhook_relay_jobs_processed_total` | Counter | `prd-phase3/01` §3.1 | 처리량 (rate). LP-N 별 |
| C3 | `webhook_relay_job_attempts_total` | Counter | `prd-phase3/01` §3.1 | 시도 분포. retriable vs non-retriable |
| C4 | `webhook_relay_worker_processing_duration_seconds` | Histogram | `prd-phase3/01` §3.1 | p50 / p99 처리 지연 (outcome 별) |
| C5 | `webhook_relay_dlq_jobs_total` | Counter | `prd-phase3/01` §3.1 | DLQ 적재율 (SLO-4 기초) |
| C6 | `webhook_relay_worker_active_jobs` | Gauge | `prd-phase3/01` §3.1 | 워커 점유율 (포화 식별) |
| C9 | `webhook_relay_shutdown_state` | Gauge | `prd-phase3/01` §3.1 | (정적 부하만 — 측정 대상 외) |
| D1 | `webhook_relay_api_requests_total` | Counter | `prd-phase3/01` §3.2 | 5xx 비율 (SLO-1 기초) |
| D2 | `webhook_relay_api_request_duration_seconds` | Histogram | `prd-phase3/01` §3.2 | p50 / p99 등록 지연 (SLO-2 기초) |
| D3 | `webhook_relay_api_request_body_bytes` | Histogram | `prd-phase3/01` §3.2 | 페이로드 분포 검증 (LP-N 의 P 차원 검증) |
| W1 | `webhook_relay_deliveries_total` | Counter | `prd-phase3/01` §3.3 | 결과 분포 (success / http_error / network_error / timeout) |
| W2 | `webhook_relay_delivery_duration_seconds` | Histogram | `prd-phase3/01` §3.3 | p50 / p99 외부 송신 지연 |
| W3 | `webhook_relay_delivery_attempts_per_job` | Histogram | `prd-phase3/01` §3.3 | 종단 시도 분포 (LP-N 변형 별) |
| W4 | `webhook_relay_receiver_received_total` | Counter | `prd-phase3/01` §3.3 | 수신자 도착 확인 (전달 보장 검증) |

**합계:** C1 / C2 / C3 / C4 / C5 / C6 / D1 / D2 / D3 / W1 / W2 / W3 / W4 = **13개
메트릭**. 3단계 카탈로그 전체(C1~C11 + D1~D3 + W1~W4 = 18개) 중 정적 부하 측정과
무관한 항목(C7 `redis_reconnects_total` / C8 `redis_up` / C9 `shutdown_state` /
C10 `shutdown_remaining_jobs` / C11 `build_info`) 은 측정 대상 외.

### 2.2 SLO 4종과 측정 대상 SLI 의 매핑

| SLO ID | SLI (PromQL) — 3단계 잠금 | 본 PRD 가 측정하는 메트릭 |
|--------|----------------------------|---------------------------|
| SLO-1 가용성 | `sum(rate(webhook_relay_api_requests_total{route="/webhooks",status_class="5xx"}[5m])) / sum(rate(webhook_relay_api_requests_total{route="/webhooks"}[5m]))` | D1 |
| SLO-2 등록 지연 | `histogram_quantile(0.99, sum by (le) (rate(webhook_relay_api_request_duration_seconds_bucket{route="/webhooks"}[5m])))` | D2 |
| SLO-3 전달 지연 | `histogram_quantile(0.99, sum by (le) (rate(webhook_relay_worker_processing_duration_seconds_bucket{outcome="success"}[5m])))` | C4 |
| SLO-4 DLQ 적재율 | `sum(rate(webhook_relay_dlq_jobs_total[1h])) / sum(rate(webhook_relay_jobs_processed_total[1h]))` | C2 / C5 |

본 PRD 의 측정은 위 SLI PromQL 을 **그대로 사용** 한다. PromQL 의 메트릭 이름 /
라벨 / 집계 함수 / 측정 윈도우(`[5m]` / `[1h]`) 는 I6.1 정합으로 변경 금지.

### 2.3 카디널리티 가드 (IT-OBS-11 정합)

본 PRD 의 부하 측정 중 메트릭당 라벨 조합이 1000 을 초과하면 3단계 IT-OBS-11 의
카디널리티 가드가 즉시 발동한다(`prd-phase3/01` §4.4 표). 본 PRD 의 LP-N 은 카디널
폭주를 유발하는 새 라벨을 도입하지 않으므로(라벨 enum 폐쇄성 I3.2 정합), 카디널리티는
LP-N 측정 전후 동일해야 한다.

- **검증 방법:** 측정 시작 / 종료 시점에 Prometheus `count({__name__=~"webhook_relay_.*"})`
  쿼리로 시계열 수 비교. 시계열 수 증가가 본 PRD `01` §3.1 표의 상한 합 (또는 그
  근방) 안에 머무는지 확인.
- **위반 시:** 측정 결과 무효. 라벨 누출(예: `idempotencyKey` 가 잘못 라벨로 들어
  옴) 의심 → PLAN 단계 검토.

---

## 3. 측정 프로토콜

본 §3 은 측정의 정확한 절차 단일 출처다. 후속 PLAN 단계의 측정 자동화 스크립트는
본 §3 의 단계를 그대로 옮긴다.

### 3.1 절차 (8 단계)

```
[1] 부트스트랩
    └ docker compose up -d (k6 제외 5 서비스)
    └ /healthz 200 확인 (api), /metrics 200 확인 (api + worker)
    └ Prometheus scrape 정상 동작 확인 (target up = 1)
    └ Grafana provisioning 완료 확인 (선택)

[2] 측정 호스트 메타데이터 수집 (`02` §5.1)
    └ CPU 모델 / 주파수 / RAM / OS / Docker / k6 / git commit / 측정 일시
    └ cgroup 한정값 (docker-compose 의 deploy.resources.limits 그대로 dump)

[3] 워밍업 (W_warmup, `01` §2.4 / §5)
    └ k6 가 LP-N 의 W_warmup 구간 실행
    └ JIT / V8 inline cache / Redis connection pool 안정화
    └ 이 구간의 메트릭은 결과에서 제외 (§3.3)

[4] 부하 인가 (W_load)
    └ k6 가 LP-N 의 W_load 구간 실행 (R RPS / P 분포 / T 패턴)
    └ Prometheus 가 5s 간격으로 scrape
    └ t_start = W_warmup 종료 시점 / t_end = W_load 종료 시점 (메타데이터 기록)

[5] 쿨다운 (W_cooldown)
    └ k6 가 부하 인가 종료. 큐 길이 회복 / DLQ 적재 마무리 대기
    └ 이 구간의 메트릭은 SLI 계산에서 제외 (큐 회복 시간은 별도 측정 가능, `04` §3)

[6] Prometheus query — 결과 추출
    └ §2.2 SLI PromQL 을 [t_start, t_end] range 로 query
    └ §3.2 가 query 형태 잠금

[7] 통계 추출 + 결과 보고서 작성
    └ p50 / p99 / 평균 / 분산 (§3.3)
    └ `02` §6 결정 형식 (Q-LOAD-12) 으로 결과 보고서 commit
    └ 측정 메타데이터 + 결과 한 묶음 단위

[8] 정리 / 다음 측정 준비
    └ docker compose down -v (Redis 데이터 삭제 — 누적 큐 영향 방지)
    └ 다음 LP-ID / N 측정을 위해 [1] 부터 재시작
```

### 3.2 Prometheus query 형태 (잠금)

본 §3.2 는 [6] 단계의 query 형태 단일 출처. PLAN 단계가 본 형태를 그대로 query 자동화에
사용한다.

| SLI | range query 형태 |
|-----|-------------------|
| SLO-1 가용성 (5xx 비율) | `query_range` API + §2.2 PromQL + range = [t_start, t_end] + step = 15s |
| SLO-2 등록 지연 p99 | `query_range` API + §2.2 PromQL + range = [t_start, t_end] + step = 15s |
| SLO-3 전달 지연 p99 | `query_range` API + §2.2 PromQL + range = [t_start, t_end] + step = 15s |
| SLO-4 DLQ 적재율 | `query` API (instant query) + §2.2 PromQL + t = t_end (1h rate 윈도우 안에서 측정 윈도우 끝) |
| 처리량 (RPS achieved) | `query_range` API + `sum(rate(webhook_relay_jobs_processed_total[5m]))` + step = 15s |
| 큐 길이 시계열 | `query_range` API + `sum by (job_state) (webhook_relay_queue_depth)` + step = 15s |
| W3 attempts 분포 | `query` API + `histogram_quantile(...)` + t = t_end |

### 3.3 통계 추출 — p50 / p99 / 평균 / 분산

본 §3.3 은 [7] 단계의 통계 형식 잠금.

- **p50** — `histogram_quantile(0.50, ...)` 의 range query 결과 시계열의 평균값
  (W_load 구간 전체).
- **p99** — `histogram_quantile(0.99, ...)` 의 range query 결과 시계열의 평균값
  (W_load 구간 전체).
- **평균 (mean)** — `histogram_quantile` 외에 `rate(*_sum) / rate(*_count)` 로 직접
  산출 (운영 평균 확인용, SLO 와 무관).
- **분산 (stdev)** — `query_range` 결과 시계열의 표준편차. SLO 재조정 규칙(§4)
  옵션 (b) 의 입력이 될 수 있음.

위 4 통계가 결과 보고서의 각 SLI 행에 모두 기록된다.

### 3.4 측정 결과 무효 조건

다음 중 하나라도 충족되면 측정 결과를 **무효** 로 처리한다.

- `02` §5.1 메타데이터 누락 (§5.3).
- `02` §7.2 측정 분산 ±5% 초과 (재현 측정 실패).
- §2.3 카디널리티 가드 위반.
- Prometheus target up = 0 구간이 W_load 안에 존재 (scrape 실패 = 데이터 손실).
- k6 의 RPS 도달률이 목표 R 의 ±2% 를 벗어남 (부하 인가 자체 실패).

---

## 4. SLO 재조정 규칙 — Q-LOAD-9 결정 위임

본 §4 는 실측 분포에서 SLO 임계 숫자를 산출하는 규칙의 옵션 정리 + 결정 위임이다.

### 4.1 옵션

| 옵션 | 공식 | margin 의미 |
|------|------|--------------|
| (a) p99 × 1.5 | `SLO 임계 = 실측 p99 × 1.5` | 50% 여유. 운영 변동 흡수 |
| (b) p99 + 3σ | `SLO 임계 = 실측 p99 + 3 × stdev` | 측정 분산 기반. 분산이 크면 임계 느슨, 작으면 엄격 |
| (c) p99 × 1.2 (엄격) | `SLO 임계 = 실측 p99 × 1.2` | 20% 여유. 매우 엄격, 알람 false positive 증가 위험 |
| (d) p99 × 2.0 (느슨) | `SLO 임계 = 실측 p99 × 2.0` | 100% 여유. 매우 느슨, 실제 회귀 감지 약화 |

### 4.2 트레이드오프

- **(a) p99 × 1.5** — Google SRE Workbook 의 일반 권고 영역. 운영 변동(트래픽 패턴
  변화 / GC pause / 일시적 부하 spike) 을 흡수하면서 회귀를 감지. 본 PRD 가 가장
  합리적이라 판단하는 잠정 기본값.
- **(b) p99 + 3σ** — 측정 분산을 직접 사용. 본 PRD 측정의 분산이 작으면 (b) 가
  (a) 보다 엄격, 분산이 크면 (b) 가 (a) 보다 느슨. 측정 분산 자체가 SLO 임계에
  영향을 주는 구조 — 측정 환경 변경 시 SLO 도 변경되는 비안정성 가능.
- **(c) p99 × 1.2 (엄격)** — 본 시스템이 운영 안정성을 매우 보수적으로 약속할 때.
  알람 false positive 증가 → 운영자 피로 증가. 단독 개발 + 데모 환경의 본 PRD 에는
  과잉.
- **(d) p99 × 2.0 (느슨)** — 본 시스템이 데모 / MVP 수준에서 회귀 감지를 약하게만
  잠금할 때. 실제 회귀가 발생해도 SLO 위반으로 잡히지 않을 위험.

### 4.3 잠정 권고

**(a) p99 × 1.5.** Google SRE Workbook 영역 + 단독 개발 + 데모 환경의 운영 변동 흡수
영역 + 회귀 감지 능력의 균형점. (b) 의 측정 분산 의존성보다 (a) 의 고정 margin 이
재측정 안정성 우수.

**결정자:** 사람. PLAN 진입 전 잠금.

### 4.4 SLO 별 적용 (Q-LOAD-9 결정 후)

Q-LOAD-9 가 (a) 로 잠금된다고 가정한 경우의 적용 예시:

| SLO | 3단계 잠정값 | 실측 p99 (예시) | 재조정 임계 = p99 × 1.5 |
|-----|---------------|-------------------|----------------------------|
| SLO-1 가용성 | 5xx ≤ 0.5% | 실측 5xx 비율 의 p99 분포 | (재조정 규칙이 5xx 비율에 직접 적용 어려움 — §4.5) |
| SLO-2 등록 지연 | p99 ≤ 0.5s | 0.18s (가정) | 0.27s (재조정 후) |
| SLO-3 전달 지연 | p99 ≤ 5s | 1.5s (가정) | 2.25s (재조정 후) |
| SLO-4 DLQ 적재율 | ≤ 1% | 0.2% (가정) | (재조정 규칙이 비율에 직접 적용 어려움 — §4.5) |

위 예시는 옵션 (a) 가정 시의 형태이며, 실제 숫자는 PLAN 측정 결과에 따라 산출된다.

### 4.5 비율 SLI 의 재조정 (SLO-1 / SLO-4)

SLO-1 (5xx 비율) / SLO-4 (DLQ 적재율) 는 **분포가 아니라 비율** 이라 p99 / σ 가
직접 적용되지 않는다. 본 PRD 의 재조정 규칙은 다음과 같이 변형 적용한다.

| SLO | 변형 재조정 규칙 |
|-----|-------------------|
| SLO-1 가용성 (5xx 비율) | 실측 5xx 비율의 평균 × 1.5 (옵션 (a) 채택 시). 실측이 0 인 경우 3단계 잠정값(0.5%) 유지 |
| SLO-4 DLQ 적재율 | 실측 DLQ 적재율의 평균 × 1.5 (옵션 (a) 채택 시). LP-N 별 적재율이 다르므로 가장 보수적인(높은) LP 값 채택. 실측이 0 인 경우 잠정값(1%) 유지 |

위 변형은 Q-LOAD-9 의 옵션 채택과 무관하게 적용. 비율 SLI 가 p99/σ 와 형식이 다르
다는 본질적 차이.

---

## 5. 갱신된 SLO 임계 형식

본 §5 는 Q-LOAD-9 결정 후 PLAN 측정 결과로 채워질 표의 **형식** 단일 출처. 현재는
표 헤더와 cross-link 만 잠근다.

### 5.1 갱신된 SLO 임계 표 (PLAN 측정 후 채워짐)

| SLO | 3단계 잠정값 (출처: `prd-phase3/04` §3.1) | 실측 (PLAN 단계 결과) | 재조정 임계 (§4 규칙 적용) |
|-----|---------------------------------------------|-------------------------|------------------------------|
| SLO-1 가용성 | 5xx ≤ 0.5% | (PLAN 측정) | (PLAN 산출) |
| SLO-2 등록 지연 | p99 ≤ 0.5s | (PLAN 측정) | (PLAN 산출) |
| SLO-3 전달 지연 | p99 ≤ 5s | (PLAN 측정) | (PLAN 산출) |
| SLO-4 DLQ 적재율 | ≤ 1% | (PLAN 측정) | (PLAN 산출) |

### 5.2 갱신 대상 (잠금)

- **갱신 가능 (재조정 대상):** `prd-phase3/04` §3.1 표의 "목표" 열의 **숫자만**
  갱신. 예: `5xx 비율 ≤ 0.5%` → `5xx 비율 ≤ 0.3%` (실측 후 산출 값).

### 5.3 갱신 금지 (잠금)

다음 항목은 본 PRD 가 측정 후에도 갱신하지 않는다. 3단계 I6.1 정합 유지.

- SLI PromQL 형태 (메트릭 이름 / 라벨 / 집계 함수).
- 측정 윈도우 (`[5m]` / `[1h]` / 28d / 7d / 1d).
- burn rate 표준값 (14.4× / 6×, I6.2 정합).
- 알람 규칙 YAML 의 구조 (`docker/prometheus/rules/*.yaml` 의 group / for / labels /
  annotations).
- 메트릭 이름 / 라벨 enum (3단계 I3.1 / I3.2 정합).

---

## 6. 측정 → SLO 갱신의 인계 절차

본 §6 은 본 PRD 의 측정 결과가 3단계 PRD 의 SLO 임계를 갱신하는 인계 절차다.

### 6.1 PLAN 진입 시점

1. 본 PRD 5 파일 (`00` ~ `05`) closeout.
2. `00-decisions-needed.md` 의 Q-LOAD-1~13 전건 Resolved.
3. PLAN 묶음(`docs/plan-phase4/`) 신규 작성 — 본 PRD `01` §3.1 카탈로그 + `02`
   §3 docker-compose + `03` §3 측정 프로토콜 + `04` §3 워커 N 매트릭스 를 단계별
   마일스톤(M-LOAD-1~N) 으로 분해.

### 6.2 측정 실행 시점

1. PLAN 단계의 측정 자동화 실행 (M-LOAD-N).
2. §3 측정 프로토콜의 8 단계 실행.
3. 결과 보고서 commit (`docs/prd-phase4/results/`).

### 6.3 SLO 갱신 PR 시점

1. 측정 결과로 §4 재조정 규칙 적용 → 새 임계 숫자 산출.
2. 별도 PR 로 `prd-phase3/04` §3.1 표의 임계 숫자만 갱신 (§5.3 의 갱신 금지 항목은
   변경 없음).
3. 같은 PR 에서 `docker/prometheus/rules/*.yaml` 의 임계 숫자도 동시 갱신
   (`prd-phase3/04` §5.2 의 PromQL `> (14.4 * 0.005)` 의 `0.005` 부분 등).
4. 본 PRD `00-overview` §5 AC4.4 (SLO 재조정 규칙 정의) 가 닫힌 상태에서 위 PR 진행.

### 6.4 갱신 후의 검증

- 갱신된 SLO 임계로 운영 부하 인가 시 알람이 예상대로 발화하는지 확인 (재측정).
- `prd-phase3/04` §3.4 "잠정값" 표기를 "실측 기반 갱신 (yyyy-mm-dd)" 로 변경하는
  추가 PR (별도, 본 PRD 범위 밖).

---

## 7. 수용 기준 (AC)

본 §7 은 본 PRD `00-overview` §5 AC4.4 의 글자 단위 정합 절이다.

- **AC4.4 (재인용)** SLO 재조정 규칙 정의. "실측 p99 의 1.5× 를 SLO 임계로 채택"
  같은 공식이 본 PRD 가 잠근 형태. 임계 숫자는 PLAN 측정 결과에 따라 자동 계산.
- **AC4.4.1 (본 문서 내부 AC)** §2 가 측정 대상 SLI (13개) 를 3단계 카탈로그의 부분
  집합으로 명시. 새 메트릭 도입 0 건 (`00-overview` §3 N4.6 정합).
- **AC4.4.2** §3 측정 프로토콜의 8 단계 + Prometheus query 형태(§3.2) + 통계 추출
  형식(§3.3) + 무효 조건(§3.4) 명시.
- **AC4.4.3** §4 (Q-LOAD-9) 의 옵션 + 트레이드오프 + 잠정 권고(a p99 × 1.5) + 비율
  SLI 의 변형 적용(§4.5) 명시.
- **AC4.4.4** §5.3 갱신 금지 항목이 3단계 I6.1 / I6.2 / I3.1 / I3.2 정합 — SLI PromQL
  형태 / 측정 윈도우 / 메트릭 이름 / 라벨 enum / burn rate 표준값 / 알람 YAML 구조
  모두 변경 금지.

본 §7 AC 가 충족되어야 본 PRD `00-overview` §5 의 PRD closeout 조건이 닫힌다.

---

## 8. 불변식 (Invariants)

- **I4.13 (측정 대상 SLI 폐쇄성)** §2.1 표가 본 PRD 가 측정하는 SLI 의 단일 출처.
  새 메트릭 / SLI 추가는 본 PRD 본문 갱신 PR 을 요구하며, 자동으로 3단계 메트릭
  카탈로그(`prd-phase3/01` §3) 의 갱신 PR 을 동반해야 한다.
- **I4.14 (SLI PromQL 형태 보존)** §2.2 / §5.3 정합. 본 PRD 의 측정은 3단계 SLI
  PromQL 을 그대로 사용. 형태 변경 금지 (I6.1).
- **I4.15 (측정 윈도우 보존)** 3단계 `prd-phase3/04` §3.3 의 측정 윈도우(28d /
  7d / 1d / 1h / 5m) 는 본 PRD 가 변경하지 않는다 (I6.1).
- **I4.16 (재조정 규칙의 단일성)** §4 가 잠그는 재조정 규칙은 한 측정 사이클에서
  모든 SLO 에 동일 옵션(Q-LOAD-9 결정 값) 적용. SLO 별 다른 옵션 적용 금지 (운영
  단순성).
- **I4.17 (갱신 금지 항목 보존)** §5.3 의 갱신 금지 항목은 본 PRD 의 측정 결과로
  도 변경되지 않는다. 3단계 I3.1 / I3.2 / I6.1 / I6.2 / I6.3 / I6.4 정합 유지.
- **I4.18 (측정 결과 무효 조건 강제)** §3.4 의 5 가지 무효 조건 중 하나라도 충족
  되면 측정 결과는 §5 갱신 표에 들어가지 못한다. PLAN 단계의 측정 자동화가 무효
  조건을 자동 검출해야 한다.

---

## 9. 리스크 / 오픈 퀘스천

본 PRD `00-decisions-needed.md` §🟡 의 Q-LOAD-9 가 본 문서 §4 의 옵션 정리 + 결정
위임으로 잠금 대기 중. 그 외 본 문서 단위 리스크:

- **R4.10** 측정 분산이 큰 경우 §4 의 (a) p99 × 1.5 가 운영 변동을 흡수 못할 위험
  — (b) p99 + 3σ 가 더 적합할 수 있음. 측정 결과 후 재검토 가능.
- **R4.11** 비율 SLI (SLO-1 / SLO-4) 의 재조정 규칙(§4.5) 이 실측이 0 인 경우 잠정값
  유지 — 실측이 매우 낮은 영역에서 운영 신호로 의미 있는 임계 산출이 어려움.
- **R4.12** 카디널리티 가드(§2.3) 가 측정 자체로 위반될 위험 — 본 PRD 의 부하
  인가가 라벨 enum 폐쇄성을 깨지 않으므로 위반 가능성은 낮으나, k6 자체의 메트릭
  (`k6_http_*`) 이 Prometheus 에 누적되어 시계열 수 증가 가능 (`02` §11 R4.8).
- **R4.13** Q-LOAD-9 결정이 (b) p99 + 3σ 인 경우, 측정 환경 변경(예: 호스트 교체)
  시 SLO 임계가 자동 변동 — 비안정성. (a) 가 더 안정.

---

## 10. PRD 변경 제안

본 문서 작성 중 1~3단계 PRD 에 보강 권장 항목은 [`05-out-of-scope-and-open-questions.md`](./05-out-of-scope-and-open-questions.md)
§4 통합 표가 단일 출처. 본 §은 그 표를 가리키는 포인터다.

본 문서 단위 발견 항목:

- **C-LOAD-6:** `prd-phase3/04` §3.1 표 — 본 PRD 측정 완료 후 임계 숫자만 갱신
  PR. SLI PromQL / 측정 윈도우 / 알람 YAML 구조는 변경 없음 (§5.3 정합). 결정자:
  사람.
- **C-LOAD-7:** `prd-phase3/04` §3.4 "잠정값" 표기 — 측정 완료 후 "실측 기반 갱신
  (yyyy-mm-dd, `docs/prd-phase4/results/...`)" 로 변경. 결정자: 사람.
- **C-LOAD-8:** `docker/prometheus/rules/*.yaml` — 본 PRD 측정 완료 후 임계 숫자만
  갱신 (PromQL 의 `> (14.4 * 0.005)` 의 `0.005` 등). burn rate 표준값(14.4× / 6×)
  은 변경 없음. 결정자: 사람.
