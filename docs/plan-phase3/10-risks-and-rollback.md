# 10. Risks & Rollback — 가장 깨지기 쉬운 부분 + 롤백 전략 (Phase 3)

> 본 문서는 본 PLAN 을 실행하는 동안 가장 자주 어긋날 수 있는 지점과, 어긋났을
> 때 어떻게 되돌릴지를 명시한다.
>
> **AI 협업 5원칙 적용:** 본 문서는 "불확실하면 멈추고 묻는다"(원칙 4)의 실행
> 가이드. 아래 리스크가 현실화되면 임의로 PLAN 을 확장하지 말고 사용자에게 보고한다.

---

## 1. 리스크 등급 정의

| 등급 | 의미 | 대응 |
|------|------|------|
| ★★★ | 마일스톤 차단 가능성 매우 높음 | 사전 PoC 1~2시간 필요. |
| ★★☆ | 마일스톤 일정 영향 큼 | 발견 즉시 사용자에게 보고. PLAN 변경 검토. |
| ★☆☆ | 마일스톤 내 해결 가능 | 모니터링만. |

---

## 2. 핵심 리스크 목록

### R-OBS-001 — IT-R1 회귀 (★★★)

- **대상 마일스톤:** 전 마일스톤 (특히 M-OBS-1, M-OBS-2).
- **현상:** M-OBS-2 가 `core/metrics.ts` 에 메트릭 이름 `webhook_relay_queue_depth`
  등을 도입하면서 IT-R1 grep 룰이 `webhook` 토큰을 검출 → 빨강. 또는 M-OBS-3
  에서 `demo` 측 변경이 무심코 `core` 의 import 경계를 깨뜨리거나, `core` 에
  도메인 식별자가 누수.
- **사전 신호:**
  - M-OBS-1 의 IT-R1 보강 룰 작성 시 PascalCase split / 단어 경계 정규식의
    edge case 검출.
  - `httpsAgent` 같은 토큰이 `http` 로 잘못 잡히는 경우.
- **대응 (우선순위 순):**
  1. **Plan A (M-OBS-1 단계 2 사전 보강):** 보강 룰을 작성한 직후 가짜 데이터
     6건 (`webhook_relay_queue_depth`, `processWebhook`, `httpStatus`, `httpsAgent`,
     `WebhookDelivery`, `mychocolatehttpx`) 으로 unit 단언. 기대 결과: 통과/실패/실패/
     통과/실패/통과.
  2. **Plan B:** 보강 룰이 너무 엄격해 `httpsAgent` 같은 정당한 식별자를 잘못
     잡으면, 정규식 토크나이저를 정확히 word-boundary 매칭으로 좁힘 (단어 단위로
     `http` 만 일치하도록).
  3. **Plan C:** Q-OBS-14 결정을 (b) "`core_*` 접두 변경" 으로 되돌리는 결정 —
     본 PLAN 재시작 + PRD `prd-phase3/01` 갱신 + 1~2단계 `architecture.md` §2
     도메인 식별자 정의 갱신 필요. **사용자 결정.**
- **롤백 트리거:** Plan A/B 모두 1일(8시간) 내 안정화 실패.
- **롤백 동작:** Plan C 적용. PRD/PLAN 광범위 갱신 — 사용자에게 즉시 보고.

### R-OBS-002 — 카디널리티 폭주 (★★★)

- **대상 마일스톤:** M-OBS-3, M-OBS-6 (IT-OBS-11 단언).
- **현상:** 라벨 값이 PRD §4.2 enum 밖으로 새는 경우 — 예: Fastify 의 `route`
  라벨이 동적 path (`/api/queue/stats/123`) 를 포함해 카디널리티 폭주.
- **사전 신호:**
  - 통합 테스트에서 `/metrics` 응답 행 수가 1000 을 넘기 시작.
  - `webhook_relay_api_requests_total` 의 라벨 조합이 7×2×4=56 을 넘음.
- **대응:**
  1. **Plan A (M-OBS-3 단계 4 가드):** Fastify metrics plugin 에서 `route` 추출
     시 `demo/constants.ts::ROUTE_ENUM` 안의 값이 아니면 라벨로 등록하지 않음
     (drop or `route="unknown"` 한정 enum 추가).
  2. **Plan B:** IT-OBS-11 단언이 빨강이면 즉시 라벨 enum 표를 점검. 새 값
     발견 시 PRD `prd-phase3/01` §4.2 표 갱신 필요 — 별도 결정.
- **롤백 트리거:** IT-OBS-11 단언이 30분 안에 안정화 실패.
- **롤백 동작:** 폭주한 라벨을 일시적으로 제거 (메트릭 정의에서 라벨 삭제 →
  마이너 버전 의식하고 진행. 운영 영향 없음 — 본 PRD 는 운영 메트릭이 아니라
  데모/포트폴리오 메트릭).

### R-OBS-003 — prom-client `register.clear()` 의 운영 누수 (★★☆)

- **대상 마일스톤:** M-OBS-3 (IT-OBS-6 fixture).
- **현상:** IT-OBS-6 의 시나리오별 격리를 위해 `register.clear()` 를 호출했는데,
  같은 프로세스 안의 다른 테스트(통합 테스트의 다음 케이스) 가 깨끗하지 못한
  상태로 시작. 또는 실수로 운영 코드 경로에 `register.clear()` 가 들어가 `/metrics`
  가 빈 응답.
- **사전 신호:** IT-OBS-6 의 첫 케이스는 통과하나 후속 케이스가 baseline 0 으로
  잘못 계산.
- **대응:**
  1. **Plan A:** `register.clear()` 는 IT-OBS-6 의 **각 케이스 setup 에서만**
     호출. afterAll 에서 한 번 더 보강 정리.
  2. **Plan B:** 시나리오별로 별도 Fastify/worker 인스턴스 + 별도 Redis prefix.
     이 패턴은 1~2단계 통합 테스트에서 이미 사용 중 — `prom-client` 도 같이
     리셋.
  3. **Plan C:** 운영 코드에서 `register.clear()` 호출 금지를 별도 lint 규칙
     으로 — 본 PLAN 범위 밖. 코드 리뷰 가드.
- **롤백 트리거:** IT-OBS-6 의 후속 케이스가 비결정적으로 실패 (flaky).
- **롤백 동작:** 시나리오별 fixture 를 더 강한 격리(완전 별도 프로세스)로 격상.

### R-OBS-004 — Grafana provisioning 의 idempotency 위반 (★★☆)

- **대상 마일스톤:** M-OBS-4.
- **현상:** Grafana 컨테이너 재기동 시 대시보드 가 중복 import 되거나 (`disableDeletion:
  true` 인데 UID 가 충돌), provisioning YAML 이 Grafana 버전 변경으로 invalid 가
  되어 컨테이너 기동 실패.
- **사전 신호:** `docker compose up` 후 Grafana 로그에 `failed to load dashboard
  ...` 등장. `http://localhost:3001` 접속 시 대시보드 미등장.
- **대응:**
  1. **Plan A:** `provisioning/dashboards/webhook-relay.yaml` 의 `updateIntervalSeconds:
     30` 으로 자동 reconciliation. UID 안정값 잠금이 보강.
  2. **Plan B:** Grafana 버전을 `grafana/grafana:10.x` 같은 안정 버전으로 잠금
     (`latest` 회피).
  3. **Plan C:** provisioning YAML 의 `apiVersion: 1` 명시. 향후 Grafana v2
     변경 시 PRD 갱신.
- **롤백 트리거:** Grafana 컨테이너가 기동 실패 또는 대시보드 import 실패가
  지속.
- **롤백 동작:** Plan B 적용. `docker-compose.yml` 의 이미지 태그를 안정 마이너
  버전으로 고정.

### R-OBS-005 — prom-client 직렬화 비용 (★☆☆)

- **대상 마일스톤:** M-OBS-2 이후.
- **현상:** `/metrics` 응답 생성 시 `register.metrics()` 가 모든 시계열을 직렬화
  하므로 시계열이 많아지면 응답 시간 증가. IT-OBS-1 의 응답 200 단언이 timeout
  으로 실패할 수 있음.
- **사전 신호:** IT-OBS-1 응답 시간이 100ms 를 넘기 시작.
- **대응:**
  1. 카디널리티 가드 (R-OBS-002) 와 동일 — 라벨 enum 잠금이 본 문제도 해결.
  2. Histogram bucket 수를 PRD 표보다 늘리지 않음 (Q-OBS-9 잠금).
- **롤백 트리거:** 응답 시간이 PRD `prd-phase3/02` §9 NFR (≤ 100ms) 를 초과.
- **롤백 동작:** 카디널리티 검사 → 폭주 원인 라벨 제거.

### R-OBS-006 — 셧다운 진행 중 `/metrics` 의 자체 셧다운 (★☆☆)

- **대상 마일스톤:** M-OBS-4 (IT-OBS-9).
- **현상:** 1~2단계 `core/shutdown.ts` 가 `httpServer.close()` 를 호출하면 `/metrics`
  도 close 되어 200 응답 불가. Q-OBS-2 (a) "200 유지" 결정과 위반.
- **사전 신호:** IT-OBS-9 빨강 — draining 단계에서 `/metrics` 가 connection
  refused.
- **대응:**
  - 1~2단계의 시퀀스는 `setDraining(true)` → 워커 close race → `httpServer.close()`.
    즉 draining 진입 후에도 httpServer 는 한동안 살아 있고, `/metrics` 도 응답.
    `httpServer.close()` 이후엔 모든 라우트가 거부됨 (의도된 동작).
  - IT-OBS-9 는 **draining 진입 후 httpServer 가 살아 있는 시점** 에서만 단언.
    setup 에서 draining 진입을 확인하고 즉시 `/metrics` 호출.
- **롤백 트리거:** IT-OBS-9 가 의도와 다르게 실패하면 시퀀스 분석 후 셧다운
  순서를 변경 (사용자 결정 필요 — 1~2단계 PRD `06` §6.2 영향).

### R-OBS-007 — Testcontainers Prometheus 의 CI 부담 (★☆☆)

- **대상 마일스톤:** M-OBS-5 (선택 IT-OBS-10b), M-OBS-6 (선택 IT-OBS-13).
- **현상:** `prom/prometheus` 이미지를 Testcontainers 로 띄우면 CI 시간이 1~2분
  추가.
- **대응:**
  - IT-OBS-10 의 메인 단언은 YAML 파싱 + 정규식 (Docker 무관). IT-OBS-10b 는
    선택.
  - IT-OBS-13 (scrape 실패 알람) 도 선택. 본 PLAN 의 최종 게이트는 요구하지
    않음.
- **롤백 트리거:** CI 시간 증가로 빌드 임계 초과.
- **롤백 동작:** IT-OBS-10b / IT-OBS-13 을 단순 정적 검사로 대체. 메인 알람
  발화 검증은 4단계로 이관.

### R-OBS-008 — `docker compose up` 의 컨테이너 의존성 (★☆☆)

- **대상 마일스톤:** M-OBS-4.
- **현상:** Prometheus 가 api/worker 컨테이너가 완전히 기동되기 전에 scrape 시도
  → `up=0` 의 첫 1분 동안 빨강. Grafana 의 첫 패널 로딩 시 데이터 없음.
- **대응:**
  - `depends_on` 만으로는 healthcheck 보장 안 됨. PRD `prd-phase3/03` §6 의
    잠정 형태가 그대로지만, 운영 영향 없음 (15~30초 후 정상화).
  - 본 동작은 **데모 환경의 예상 동작**이며 README 운영 노트에 명시 권장 (C-MET-9/10
    별도 PR).

---

## 3. 마일스톤별 리스크 표

| 마일스톤 | 주요 리스크 |
|---------|-------------|
| M-OBS-1 | R-OBS-001 (★★★) IT-R1 보강 룰 정확성 |
| M-OBS-2 | R-OBS-001 (★★★), R-OBS-005 (★☆☆) |
| M-OBS-3 | R-OBS-002 (★★★) 카디널리티, R-OBS-003 (★★☆) register.clear |
| M-OBS-4 | R-OBS-004 (★★☆) Grafana provisioning, R-OBS-006 (★☆☆) 셧다운 시 `/metrics`, R-OBS-008 (★☆☆) |
| M-OBS-5 | R-OBS-007 (★☆☆) Testcontainers Prometheus |
| M-OBS-6 | R-OBS-002 (★★★) 카디널리티 IT-OBS-11 단언 |

---

## 4. PLAN 자체에 변경이 필요할 때 (보고 절차)

본 PLAN 실행 중 다음 상황이 발견되면 임의로 PLAN/PRD 를 갱신하지 말고 사용자에게
보고한다.

1. **PRD 모순 발견:** PRD `prd-phase3/00~04` 의 §AC/§I/§F 가 서로 모순 — 코드
   변경 전 사용자 결정.
2. **결정 누락 발견:** 본 PLAN 실행 중 새 결정이 필요 — `00-decisions-needed.md`
   에 새 Q-OBS-# 행 추가 + 사용자 결정 대기.
3. **1~2단계 회귀:** IT-S1~S7, IT-R1, UT-1~6 중 1건이라도 빨강이 되면 본 PLAN
   진행을 즉시 중단 → 회귀 원인 분석 → 사용자에게 보고.
4. **카디널리티 폭주:** IT-OBS-11 단언이 빨강 → 즉시 보고.
5. **새 의존성 요구:** prom-client / Docker 이미지 외 새 의존성이 필요해 보이는
   상황 → 사용자에게 보고 + CLAUDE.md §2 정합 확인.

---

## 5. 롤백 일반 전략

본 PLAN 의 모든 마일스톤은 **순차적/원자적 커밋**으로 진행되므로, 특정 마일스톤이
빨강일 때:

1. 해당 마일스톤의 모든 커밋을 `git revert` (또는 별도 브랜치에서 진행 중이면
   브랜치 폐기).
2. 이전 마일스톤의 게이트(`09-acceptance-gates.md` §1~6)로 되돌아가 그린 확인.
3. 문제 원인 분석 → 본 문서 §2 의 Plan A/B/C 적용 또는 새 Q-OBS-# 결정.
4. 사용자 승인 후 재시도.

**금지 사항:**
- 1~2단계 코드를 변경하여 회귀를 "숨기지" 않음. 모든 회귀는 사용자에게 보고.
- `core` 도메인 격리를 "예외 추가" 로 회피하지 않음 (IT-R1 의 BANNED 세트 임의
  축소 금지).
- 카디널리티 폭주 시 라벨 enum 을 임의로 늘리지 않음 — PRD `prd-phase3/01`
  §4.2/§4.4 표 갱신은 별도 결정.
