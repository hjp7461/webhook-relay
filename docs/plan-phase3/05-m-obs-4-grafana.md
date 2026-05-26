# 05. M-OBS-4 — Grafana Provisioning

> **PLAN 진입 조건:** M-OBS-3 완료(D/W 메트릭 전건 노출 + IT-OBS-6 그린).
> Q-OBS-2, Q-OBS-4, Q-OBS-7 Resolved (2026-05-27).
>
> **AI 협업 5원칙 적용:** 본 마일스톤은 PRD `prd-phase3/03` 전체와 `02` §7
> (Prometheus scrape 설정) 를 코드로 옮긴다. 새 npm 의존성 도입 없음 — 모든 산출물은
> JSON / YAML 파일 + `docker-compose.yml` 갱신.

## 1. 목표 한 줄

`docker/grafana/dashboards/` 에 4개 대시보드 JSON (overview / reliability / dlq /
shutdown) 을 두고, `docker/grafana/provisioning/` 의 provisioning YAML 2종으로
Grafana 컨테이너 기동 시 자동 import 되게 한다. `docker-compose.yml` 에 Prometheus
+ Grafana 서비스를 추가하고, `docker/prometheus.yml` 의 scrape_configs 에 `webhook-relay-api`
+ `webhook-relay-worker` 잡을 추가한다. Q-OBS-2 (a) 셧다운 진행 중 `/metrics`
200 유지를 IT-OBS-9 로 단언한다.

## 2. 선행 의존

- **마일스톤:** M-OBS-3.
- **결정 필요 항목:**
  - **Q-OBS-2** (a) 셧다운 진행 중 `/metrics` 200 유지.
  - **Q-OBS-4** (a) Grafana admin/admin 데모 — `GF_SECURITY_ADMIN_*` 환경변수
    명시.
  - **Q-OBS-7** (a) GUI export — JSON 파일을 직접 작성(또는 GUI 1회 export 후
    PR). dashboard-as-code 라이브러리 도입 금지.
- **1~2단계 결정 정합:** PRD `06` §6.2 `/dashboard`·`/_demo/receiver`·`/api/queue/stats`
  200 유지 패턴과 일관 — `/metrics` 도 동일 분기.

## 3. 테스트 우선 시퀀스 (실패 → 통과)

### IT-OBS-7 — Grafana provisioning 유효성

`packages/demo/test/it-obs-7-grafana-provisioning.integration.test.ts` (또는
`packages/core/test/...`도 가능 — 본 테스트는 도메인 무관, 단 파일시스템 스캔):

- 파일 존재 단언:
  - `docker/grafana/dashboards/01-overview.json`
  - `docker/grafana/dashboards/02-reliability.json`
  - `docker/grafana/dashboards/03-dlq.json`
  - `docker/grafana/dashboards/04-shutdown.json`
  - `docker/grafana/provisioning/datasources/prometheus.yaml`
  - `docker/grafana/provisioning/dashboards/webhook-relay.yaml`
- provisioning YAML 파싱 단언:
  - datasources: `apiVersion: 1`, name `Prometheus`, type `prometheus`, url
    `http://prometheus:9090`, isDefault true, editable false.
  - dashboards: `apiVersion: 1`, providers[0].name `webhook-relay`, `allowUiUpdates:
    false`, options.path `/var/lib/grafana/dashboards`.

> 파싱은 표준 `yaml` 라이브러리 — 단, CLAUDE.md §2 새 의존성 금지를 우회하기
> 위해 `Node.js` 내장 가능 도구 또는 단순 정규식 단언으로 한정. 단순 substring +
> 라인 단위 grep 으로 위 필드 등장 단언 가능 — **새 의존성 도입 금지**.

### IT-OBS-8 — 대시보드 JSON UID 안정성

`packages/demo/test/it-obs-8-dashboard-uid.integration.test.ts`:

- 4개 JSON 파일 파싱 (`JSON.parse`).
- 각 파일의 `uid` 필드가 다음 잠금값과 일치:
  - `01-overview.json` → `webhook-relay-overview`
  - `02-reliability.json` → `webhook-relay-reliability`
  - `03-dlq.json` → `webhook-relay-dlq`
  - `04-shutdown.json` → `webhook-relay-shutdown`
- 각 파일의 `tags` 배열에 `"webhook-relay"` 포함.
- 각 파일의 `title` 이 PRD `prd-phase3/03` §4 의 명칭과 일치.

### IT-OBS-9 — 셧다운 진행 중 `/metrics` 200 유지 (Q-OBS-2 (a))

`packages/demo/test/it-obs-9-metrics-during-shutdown.integration.test.ts`:

- api + worker 모드 부트스트랩.
- 핸들러를 의도적으로 느린 작업으로 고정 (예: 300ms 대기).
- 작업 1건 등록 → 워커가 처리 중인 상태 확인.
- SIGTERM 전송 (`core/shutdown.ts` 의 draining 트리거 — IT-S7 fixture 와 동일
  메커니즘).
- draining 상태에서 `GET /metrics` 호출:
  - 상태 `200`.
  - 본문에 `webhook_relay_shutdown_state{state="draining"} 1` 등장.
- 동시에 `POST /webhooks` 호출 → `503` (1~2단계 PRD `06` §6.2 정합 확인 — 회귀
  보호).
- 동시에 `GET /healthz` 호출 → `503` (Q-SEC-5 (a) 정합 — 회귀 보호).
- 작업 완료 후 정상 종료 — exit code 0 (잔여 작업 없으므로).

> 본 IT-OBS-9 는 Q-OBS-2 (a) 결정의 외부에서 관측 가능한 증명.

## 4. 구현 단계 (커밋 단위)

1. **`test(obs): add failing IT-OBS-7, IT-OBS-8, IT-OBS-9`**
   - §3의 3건 테스트 작성. 파일/컨테이너 부재로 빨강.

2. **`feat(docker/prometheus): scrape config for api + worker`**
   - `docker/prometheus.yml` 의 scrape_configs 갱신 (현재는 placeholder).
   - `global.scrape_interval: 15s`, `global.evaluation_interval: 15s`.
   - `scrape_configs`:
     - `job_name: webhook-relay-api`, `static_configs.targets: ["api:3000"]`,
       `metrics_path: /metrics`, `scrape_timeout: 10s`.
     - `job_name: webhook-relay-worker`, `static_configs.targets: ["worker:3001"]`,
       `metrics_path: /metrics`, `scrape_timeout: 10s`.
   - `rule_files: ["/etc/prometheus/rules/*.yaml"]` — M-OBS-5 에서 파일이 등장
     하나, 본 마일스톤에서 디렉터리 마운트만 미리 둠 (Prometheus가 비어 있는
     `rules/` 폴더를 안전하게 처리).

3. **`feat(docker/grafana/provisioning): add datasource + dashboards provider`**
   - `docker/grafana/provisioning/datasources/prometheus.yaml`:
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
   - `docker/grafana/provisioning/dashboards/webhook-relay.yaml`:
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

4. **`feat(docker/grafana/dashboards): add 01-overview.json`**
   - PRD `prd-phase3/03` §4.1 패널 7종을 포함하는 Grafana 대시보드 JSON 작성.
   - `uid: "webhook-relay-overview"`, `title: "Webhook Relay — Overview"`,
     `tags: ["webhook-relay"]`, `refresh: "30s"`, `time.from: "now-1h"`,
     `time.to: "now"`.
   - 각 패널의 PromQL 은 PRD §4.1 표의 예시와 글자 단위 일치.
   - **GUI export 형식 정리:** `id: null`, `__inputs`/`__requires` 섹션은 제거.
     `version: 1` 부터 시작.

5. **`feat(docker/grafana/dashboards): add 02-reliability.json`**
   - PRD §4.2 패널 7종. `uid: "webhook-relay-reliability"`.

6. **`feat(docker/grafana/dashboards): add 03-dlq.json`**
   - PRD §4.3 패널 5종. `uid: "webhook-relay-dlq"`.

7. **`feat(docker/grafana/dashboards): add 04-shutdown.json`**
   - PRD §4.4 패널 5종. `uid: "webhook-relay-shutdown"`.

8. **`feat(docker-compose): add prometheus + grafana services`**
   - `docker-compose.yml` 에 PRD `prd-phase3/03` §6 의 잠정 형태 그대로 두 서비스
     추가.
   - 마운트 4종: `./docker/prometheus.yml`, `./docker/prometheus/rules`,
     `./docker/grafana/provisioning`, `./docker/grafana/dashboards`.
   - 환경변수: `GF_SECURITY_ADMIN_USER=admin`, `GF_SECURITY_ADMIN_PASSWORD=admin`
     (Q-OBS-4 (a) 데모 전제).
   - worker 서비스에 `WORKER_METRICS_PORT=3001` 환경변수 + 포트 노출 (Q-OBS-3
     (a) 정합 — M-OBS-1 에서 이미 환경변수는 도입, 본 마일스톤에서 컨테이너
     포트 노출).
   - `depends_on`: prometheus → api, worker. grafana → prometheus.

9. **`feat(docker/prometheus): create rules/ directory placeholder`**
   - `docker/prometheus/rules/.gitkeep` 추가 — M-OBS-5 에서 실제 YAML 채움.
   - Prometheus 가 비어 있는 디렉터리에서 rule_files 글롭을 안전하게 처리하는지
     확인.

10. **`refactor(demo/api/metrics): explicitly bypass draining for /metrics`**
    - 1~2단계 `core/shutdown.ts` 또는 `demo` draining 미들웨어에서 `/metrics`
      가 200 유지되는지 확인 (이미 `/dashboard`·`/_demo/receiver`·`/api/queue/stats`
      가 200 유지 패턴이라 별도 코드 불필요할 수도 있음 — 본 단계는 확인 + 필요
      시 라우트를 draining 예외 목록에 명시 추가).

> **단계 10 이후 회귀 점검:** IT-OBS-7/8/9 + 1~2단계 IT(IT-S1~S7) + IT-OBS-1~6
> 전건 그린. `docker compose up` 후:
> - `http://localhost:9090` → Prometheus UI.
> - `http://localhost:3001` → Grafana (admin/admin) → 4 대시보드 자동 import.

## 5. 생성/수정할 파일 목록 (절대경로)

### 생성

- `/Users/connor/biz/webhook-relay/docker/grafana/dashboards/01-overview.json`
- `/Users/connor/biz/webhook-relay/docker/grafana/dashboards/02-reliability.json`
- `/Users/connor/biz/webhook-relay/docker/grafana/dashboards/03-dlq.json`
- `/Users/connor/biz/webhook-relay/docker/grafana/dashboards/04-shutdown.json`
- `/Users/connor/biz/webhook-relay/docker/grafana/provisioning/datasources/prometheus.yaml`
- `/Users/connor/biz/webhook-relay/docker/grafana/provisioning/dashboards/webhook-relay.yaml`
- `/Users/connor/biz/webhook-relay/docker/prometheus/rules/.gitkeep`
- `/Users/connor/biz/webhook-relay/packages/demo/test/it-obs-7-grafana-provisioning.integration.test.ts`
- `/Users/connor/biz/webhook-relay/packages/demo/test/it-obs-8-dashboard-uid.integration.test.ts`
- `/Users/connor/biz/webhook-relay/packages/demo/test/it-obs-9-metrics-during-shutdown.integration.test.ts`

### 수정

- `/Users/connor/biz/webhook-relay/docker/prometheus.yml` (scrape_configs +
  rule_files)
- `/Users/connor/biz/webhook-relay/docker-compose.yml` (prometheus + grafana
  서비스, worker 포트, 마운트)
- `/Users/connor/biz/webhook-relay/docker/grafana/.gitkeep` (제거 — 4 대시보드
  JSON이 디렉터리 채움. C-MET-12 사전 이행)
- `/Users/connor/biz/webhook-relay/packages/demo/src/server.ts` (필요 시 draining
  미들웨어 분기에 `/metrics` 라우트 명시적 예외)

### 절대 만들지/수정하지 않는 것

- `core/` 변경 없음.
- alerting rule YAML 은 M-OBS-5.
- `prd/`, `architecture.md`, `CLAUDE.md`, `README.md` 본문 변경 없음 (C-MET 갱신
  은 별도 PR).

## 6. 수용 기준 / Done 정의

- [ ] IT-OBS-7, IT-OBS-8, IT-OBS-9 그린.
- [ ] `docker compose config` 가 유효 (prometheus + grafana 서비스 등장).
- [ ] `docker compose up` 후 `curl http://localhost:9090/api/v1/targets` 의
  응답에 `webhook-relay-api`/`webhook-relay-worker` 두 잡이 `up=1` 로 등장.
- [ ] `curl http://localhost:3001/api/dashboards/uid/webhook-relay-overview`
  (Grafana API + admin/admin) 가 200 응답.
- [ ] AC5.1 — `docker compose up` 후 Grafana 가 4개 대시보드 자동 import.
- [ ] AC5.5 — provisioning 의 `editable: false` / `allowUiUpdates: false`.
- [ ] AC5.6 — UID 잠금값 일치.
- [ ] AC4.4 — 셧다운 진행 중 `/metrics` 200 유지 (IT-OBS-9 단언).
- [ ] 1~2단계 IT(IT-S1~S7, IT-S1b, IT-S2b, IT-S6b) + UT-1~6 + IT-OBS-1~6 모두
  그린.

## 7. PRD 역참조

- `prd-phase3/02-metrics-endpoint.md` §6 (셧다운 시 `/metrics` 200 유지),
  §7 (Prometheus scrape 설정).
- `prd-phase3/03-grafana-dashboards.md` §3 (디렉터리), §4 (4개 대시보드 패널),
  §5 (provisioning), §6 (`docker-compose.yml`), §8 AC5.1~5.6, §9 I5.1~5.4.

## 8. 결정 의존

- **Q-OBS-2** (a) 셧다운 중 `/metrics` 200 — IT-OBS-9 단언.
- **Q-OBS-4** (a) Grafana admin/admin — `docker-compose.yml` 환경변수.
- **Q-OBS-7** (a) GUI export → JSON PR — 본 마일스톤이 JSON 직접 작성.
- **1~2단계:** Q-SEC-5 (`/healthz` 503), PRD `06` §6.2 (drained route 표) 회귀
  보호 (IT-OBS-9 가 503/200 동시 단언).

## 9. 회귀 점검

- IT-S1~S7, IT-S1b, IT-S2b, IT-S6b — 본 마일스톤이 추가 작업을 변경하지 않으므로
  자동으로 그린.
- IT-R1 — `core/` 변경 없음.
- IT-OBS-1~6 (M-OBS-2/3) — 본 마일스톤이 변경하지 않음.
- IT-OBS-9 가 IT-S7 (그레이스풀 셧다운) 의 회귀 보호 역할을 추가로 수행 (503
  응답 + 200 유지 동시 단언).

## 10. C-MET 적용 시점

본 마일스톤에서 **본 PLAN 내 직접 적용**:

| C-MET ID | 항목 | 적용 방식 |
|----------|------|-----------|
| **C-MET-8** | `docker-compose.yml` worker 서비스에 `/metrics` 포트 추가 | §4 단계 8에서 worker 서비스에 `3001:3001` 노출 |
| **C-MET-12** | `docker/grafana/.gitkeep` 제거 | §4 단계 4~7에서 dashboards/ 채우면서 `.gitkeep` 제거. |

본 마일스톤에서 **별도 PR로 위임**:

| C-MET ID | 항목 | 위임 이유 |
|----------|------|-----------|
| C-MET-5 | `prd/06` §6.2 표에 `/metrics` 행 추가 | Q-OBS-2 결정 잠금 후 PRD 갱신 — 별도 PR. |
| C-MET-9 | `README.md` 빠른 시작에 Prometheus URL 추가 | 별도 PR. |
| C-MET-10 | `README.md` 운영 노트에 Grafana admin 변경 권장 | 별도 PR. |
| C-MET-11 | `architecture.md` §2 컴포넌트 표에 Prometheus/Grafana 추가 | 별도 PR. |

## 11. 본 마일스톤 후 데모 상태

- `docker compose up` 한 번으로 redis + api + worker + prometheus + grafana
  전체 스택 기동.
- `curl POST /webhooks` 처리 후 Grafana 의 "처리량" 패널이 1건 증가 (PRD
  AC5.2).
- IT-S4 (max attempts → DLQ) 수동 실행 후 DLQ 대시보드 "DLQ 적재율" 패널이
  `reason="max_attempts_exceeded"` 증가 (AC5.3).
- SIGTERM 전송 → shutdown 대시보드 "Draining 중 인스턴스 수" 1 → 0 전이
  (AC5.4).
- alerting rule 은 아직 없음 — M-OBS-5 에서 등장.
