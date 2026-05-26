# 06. M-OBS-5 — SLO + Alerting Rules

> **PLAN 진입 조건:** M-OBS-4 완료(Prometheus + Grafana 컨테이너 동작 + 4개 대시
> 보드 import). Q-OBS-11, Q-OBS-12, Q-OBS-13 Resolved (2026-05-27).
>
> **AI 협업 5원칙 적용:** 본 마일스톤은 PRD `prd-phase3/04` 전체를 코드로 옮긴다.
> SLO 목표 숫자(99.5% / 0.5s / 5s / 1%) 는 잠정값이며, 본 PLAN 에서는 그 숫자를
> 그대로 알람 임계로 사용한다. 4단계에서 실측 후 재조정은 본 PLAN 범위 밖.

## 1. 목표 한 줄

`docker/prometheus/rules/` 아래에 SLO 4종(가용성 / 등록 지연 / 전달 지연 / DLQ
적재율) + 플랫폼 헬스의 Prometheus alerting rule YAML 4종을 작성하고,
`promtool check rules` 가 통과하며 PromQL 의 모든 메트릭 이름·라벨이 `prd-phase3/01`
§3 카탈로그와 글자 단위 일치함을 IT-OBS-10 으로 단언한다.

## 2. 선행 의존

- **마일스톤:** M-OBS-4 (rule_files 마운트가 이미 설정됨).
- **결정 필요 항목:**
  - **Q-OBS-11** (a) 잠정값 + 4단계 재조정 — 99.5% / 0.5s / 5s / 1%.
  - **Q-OBS-12** (a) 14.4× / 6× burn rate — Multi-window multi-burn-rate.
  - **Q-OBS-13** (a) `reason="non_retriable"` SLO-4 포함 — DLQ 적재율 PromQL 에
    분류 필터 없음.
- **1~2단계 결정 정합:** Q-RETRY-1 (a) 3xx = NonRetriableError 분류, Q-DLQ-1
  (a) DLQ 격리만 — SLO-4 의 DLQ 적재 비율에 모든 분류가 포함됨.

## 3. 테스트 우선 시퀀스

### IT-OBS-10 — Alerting rule 유효성 + PromQL 라벨 카탈로그 정합

`packages/demo/test/it-obs-10-alerting-rules.integration.test.ts`:

본 테스트는 두 검증을 한다.

**(a) `promtool check rules` 통과 확인:**
- 테스트 안에서 docker run 또는 `prom/prometheus` 이미지의 `promtool` 바이너리
  를 사용해 4개 rule 파일을 검사. CI 환경 의존을 줄이려면 Testcontainers 의
  prom/prometheus 이미지 + `docker exec` 패턴, 또는 단순히 본 테스트를 `pnpm
  test:integration` 의 일부로 두되 `promtool` 가용성 확인을 setup 단계에 둠
  (없으면 skip).
- 대안: **테스트 안에서 YAML 파싱 + PromQL 의 메트릭 이름 등장 정규식 단언**으로
  대체 (`promtool` 의존을 제거). 본 PLAN의 권장은 후자 (CLAUDE.md §2 새 의존성
  회피, 그리고 Testcontainers Docker-in-Docker 회피).

**(b) PromQL 카탈로그 정합:**
- 4개 rule YAML 파일을 텍스트로 읽음.
- 정규식으로 PromQL 의 메트릭 이름(예: `webhook_relay_api_requests_total`,
  `webhook_relay_dlq_jobs_total`, `webhook_relay_redis_up`, `webhook_relay_shutdown_remaining_jobs`,
  `webhook_relay_redis_reconnects_total`, `webhook_relay_worker_processing_duration_seconds_bucket`,
  `webhook_relay_api_request_duration_seconds_bucket`, `webhook_relay_jobs_processed_total`)
  추출.
- 추출된 메트릭 이름이 `prd-phase3/01` §3 카탈로그 (M-OBS-2/3 에서 코드에 잠긴
  것)와 정확히 일치함을 단언.
- 추출된 라벨(`route="/webhooks"`, `status_class="5xx"`, `outcome="success"`,
  `reason="..."`, `state="..."`) 이 §4.2 enum 표 안에 있음을 단언.

### IT-OBS-10b (선택) — Prometheus 컨테이너 alerting rule 로드 확인

- Testcontainers `prom/prometheus:latest` 컨테이너 기동 + rule_files 마운트.
- HTTP `GET http://prometheus:9090/api/v1/rules` 호출.
- 응답에 4 group (`webhook-relay-availability`, `...-latency`, `...-dlq`,
  `...-platform`) 등장 단언.

> 본 마일스톤의 최소 요구는 IT-OBS-10 (a)+(b). IT-OBS-10b 는 선택 — CI 무거움.

## 4. 구현 단계 (커밋 단위)

1. **`test(obs): add failing IT-OBS-10 for alerting rules`**
   - §3의 테스트 작성. rule 파일 부재로 빨강.

2. **`feat(docker/prometheus/rules): add webhook-relay-availability.yaml`**
   - PRD `prd-phase3/04` §5.2.1 의 YAML 그대로 옮김.
   - SLO-1: `WebhookRelayAvailabilityBurnRateFast` (14.4×, 5m+1h, page) +
     `WebhookRelayAvailabilityBurnRateSlow` (6×, 30m+6h, ticket).
   - 라벨: `severity` + `slo`.

3. **`feat(docker/prometheus/rules): add webhook-relay-latency.yaml`**
   - PRD §5.2.2 의 YAML 그대로.
   - SLO-2: `WebhookRelayRegisterLatencyP99High` (p99 > 0.5s for 10m).
   - SLO-3: `WebhookRelayDeliveryLatencyP99High` (p99 > 5s for 10m).

4. **`feat(docker/prometheus/rules): add webhook-relay-dlq.yaml`**
   - PRD §5.2.3 의 YAML 그대로.
   - SLO-4: `WebhookRelayDlqRateHigh` (DLQ 비율 > 1% sustained 30m).
   - `WebhookRelayDlqStalledLoss` (stalled_loss 발생 시 즉시 page).

5. **`feat(docker/prometheus/rules): add webhook-relay-platform.yaml`**
   - PRD §5.2.4 의 YAML 그대로.
   - `WebhookRelayRedisDown`, `WebhookRelayRedisReconnectStorm`,
     `WebhookRelayInstanceDown`, `WebhookRelayShutdownTimedOut`.

6. **`chore(docker): remove .gitkeep from prometheus/rules/`**
   - 실제 파일이 들어왔으므로 `.gitkeep` 제거.

7. **(선택) `test(obs): IT-OBS-10b prometheus container loads rules`**
   - Testcontainers prom/prometheus 기동 + `/api/v1/rules` 호출 단언.
   - CI 부담이 크면 본 단계는 생략하고 IT-OBS-10 (a)+(b) 만 유지.

> **단계 6 이후 회귀 점검:** IT-OBS-10 + 1~2단계 IT + IT-OBS-1~9 전건 그린.
> `docker compose up` 후:
> - `http://localhost:9090/rules` 또는 `/api/v1/rules` 에 4 group 등장.
> - Grafana 의 SLO 패널 (선택 — 본 PLAN 범위 밖. 본 마일스톤은 rule YAML 까지).

## 5. 생성/수정할 파일 목록 (절대경로)

### 생성

- `/Users/connor/biz/webhook-relay/docker/prometheus/rules/webhook-relay-availability.yaml`
- `/Users/connor/biz/webhook-relay/docker/prometheus/rules/webhook-relay-latency.yaml`
- `/Users/connor/biz/webhook-relay/docker/prometheus/rules/webhook-relay-dlq.yaml`
- `/Users/connor/biz/webhook-relay/docker/prometheus/rules/webhook-relay-platform.yaml`
- `/Users/connor/biz/webhook-relay/packages/demo/test/it-obs-10-alerting-rules.integration.test.ts`

### 수정

- `/Users/connor/biz/webhook-relay/docker/prometheus/rules/.gitkeep` (제거)

### 절대 만들지/수정하지 않는 것

- alertmanager 설정 (`alertmanager.yml`) — 본 PRD 범위 밖 (PRD `prd-phase3/05`
  §1.3).
- `runbook_url` 본문 — 본 PRD 비워 둠 (운영 PRD 책임).
- `CLAUDE.md` §3 폴더 구조에 `docker/prometheus/rules/` 추가 — C-MET-16 별도 PR.
- `prd/`, `architecture.md`, `README.md` 본문 변경 없음.

## 6. 수용 기준 / Done 정의

- [ ] IT-OBS-10 그린.
- [ ] AC6.1 — 4개 rule YAML 파일 존재.
- [ ] AC6.2 — `promtool check rules docker/prometheus/rules/*.yaml` 통과 (수동
  검증 또는 IT-OBS-10 자동화).
- [ ] AC6.3 — IT-S4 실행 후 1시간 윈도우에서 `WebhookRelayDlqRateHigh` 발화
  조건 만족 (수동 또는 후속 4단계 검증 — 본 PRD 범위 밖이라 PRD 도 "테스트는 본
  PRD 범위 밖"으로 명시).
- [ ] AC6.4 — PromQL 의 메트릭/라벨이 `prd-phase3/01` §3 카탈로그와 정확히 일치
  (IT-OBS-10 단언).
- [ ] AC6.5 — 알람 라벨에 `severity` + `slo` 모두 존재.
- [ ] 1~2단계 IT(IT-S1~S7) + IT-OBS-1~9 모두 그린.

## 7. PRD 역참조

- `prd-phase3/04-slo-and-alerts.md` §3 (SLO 카탈로그), §4 (Error Budget),
  §5 (alerting rule YAML), §6 (IT 시나리오 ↔ SLO 매트릭스), §8 AC6.1~6.5,
  §9 I6.1~6.4.
- `prd-phase3/02-metrics-endpoint.md` §7.1 (rule_files 마운트 경로).

## 8. 결정 의존

- **Q-OBS-11** (a) 잠정값 — alerting rule YAML 의 임계 숫자.
- **Q-OBS-12** (a) 14.4×/6× — burn rate.
- **Q-OBS-13** (a) non_retriable 포함 — SLO-4 PromQL.
- **1~2단계:** Q-RETRY-1/2 분류 정합, Q-SEC-5 (`/healthz` 503 — 본 마일스톤
  에서 추가 알람 발화하지 않으나 회귀 보호 유지).

## 9. 회귀 점검

- IT-S1~S7, IT-R1, UT-1~6 — 변경 없음.
- IT-OBS-1~9 — 변경 없음.
- IT-OBS-10 은 정적 YAML 파싱 + 정규식 단언이므로 hot path 영향 없음.
- Prometheus 컨테이너 기동 시 rule 로드 실패는 컨테이너 로그로 즉시 가시화 —
  로컬에서 `docker compose up` 1회 확인 권장 (수동).

## 10. C-MET 적용 시점

본 마일스톤에서 **본 PLAN 내 직접 적용**:

| C-MET ID | 항목 | 적용 방식 |
|----------|------|-----------|
| (없음) | — | rule YAML 생성만. C-MET 갱신 대상 문서는 모두 별도 PR. |

본 마일스톤에서 **별도 PR로 위임**:

| C-MET ID | 항목 | 위임 이유 |
|----------|------|-----------|
| C-MET-13 | `architecture.md` §5 "보장한다" 에 SLO-1~4 추가 | 본 PLAN 완료 + 사용자 결정 후 별도 PR. |
| C-MET-14 | `prd/06` 운영 노트에 "알람 라우팅은 본 PRD 범위 밖" | 별도 PR. |
| C-MET-15 | `README.md` 운영 노트에 "SLO 임계는 잠정값" | 별도 PR. |
| C-MET-16 | `CLAUDE.md` §3 폴더 구조에 `docker/prometheus/rules/` 추가 | **CLAUDE.md 수정**은 본 PLAN 범위 밖. 사용자 결정 후 별도 PR. |

## 11. 본 마일스톤 후 데모 상태

- `docker compose up` 후 Prometheus 컨테이너 가 4개 rule group 로드.
- `http://localhost:9090/rules` 또는 `/api/v1/rules` 에 4 group 등장.
- IT-S4 (max attempts → DLQ) 수동 실행 + 30분 대기 후 `WebhookRelayDlqRateHigh`
  ticket 발화 (단, Alertmanager 미연동이라 외부 라우팅은 없음 — 본 PRD 범위 밖).
- Grafana 의 SLO 대시보드 패널은 본 PLAN 에서 다루지 않음(선택 — `05-resources.json`
  등과 함께 후속 작업).
- **본 마일스톤이 PLAN 의 핵심 완료 시점.** M-OBS-6 는 선택.
