# 03. Grafana Dashboards — 대시보드 구조 · JSON 위치 · provisioning · 패널별 PromQL

> 담당 페르소나: **Dashboard Designer** + **SRE/Observability Lead**
> 본 문서는 Grafana 대시보드 JSON과 provisioning 명세의 PRD 수준 요구사항을 잠근다.
> 구현 코드(JSON 파일·provisioning YAML)는 본 PRD가 승인된 뒤 **후속 PLAN 단계**에서 작성한다.

---

## 1. 컨텍스트 / 배경

`docker/grafana/`는 1~2단계에서 `.gitkeep`만 둔 자리(`docs/architecture.md`
참조 — 해당 디렉터리는 비어 있다). 본 PRD는 이 자리에 다음을 채운다.

- 대시보드 JSON 파일 (코드로 버전 관리)
- Grafana provisioning YAML (datasource·dashboards 자동 등록)
- `docker-compose.yml`의 Grafana 서비스 추가 명세

대시보드 자체는 **운영자 / 리뷰어**가 시스템 상태를 30초 안에 파악하는 도구다.
"멋진 시각화"가 아니라 **"보장이 깨질 때 어떤 패널에 신호가 뜨는가"** 가 본
PRD의 어필 포인트다.

---

## 2. 목표 (Goals)

- **G3.1** Grafana 대시보드 JSON을 `docker/grafana/dashboards/`에 둔다.
- **G3.2** Grafana provisioning(datasource + dashboards)을 `docker/grafana/provisioning/`
  에 두고, Grafana 컨테이너 기동 시 자동 import 되도록 한다.
- **G3.3** 대시보드 4종(개요 / 신뢰성 / DLQ / 셧다운)을 잠근다. (리소스는 5번째
  대시보드로 추가 가능 — §4.5)
- **G3.4** 각 대시보드의 패널 구조와 PromQL 예시를 잠근다.
- **G3.5** `docker-compose.yml`에 Grafana + Prometheus 서비스 추가의 형태를
  명세한다(정확한 YAML은 PLAN 단계).

---

## 3. 디렉터리 레이아웃 (Grafana 표준 따름)

Grafana는 다음 표준 디렉터리 구조의 provisioning을 지원한다(Grafana 9+).

```
docker/
├── prometheus.yml                  # (1~2단계 자리 — 본 PRD가 scrape 설정 채움)
├── prometheus/
│   └── rules/                       # (04 §5의 alerting rules)
│       ├── webhook-relay-availability.yaml
│       ├── webhook-relay-latency.yaml
│       └── webhook-relay-dlq.yaml
└── grafana/
    ├── .gitkeep                     # (1~2단계 잔존, 본 PRD가 채움)
    ├── dashboards/                  # 대시보드 JSON
    │   ├── 01-overview.json
    │   ├── 02-reliability.json
    │   ├── 03-dlq.json
    │   ├── 04-shutdown.json
    │   └── 05-resources.json        # (선택 — §4.5)
    └── provisioning/                # Grafana 자동 등록
        ├── datasources/
        │   └── prometheus.yaml      # Prometheus datasource 정의
        └── dashboards/
            └── webhook-relay.yaml   # dashboards/ 폴더를 가리키는 provider 정의
```

### 3.1 docker-compose 마운트

`docker-compose.yml`에 Grafana + Prometheus 서비스를 추가하고 다음을 마운트
(정확한 YAML은 PLAN 단계):

- `./docker/prometheus.yml:/etc/prometheus/prometheus.yml:ro`
- `./docker/prometheus/rules:/etc/prometheus/rules:ro`
- `./docker/grafana/provisioning:/etc/grafana/provisioning:ro`
- `./docker/grafana/dashboards:/var/lib/grafana/dashboards:ro`

> **새 Docker 의존 추가:** Prometheus + Grafana 이미지(둘 다 공식 Docker Hub).
> CLAUDE.md §2가 "Docker Compose"를 고정 스택에 포함하므로 정합. 새 npm
> 의존성은 아니다.

### 3.2 Grafana 인증

- Grafana 기본 admin/admin은 데모/로컬 전제. README "운영 노트"에 외부 노출 시
  변경 명시.
- 별도 사용자 관리·SSO는 본 PRD 비목표(N3.8).

---

## 4. 대시보드별 패널 구조

### 4.0 대시보드 공통 요소

- **Datasource:** `Prometheus` (provisioning에서 default로 등록).
- **시계 윈도우:** 기본 `Last 1 hour`, 새로고침 `30s` (운영자가 GUI에서 변경
  가능, 본 PRD는 기본값만).
- **변수:** `$queue` (`webhook-delivery` | `webhook-delivery-dlq`) — 필요한
  패널에서만 사용. 본 PRD는 변수 사용을 최소화(단순성 우선).
- **Tags:** 각 대시보드 JSON에 `["webhook-relay"]` 태그.
- **UID:** 안정적 UID(예: `webhook-relay-overview`, `webhook-relay-reliability`)
  를 잠금 — Grafana URL 영속성.
- **버전 관리:** 대시보드 편집은 **JSON 파일을 PR로 수정**(GUI 편집 후 export →
  PR). 본 PRD는 GUI 변경의 영속화 책임을 운영자에게 둔다.

### 4.1 `01-overview.json` — 시스템 개요

**용도:** 시스템이 정상 동작하는가? 30초 헬스 체크.

| 패널 | 타입 | PromQL 예시 | 설명 |
|------|------|-------------|------|
| 시스템 가용성 | Stat | `up{job=~"webhook-relay-.*"}` | API/Worker 인스턴스 헬스. 0이면 빨간색. |
| 빌드 버전 | Stat | `webhook_relay_build_info` | 현재 배포 버전·커밋 표시. |
| 처리량 (1m rate) | Time series | `sum by (job_state) (rate(webhook_relay_jobs_processed_total[1m]))` | completed/failed 분당 처리량. |
| 등록 요청률 | Time series | `sum by (status_class) (rate(webhook_relay_api_requests_total{route="/webhooks"}[1m]))` | 2xx/4xx/5xx 분포 시계열. |
| 큐 길이 | Time series | `webhook_relay_queue_depth{queue="webhook-delivery"}` (job_state별 스택) | waiting/active/delayed 시계열. |
| DLQ 길이 | Time series | `webhook_relay_queue_depth{queue="webhook-delivery-dlq",job_state="completed"}` | DLQ 적재 추이. |
| Redis 연결 | Stat + Time series | `webhook_relay_redis_up` + `increase(webhook_relay_redis_reconnects_total[5m])` | 0이면 빨간색. 재연결 빈도 추이. |

### 4.2 `02-reliability.json` — 신뢰성 & 재시도

**용도:** 재시도 분류·시도 분포·에러 분류 패턴을 본다.

| 패널 | 타입 | PromQL 예시 | 설명 |
|------|------|-------------|------|
| 시도 결과 분포 | Time series (stacked) | `sum by (outcome) (rate(webhook_relay_job_attempts_total[5m]))` | success/retriable_error/non_retriable_error 비율. |
| 외부 송신 결과 분포 | Time series (stacked) | `sum by (result) (rate(webhook_relay_deliveries_total[5m]))` | success/http_error/network_error/timeout/ssrf_blocked 비율. |
| HTTP 응답 클래스 분포 | Time series (stacked) | `sum by (http_status_class) (rate(webhook_relay_deliveries_total[5m]))` | 2xx/3xx/4xx/5xx/none. |
| 외부 송신 지연 (p50/p99) | Time series | `histogram_quantile(0.50, sum by (le, result) (rate(webhook_relay_delivery_duration_seconds_bucket[5m])))` + p99 | 동일 패널에 p50/p99 라인 2개. |
| 시도 횟수 분포 (작업당) | Heatmap or Histogram | `sum by (le) (rate(webhook_relay_delivery_attempts_per_job_bucket[5m]))` | 작업당 몇 번 시도해서 끝났나. |
| 워커 처리 시간 (p50/p99) | Time series | `histogram_quantile(0.99, sum by (le) (rate(webhook_relay_worker_processing_duration_seconds_bucket[5m])))` | 워커 일감 단위 처리 시간. |
| 워커 활성 작업 수 | Time series | `sum(webhook_relay_worker_active_jobs)` | 워커 풀의 동시 처리 수. |

### 4.3 `03-dlq.json` — DLQ 적재 & 분류

**용도:** DLQ가 왜 쌓이고 있나? 어떤 분류인가?

| 패널 | 타입 | PromQL 예시 | 설명 |
|------|------|-------------|------|
| DLQ 총량 | Stat | `webhook_relay_queue_depth{queue="webhook-delivery-dlq",job_state="completed"}` | (BullMQ의 DLQ 적재 작업은 일반적으로 completed 상태로 보존되거나, F2.4 정합으로 DLQ 큐 내 적재. PLAN 단계에서 조회 방식 검증.) |
| DLQ 적재율 (1h) | Time series | `sum by (reason) (rate(webhook_relay_dlq_jobs_total[5m]))` | max_attempts_exceeded / non_retriable / stalled_loss_recovered 분류별. |
| DLQ 분류 비율 | Pie chart | `sum by (reason) (increase(webhook_relay_dlq_jobs_total[1h]))` | 1시간 누적 비율. |
| DLQ 도달 시도 수 분포 | Heatmap | `sum by (le, outcome) (rate(webhook_relay_delivery_attempts_per_job_bucket{outcome=~"dlq_.*"}[5m]))` | DLQ에 도달한 작업이 몇 번 시도했나. |
| 전체 작업 대비 DLQ 비율 | Time series | `sum(rate(webhook_relay_dlq_jobs_total[5m])) / sum(rate(webhook_relay_jobs_processed_total[5m]))` | SLO 알람의 핵심 SLI (`04` §3). |

### 4.4 `04-shutdown.json` — 그레이스풀 셧다운 추적

**용도:** 셧다운 진행 상황과 잔여 작업.

| 패널 | 타입 | PromQL 예시 | 설명 |
|------|------|-------------|------|
| 인스턴스 상태 | Time series (stacked) | `webhook_relay_shutdown_state` (state별) | running/draining/terminated 전이 추적. |
| Draining 중 인스턴스 수 | Stat | `sum(webhook_relay_shutdown_state{state="draining"})` | 0이 아니면 셧다운 진행 중. |
| 워커 활성 작업 수 (셧다운 추적) | Time series | `webhook_relay_worker_active_jobs` (인스턴스별) | draining 진입 후 0으로 수렴해야 한다. |
| 셧다운 시 잔여 작업 | Time series + Annotation | `webhook_relay_shutdown_remaining_jobs` | 0이면 정상, 양수면 타임아웃 도달. |
| 셧다운 중 503 응답 | Time series | `sum by (route) (rate(webhook_relay_api_requests_total{status_class="5xx"}[1m]))` | `/webhooks` + `/healthz` 503 추이. draining 진입 신호. |

### 4.5 `05-resources.json` — 리소스 (선택)

**용도:** Node/Redis 프로세스 자원 사용.

| 패널 | 타입 | PromQL 예시 | 설명 |
|------|------|-------------|------|
| CPU | Time series | `rate(process_cpu_user_seconds_total[1m])` | prom-client 기본 메트릭. |
| Heap 사용량 | Time series | `process_resident_memory_bytes` | (참고: `nodejs_heap_size_used_bytes`도 사용 가능) |
| Event loop lag | Time series | `histogram_quantile(0.99, rate(nodejs_eventloop_lag_seconds_bucket[1m]))` | p99 event loop lag. >100ms면 응답 지연 신호. |
| GC pause | Time series | `rate(nodejs_gc_duration_seconds_sum[1m])` | GC 누적 시간. |
| Active handles | Time series | `nodejs_active_handles_total` | 소켓/타이머 누수 신호. |

본 대시보드는 4단계(부하/측정)에서 본격적으로 활용되므로, 본 PRD에서는 **선택**.
PLAN 단계에서 우선순위 낮음으로 진행.

---

## 5. Provisioning 명세

### 5.1 Datasource YAML 잠정 형태

`docker/grafana/provisioning/datasources/prometheus.yaml` (정확한 YAML은 PLAN):

```yaml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false
```

- `editable: false`로 GUI에서 변경 불가 → 의도치 않은 datasource 변경 차단.

### 5.2 Dashboards provider YAML 잠정 형태

`docker/grafana/provisioning/dashboards/webhook-relay.yaml` (정확한 YAML은 PLAN):

```yaml
apiVersion: 1
providers:
  - name: webhook-relay
    orgId: 1
    folder: ""
    type: file
    disableDeletion: true
    editable: true
    updateIntervalSeconds: 30
    allowUiUpdates: false
    options:
      path: /var/lib/grafana/dashboards
```

- `allowUiUpdates: false` — GUI에서 직접 저장 불가 (PR 기반 워크플로우 유지).
- `updateIntervalSeconds: 30` — JSON 파일 변경 시 30초 내 반영.

### 5.3 대시보드 JSON 형태

- Grafana GUI에서 편집 후 **`Share` → `Export` → `Save to file`** 로 내보내기.
- `id`는 `null`(임포트 시 자동 배정), `uid`는 안정값으로 잠금.
- `__inputs`/`__requires` 섹션은 provisioning에서는 무시되므로 정리 가능.

---

## 6. `docker-compose.yml` 확장 명세

본 PRD는 정확한 YAML을 잠그지 않는다(PLAN 단계). 다만 다음 구조를 요구한다.

```yaml
services:
  # 기존 redis, api, worker는 유지.
  prometheus:
    image: prom/prometheus:latest
    ports: ["9090:9090"]
    volumes:
      - ./docker/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - ./docker/prometheus/rules:/etc/prometheus/rules:ro
    depends_on: [api, worker]

  grafana:
    image: grafana/grafana:latest
    ports: ["3002:3000"]   # 호스트 3002 → 컨테이너 3000 (worker /metrics 가 호스트 3001 사용 — 2026-05-27 결정)
    volumes:
      - ./docker/grafana/provisioning:/etc/grafana/provisioning:ro
      - ./docker/grafana/dashboards:/var/lib/grafana/dashboards:ro
    environment:
      GF_SECURITY_ADMIN_USER: admin
      GF_SECURITY_ADMIN_PASSWORD: admin   # 데모 전용 — README 운영 노트에 변경 권장 명시
    depends_on: [prometheus]
```

- 본 PRD는 README 빠른 시작의 "Grafana: http://localhost:3001" 줄이 실제 동작
  하도록 만든다.

---

## 7. 비기능 요구사항

| 분류 | 요구 |
|------|------|
| **성능** | Grafana 대시보드 1개 로딩 시간 ≤ 2초(로컬 환경, scrape interval 15s 기준). 패널별 쿼리는 5초 이내 응답. |
| **유지보수성** | 대시보드 JSON은 GUI 편집 후 export → PR 워크플로우. provisioning이 자동 import. |
| **호환성** | Grafana 9+ provisioning 형식. `apiVersion: 1`. |
| **결정성** | UID 잠금으로 Grafana URL 영속성 보장. |
| **외부 의존** | Prometheus + Grafana 공식 Docker 이미지만 사용(새 npm 의존성 없음). |

---

## 8. 수용 기준 (AC)

- **AC5.1** `docker compose up` 후 `http://localhost:3001` 접속 시 4개 대시보드
  (overview/reliability/dlq/shutdown)가 자동 import되어 보인다.
- **AC5.2** `IT-S1`을 실행한 직후 overview 대시보드의 "처리량" 패널이 1건 처리
  증가를 보여준다.
- **AC5.3** `IT-S4`(max attempts → DLQ)를 실행한 직후 DLQ 대시보드의 "DLQ 적재율"
  패널이 `reason="max_attempts_exceeded"` 증가를 보여준다.
- **AC5.4** `IT-S7`(셧다운) 진행 중 shutdown 대시보드의 "Draining 중 인스턴스
  수" 패널이 1로 전환된 뒤 0으로 복귀한다.
- **AC5.5** Grafana provisioning의 `editable: false`/`allowUiUpdates: false`로
  GUI에서 datasource 직접 수정·대시보드 저장이 불가하다.
- **AC5.6** 각 대시보드 JSON 파일의 UID가 §4 표의 안정값으로 잠겨 있다.

---

## 9. 불변식 (Invariants)

- **I5.1 (코드로 버전 관리)** 대시보드 변경은 JSON 파일 PR을 거친다. GUI 직접
  저장 금지(`allowUiUpdates: false`).
- **I5.2 (UID 안정성)** 대시보드 UID는 한 번 잠그면 변경하지 않는다.
- **I5.3 (PromQL 카탈로그 정합)** 대시보드 PromQL은 `01-metrics-and-labels.md`
  §3의 메트릭 이름·라벨과 글자 단위로 일치해야 한다(메트릭 이름 변경 시
  대시보드 PR도 동시에).
- **I5.4 (데모 전제)** Grafana admin 비밀번호는 데모 기본값. 외부 노출 전 변경
  필요는 README 운영 노트에 명시.

---

## 10. 리스크 / 오픈 퀘스천

- **R5.1** **Q-OBS-4** — Grafana 인증 정책(데모 admin/admin vs 환경변수 주입)
  → `05` §2 위임. 잠정: 데모 admin/admin + README 경고.
- **R5.2** **Q-OBS-7** — Grafana 대시보드 JSON 생성 방식(GUI export vs
  dashboard-as-code 라이브러리 도입 — e.g. `grafonnet`) → `05` §2 위임. 잠정:
  GUI export(새 의존성 도입 회피).
- **R5.3** 대시보드 JSON의 binary diff가 PR 리뷰 어려움. 잠정: PR 리뷰 가이드
  (스크린샷 첨부)를 README에 추가하는 정도. 본 PRD에서 도구 도입 없음.
- **R5.4** Prometheus + Grafana 컨테이너 추가로 `docker compose up` 메모리
  사용 증가. 로컬 데모 환경의 영향 — 운영 영향 없음.

---

## 11. PRD 변경 제안

전체는 [`05-out-of-scope-and-open-questions.md`](./05-out-of-scope-and-open-questions.md)
§3 통합 표 참조. 본 문서 발견 항목:

- **C-MET-9:** `README.md` 빠른 시작 절에 "Grafana: http://localhost:3001"은
  이미 있으나, "Prometheus: http://localhost:9090" 추가 제안.
- **C-MET-10:** `README.md` 운영 노트에 "Grafana admin 기본값 변경" 항목 추가
  제안 (운영 노출 전).
- **C-MET-11:** `docs/architecture.md` §2 컴포넌트 표에 "Prometheus" / "Grafana"
  행 추가 제안.
- **C-MET-12:** `docker/grafana/.gitkeep`는 본 PRD에서 dashboards/provisioning
  실제 파일이 들어오면 제거 가능(PLAN 단계).
