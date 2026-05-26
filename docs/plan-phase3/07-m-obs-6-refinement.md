# 07. M-OBS-6 — Refinement (선택)

> **PLAN 진입 조건:** M-OBS-5 완료(alerting rule YAML 4종 통과). 본 마일스톤에
> 의존하는 Q-OBS 없음 (전건 Resolved 2026-05-27 — 잔여 정리 단계).
>
> **AI 협업 5원칙 적용:** 본 마일스톤은 **선택 마일스톤**이다. M-OBS-5 종료
> 시점에 IT-OBS-11/12 가 이미 적용되어 있으면 본 마일스톤은 생략 가능.
> 단, 최종 게이트(`09-acceptance-gates.md` §5)는 IT-OBS-11/12 그린을 요구한다.

## 1. 목표 한 줄

카디널리티 가드(IT-OBS-11) 와 구조화 로그 ↔ 메트릭 라벨 정합(IT-OBS-12) 의 회귀
보호 통합 테스트를 도입하고, 잔여 C-MET 정리 및 scrape 실패 알람의 정합성을
확인한다. M-OBS-5 까지의 산출물에 대한 **장기 회귀 보호 그물망**을 완성한다.

## 2. 선행 의존

- **마일스톤:** M-OBS-5.
- **결정 필요 항목:** 없음 (15건 전건 Resolved).
- **1~2단계 결정 정합:** Q-SEC-6 (a) "정책만, 자동화는 후속" — 본 마일스톤은
  로그 필드와 메트릭 라벨의 정합 단언을 강화하나, 자동 마스킹 유틸리티는 도입
  하지 않음.

## 3. 테스트 우선 시퀀스

### IT-OBS-11 — 카디널리티 가드

`packages/demo/test/it-obs-11-cardinality-guard.integration.test.ts`:

- api + worker 모드 부트스트랩 + Testcontainers Redis.
- 1~2단계 IT 7개 시나리오를 **연속 실행** (격리된 prefix). 라벨 enum 의 모든 값
  이 1회 이상 등장하도록 의도적 케이스 추가:
  - `result="ssrf_blocked"`: `ALLOW_PRIVATE_TARGETS=false` + `localhost` 타겟.
  - `result="timeout"`: 매우 짧은 `WEBHOOK_DELIVERY_TIMEOUT_MS`.
  - 모든 `status_class`: 2xx/3xx/4xx/5xx 응답을 내는 stub 수신자 4종.
- `GET /metrics` 응답 본문 파싱:
  - 각 메트릭 이름별로 시계열 행(`metric_name{labels} value`) 개수 카운트.
  - **단언:** 각 메트릭의 시계열 수 ≤ `prd-phase3/01` §4.4 표의 상한.
  - 전체 라벨 조합 총합 ≤ 1000 (PRD §4.1 예산).
- 위반 시 `AC3.6` 실패 — PLAN 단계 빌드/테스트가 실패하도록 (PRD §9 정합).

### IT-OBS-12 — 구조화 로그 ↔ 메트릭 라벨 정합

`packages/demo/test/it-obs-12-log-metric-label-naming.integration.test.ts`:

- 본 테스트는 코드의 정적 검사:
  - `demo/handlers/*.ts` 등에서 로그 객체 키(`attempt`, `errorClass`, `httpStatus`,
    `queueName`, `jobId`)가 등장.
  - 동일 식별자가 메트릭 라벨 이름(또는 PRD §3 표의 라벨)에 대응되는지 확인.
  - **단언 (느슨한 정합):** 로그에서 `attempt` 라는 키를 쓰면 메트릭 라벨에서도
    `attempt` 표기 일관 (현재 본 PRD 는 라벨로 두지 않으므로 등장 안 함 — 단,
    `errorClass` ↔ `error_class` (스네이크 케이스 변환) 매핑은 명시).
  - 로그 필드 ↔ 메트릭 라벨 매핑 표는 `prd-phase3/00` §8 "구조화 로깅(계승)
    — 메트릭 라벨과 로그 컨텍스트가 같은 이름을 쓰도록 권장" 정합.

> 본 IT-OBS-12 는 **권장 사항의 회귀 보호** — 위반 시 PLAN 빌드 실패는 아니나
> 경고 로그.

### IT-OBS-13 (선택) — Prometheus scrape 실패 알람

- M-OBS-5 의 `WebhookRelayInstanceDown` 알람이 실제로 `up{job="webhook-relay-api"}=0`
  케이스에 발화하는지 통합 검증.
- Testcontainers Prometheus + worker 컨테이너 강제 종료 + 2분 대기 → API
  `/api/v1/alerts` 호출 → `WebhookRelayInstanceDown` 등장 단언.
- CI 부담이 크므로 본 마일스톤에서는 **선택**. M-OBS-5 의 IT-OBS-10 (b) 가
  rule 로드 단언으로 대체 가능.

## 4. 구현 단계 (커밋 단위)

1. **`test(obs): add failing IT-OBS-11 (cardinality guard)`**
   - §3 IT-OBS-11 작성. M-OBS-2/3 의 메트릭 wiring 이 PRD 표의 상한을 초과하지
     않는지 검증.

2. **`refactor: enforce label enum closed sets`**
   - (필요 시) M-OBS-3 단계의 라벨 enum 잠금을 다시 점검. 매직 스트링이 발견되면
     `demo/constants.ts` 로 이동.

3. **`test(obs): add IT-OBS-12 (log/metric naming consistency)`**
   - §3 IT-OBS-12 작성. 정적 검사로만 동작 — Redis 의존 없음.

4. **`(선택) test(obs): IT-OBS-13 scrape failure alert end-to-end`**
   - CI 부담을 따져 도입. 본 PLAN 의 최종 게이트는 IT-OBS-13 을 요구하지 않음.

5. **`docs(plan-phase3): mark C-MET status table as final`**
   - 본 PLAN 디렉터리 안의 `09-acceptance-gates.md` §6 C-MET 표를 갱신 (PLAN
     완료 시점 — 어느 C-MET 가 본 PLAN 내 적용되었고 어느 것이 별도 PR 위임된
     채로 남는지 최종 확정).

> **단계 5 이후 회귀 점검:** IT-OBS-11/12 + 1~2단계 IT + IT-OBS-1~10 전건 그린.

## 5. 생성/수정할 파일 목록 (절대경로)

### 생성

- `/Users/connor/biz/webhook-relay/packages/demo/test/it-obs-11-cardinality-guard.integration.test.ts`
- `/Users/connor/biz/webhook-relay/packages/demo/test/it-obs-12-log-metric-label-naming.integration.test.ts`
- (선택) `/Users/connor/biz/webhook-relay/packages/demo/test/it-obs-13-scrape-failure-alert.integration.test.ts`

### 수정

- `/Users/connor/biz/webhook-relay/docs/plan-phase3/09-acceptance-gates.md` (§6
  C-MET 표 최종 확정 — PLAN 내부 문서이므로 본 PLAN 범위 안)
- (필요 시) `/Users/connor/biz/webhook-relay/packages/demo/src/constants.ts`
  (라벨 enum 잠금 보강)

### 절대 만들지/수정하지 않는 것

- 새 의존성 도입 없음.
- `core/` 변경 없음 (이미 도메인 무관).
- PRD/architecture/CLAUDE.md/README 본문 변경 없음.

## 6. 수용 기준 / Done 정의

- [ ] IT-OBS-11 그린 — 카디널리티 메트릭당 ≤ 1000 + PRD §4.4 표 상한 준수.
- [ ] IT-OBS-12 그린 — 로그/메트릭 라벨 명명 정합 단언 통과.
- [ ] (선택) IT-OBS-13 그린.
- [ ] M-OBS-1~5 의 모든 게이트 회귀 없음.
- [ ] `09-acceptance-gates.md` §6 C-MET 표 최종 확정.
- [ ] 본 PLAN 의 최종 게이트(`09-acceptance-gates.md` §5) 통과.

## 7. PRD 역참조

- `prd-phase3/01-metrics-and-labels.md` §4 (카디널리티 예산), §9 AC3.6
  (카디널리티 가드).
- `prd-phase3/00-overview.md` §8 (구조화 로깅 계승 원칙).

## 8. 결정 의존

- 없음 — 15건 전건 Resolved.

## 9. 회귀 점검

- 1~2단계 IT-S1~S7, IT-S1b, IT-S2b, IT-S6b, IT-R1, UT-1~6 — 모두 그린.
- IT-OBS-1~10 — 모두 그린.
- IT-OBS-11/12 추가 그린.

## 10. C-MET 적용 시점

본 마일스톤은 **잔여 C-MET 정리 단계** (별도 PR 매핑 확정만):

| C-MET ID | 본 PLAN 내 적용? | 위임 PR 시점 |
|----------|-------------------|----------------|
| C-MET-1 | ❌ | PRD 갱신 — PLAN 완료 후 별도 PR |
| C-MET-2 | ✅ M-OBS-1 | IT-R1 grep 룰 보강만 코드. PRD 본문 갱신은 별도 PR |
| C-MET-3 | ❌ | architecture.md §5 갱신 — PLAN 완료 후 별도 PR |
| C-MET-4 | ❌ | prd/05 §4·§6 cross-link — 별도 PR |
| C-MET-5 | ❌ | prd/06 §6.2 표에 `/metrics` 행 — 별도 PR |
| C-MET-6 | ❌ | architecture.md §2 컴포넌트 표 — 별도 PR |
| C-MET-7 | ✅ M-OBS-1 (일부) | `.env.example` `WORKER_METRICS_PORT` 만. `METRICS_BEARER_TOKEN` 은 Q-OBS-1 (a) 결정에 따라 도입 안 함 |
| C-MET-8 | ✅ M-OBS-4 | `docker-compose.yml` worker 포트 |
| C-MET-9 | ❌ | README 빠른 시작 — 별도 PR |
| C-MET-10 | ❌ | README 운영 노트 — 별도 PR |
| C-MET-11 | ❌ | architecture.md §2 컴포넌트 표 — 별도 PR |
| C-MET-12 | ✅ M-OBS-4 | `docker/grafana/.gitkeep` 제거 |
| C-MET-13 | ❌ | architecture.md §5 SLO — 별도 PR |
| C-MET-14 | ❌ | prd/06 운영 노트 — 별도 PR |
| C-MET-15 | ❌ | README 운영 노트 — 별도 PR |
| C-MET-16 | ❌ | CLAUDE.md §3 폴더 구조 — 별도 PR |
| C-MET-17 | ❌ | prd/03-test-strategy.md IT-OBS-N — 별도 PR |

**본 PLAN 내 적용 4건 (C-MET-2, 7 일부, 8, 12), 별도 PR 위임 13건.**

> 위 표는 `09-acceptance-gates.md` §6 의 단일 출처와 동기화.

## 11. 본 마일스톤 후 데모 상태

- 본 PLAN 의 모든 기능이 완성. 1~2단계 + 3단계 IT 전건 그린.
- M-OBS-1~6 의 모든 코드 변경이 `core/` 도메인 무관 / `demo/` 도메인 의존 경계
  를 보존. IT-R1 그린 유지.
- 외부 PR 위임 13건은 사용자 결정 후 별도 PR 로 진행.
