# PLAN Index — Phase 3 (Observability)

이 디렉터리는 본 저장소의 **3단계 범위 — 관측성(Observability)** 에 대한 **실행 가능한
구현 계획(PLAN)** 묶음이다. PLAN 문서는 PRD(`docs/prd-phase3/`)를 마일스톤 ·
테스트 우선 시퀀스 · 수용 기준으로 번역한다.

> **단일 소스 오브 트루스 우선순위:**
> 1. [`CLAUDE.md`](../../CLAUDE.md) — 최우선
> 2. [`docs/plan/00-decisions-needed.md`](../plan/00-decisions-needed.md) — 1~2단계 Resolved 21건 (본 PLAN이 침범하지 않음)
> 3. [`docs/prd-phase3/`](../prd-phase3/) — 본 PLAN이 충실히 이행
> 4. [`docs/plan-phase3/00-decisions-needed.md`](./00-decisions-needed.md) — 3단계 Q-OBS-1~15 (전건 Resolved)
> 5. 1~2단계 PLAN(`docs/plan/`) — 형식 일관성 참조
>
> PLAN이 PRD/CLAUDE.md와 충돌하면 PRD/CLAUDE.md가 우선한다. 본 PLAN은 그 규칙
> 안에서만 실행 시퀀스를 정한다.

> **구현 착수 조건:** **(a)** 본 PLAN 묶음이 사람에게 승인되고 **(b)** [`00-decisions-needed.md`](./00-decisions-needed.md)의
> 15건 Q-OBS가 모두 Resolved 상태 — **이미 2026-05-27 일괄 잠금 완료**. PLAN
> 문서 단계에서는 `packages/**`, `docker/**`, `docker-compose.yml`, `.github/`,
> `CLAUDE.md`, `README.md`, `docs/prd/`, `docs/plan/`, `docs/adr/`, `docs/architecture.md`,
> `docs/prd-phase3/00~04.md` 어디에도 코드를 작성하지 않는다(예외는 본 작업
> 명세의 §6: `docs/prd-phase3/05`의 헤더 보강 1건).

---

## 본 PLAN의 범위 한 줄 요약

> **3단계 PRD(`docs/prd-phase3/`)가 정의한 메트릭 카탈로그 / `/metrics` 엔드포인트
> / Grafana 대시보드 / SLO·알람 규칙을 6개 마일스톤(M-OBS-1~6)으로 분해해, **각
> 마일스톤이 끝나는 시점마다 1~2단계 7개 IT 시나리오 + IT-R1 회귀가 그린**이고
> 데모가 동작하도록 한다. 4단계(부하/측정/수평 확장)와 부록 트랙은 본 PLAN
> 어디에서도 다루지 않는다.**

---

## 읽는 순서

| # | 파일 | 한 줄 설명 |
|---|------|------------|
| 00 | [`00-decisions-needed.md`](./00-decisions-needed.md) | **15건 Q-OBS 전건 Resolved (2026-05-27 일괄 채택)**. 마일스톤별 의존 매트릭스 포함. |
| 01 | [`01-milestones.md`](./01-milestones.md) | M-OBS-1~6 한 줄 요약, Exit Criteria, ASCII 의존 그래프, 1~2단계 M1~M7과의 격리 확인. |
| 02 | [`02-m-obs-1-bootstrap.md`](./02-m-obs-1-bootstrap.md) | M-OBS-1: prom-client 도입 + `core/metrics.ts` 인터페이스 진화 + IT-R1 grep 룰 보강(C-MET-2) + worker `/metrics` HTTP 서버 골격. |
| 03 | [`03-m-obs-2-core-metrics.md`](./03-m-obs-2-core-metrics.md) | M-OBS-2: 도메인 무관 메트릭(C1~C11) wiring + `/metrics` 라우트 + IT-OBS-1~3. |
| 04 | [`04-m-obs-3-demo-metrics.md`](./04-m-obs-3-demo-metrics.md) | M-OBS-3: 도메인 메트릭(D1~D3, W1~W4) wiring + IT-OBS-4~6 (IT 시나리오 ↔ 메트릭 매트릭스 단언). |
| 05 | [`05-m-obs-4-grafana.md`](./05-m-obs-4-grafana.md) | M-OBS-4: Grafana provisioning + 4개 대시보드 JSON + `docker-compose.yml` Grafana/Prometheus 서비스 추가 + IT-OBS-7~9. |
| 06 | [`06-m-obs-5-slo-alerts.md`](./06-m-obs-5-slo-alerts.md) | M-OBS-5: SLO 4종 + Prometheus alerting rule YAML 4종 + `promtool check rules` 통과 + IT-OBS-10. |
| 07 | [`07-m-obs-6-refinement.md`](./07-m-obs-6-refinement.md) | M-OBS-6: 카디널리티 가드 통합 테스트 + 로그/메트릭 라벨 정합 + scrape 실패 알람 + 잔여 C-MET 정리. (선택 — 최소 범위로 축소 가능) |
| 08 | [`08-cross-cutting.md`](./08-cross-cutting.md) | 횡단 관심사: 카디널리티 통제, Counter 리셋 ↔ PromQL `rate()` 안전성, prom-client Registry 단일성, IT-R1 보강 정책. |
| 09 | [`09-acceptance-gates.md`](./09-acceptance-gates.md) | 마일스톤별 Exit Gate 체크리스트(공통/마일스톤별/최종). |
| 10 | [`10-risks-and-rollback.md`](./10-risks-and-rollback.md) | IT-R1 회귀, 카디널리티 폭주, Grafana provisioning idempotency, prom-client 직렬화 비용 등 깨지기 쉬운 지점과 롤백. |

---

## 구현 착수 전 결정 필요 항목 (한 줄 안내)

- 총 **15건**(PRD `docs/prd-phase3/05` §2 그대로). 분포: 엔드포인트/인증 3,
  대시보드/인프라 2, 라벨/카디널리티 3, 메트릭 형태 2, SLO/알람 3, 운영/추적성 2.
- **전건 Resolved (2026-05-27 — provisional default 일괄 채택)**. 사용자가
  명시적으로 "기본값으로 진행" 결정. 임의 결정 위반이 아님.
- 자세한 마일스톤별 의존 매트릭스는 [`00-decisions-needed.md`](./00-decisions-needed.md) §3 참조.

---

## 마일스톤 한 줄 시퀀스

```
M-OBS-1 Bootstrap → M-OBS-2 Core Metrics → M-OBS-3 Demo Metrics → M-OBS-4 Grafana → M-OBS-5 SLO+Alerts → M-OBS-6 Refinement
```

각 마일스톤은 끝나는 시점에 **데모가 동작 가능한 상태**(CLAUDE.md §6).
M-OBS-1만 예외 — 라우트 골격만 추가하므로 빌드/테스트 그린 + 빈 `/metrics`
응답이 동작 가능 상태에 해당.

---

## AI 협업 5원칙 (CLAUDE.md §7) 본 PLAN 적용 요약

| 원칙 | 본 PLAN의 적용 |
|------|----------------|
| (1) 설계는 사람이 먼저 | 메트릭 카탈로그 · 라벨 enum · SLO 임계값은 PRD가 잠근 단일 소스. PLAN은 그것을 그대로 옮길 뿐. |
| (2) 테스트 우선 | M-OBS-2~5의 1단계는 "실패하는 테스트 작성"(IT-OBS-N). 구현은 그 테스트를 통과시키는 방향으로만 좁아진다. |
| (3) 범위 통제 | 4단계, 부록 트랙은 어떤 PLAN 문서에서도 다루지 않는다. PRD `prd-phase3/05` §1 비범위와 동일. |
| (4) 불확실하면 묻기 | `00-decisions-needed.md`에 15건 결정 보류 → 2026-05-27 사용자 일괄 잠금. 본 PLAN 실행 중 새 결정이 필요해지면 같은 파일에 새 Q-OBS-# 행 추가, 임의 결정 금지. |
| (5) 위반 코드 발견 시 보고 | `10-risks-and-rollback.md` §5에 보고 절차 명시. |

---

## 본 PLAN의 범위 밖 (명시적 거부)

- 4단계 — 부하/측정/수평 확장. PRD `prd-phase3/05` §1.1과 동일. SLO 임계값
  재조정은 4단계 PRD에서 수행.
- 부록 트랙 — `packages/streams-internals/`. PRD `prd-phase3/05` §1.2와 동일.
  본 PLAN에서 임포트/참조/문서 인용 금지.
- 알람 라우팅 / 온콜 / 인시던트 프로세스. PRD `prd-phase3/05` §1.3과 동일.
  본 PLAN은 알람 규칙 YAML까지만.
- 멀티-Prometheus federation / long-term storage / 분산 추적 / 로그 집계.
- PRD/CLAUDE.md/README.md 수정. PLAN은 PRD를 번역할 뿐, PRD를 갱신하지 않는다.
  PRD 변경 제안 17건(C-MET-1~17)은 본 PLAN이 명시적으로 적용하는 것과 별도
  PR로 사용자가 결정 위임하는 것을 [`09-acceptance-gates.md`](./09-acceptance-gates.md)
  §6 표에 분류해 둔다.

---

## 본 PLAN의 회귀 보장 약속

- **모든 마일스톤의 §9 "회귀 점검"에 다음을 포함:** IT-S1~S7, IT-S1b, IT-S2b,
  IT-S6b, IT-R1, UT-1~6 전건 그린 유지.
- **IT-R1 보강:** 본 PLAN의 M-OBS-1에서 `webhook_relay_` 접두를 도메인 식별자
  grep의 예외로 처리하는 보강을 도입한다(C-MET-2 사전 이행). 이 보강은 IT-R1
  의 의도(`core`에 도메인 누수 0건)는 그대로 유지하면서, prom-client 컨벤션의
  애플리케이션 식별자 접두만 예외 처리한다.
- **데모 동작 보장:** M-OBS-2 이후 모든 마일스톤 종료 시점에 1~2단계 데모(`docker
  compose up` → `curl POST /webhooks`)가 그대로 동작.

---

## PLAN 자체에 변경이 필요할 때

- 모순/누락 발견 시: [`10-risks-and-rollback.md`](./10-risks-and-rollback.md) §5
  절차에 따른다.
- PRD 변경 제안: 각 마일스톤 문서의 "C-MET 적용 시점" 섹션과 [`09-acceptance-gates.md`](./09-acceptance-gates.md)
  §6 표에 기록. PRD 직접 수정은 별도 PR.

---

## 다음 단계 (사람의 액션 아이템)

1. [`00-decisions-needed.md`](./00-decisions-needed.md) 검토 — 15건 Resolved 확인.
2. [`01-milestones.md`](./01-milestones.md) 의존 그래프 검토 (1~2단계 M1~M7과
   격리되어 있음 확인).
3. M-OBS-1부터 순차 실행. 각 마일스톤은 [`09-acceptance-gates.md`](./09-acceptance-gates.md)
   의 Exit Gate를 통과한 뒤에만 다음으로 진행.
4. 모든 마일스톤 통과 후 §9 "PLAN 전체의 최종 게이트"를 사람이 검증.
5. 본 PLAN 완료 후 C-MET-3, C-MET-13(architecture.md §5 "보장한다" 갱신) 등
   "PLAN 완료 후" 항목을 별도 PR로 사용자가 결정.
