# 00. Decisions Needed — 4단계 PRD 작성 진입 전 잠금 대기 (Open Questions Register)

> 본 문서는 PRD `prd-phase4/` 의 어느 파일도 작성하기 전에 **사용자가 잠금해야
> 하는 결정** 을 단일 출처로 추적합니다. 1~2단계 (21건 Resolved) · 3단계 (15건
> Resolved) 의 패턴과 동일하게 운영합니다 — 자율 일탈 사전 승인 규칙 정합.

> **운영 규칙:** Status 가 `Open` 인 항목이 1건이라도 남아 있으면 본 PRD 의 어느
> 세부 파일도 작성하지 않습니다. 본 문서에서 모든 항목이 `Resolved` 가 된 시점에
> `01-load-profiles.md` 부터 순차 작성을 시작합니다.

---

## 결정 우선순위 분류

- **🔴 사전 잠금 필수 (Pre-PRD):** PRD 작성 자체의 페르소나/도구/환경/산출물
  형태에 영향. 본 문서가 잠그지 않으면 PRD 본문이 옵션 분기로 채워져 단일 출처
  원칙이 깨진다.
- **🟡 PRD 본문에서 옵션 정리 + 결정 위임 (In-PRD):** PRD 본문이 옵션과 트레이드오프를
  정리한 뒤 사용자가 잠금. 본 문서에는 Q-ID 만 추적.

---

## 🔴 사전 잠금 필수 (5건, 전건 Resolved 2026-05-27)

### Q-LOAD-1 — 측정 도구 결정

**Status:** ✅ Resolved (2026-05-27)

**결정:** **(a) k6 (Grafana Labs, JS)**.

**근거:** 본 저장소가 이미 Grafana 스택을 운영하므로 톤 일치. Prometheus output
내장으로 measurement → metrics → dashboard 의 자연스러운 파이프라인. 시나리오
표현력이 가장 강력하고 커뮤니티 자료 풍부.

**갱신 영향 (잠금):** `02-measurement-tools-and-environment.md` 가 k6 선택 근거 +
docker-compose 의 `k6` 서비스 추가 명세를 잠금. 새 Docker 이미지(`grafana/k6`)는
CLAUDE.md §2 "Docker Compose" 항목 안이라 정합.

**위 외 선택지:** (b) Artillery (탈락 — 시나리오 표현력 < k6), (c) Vegeta (탈락 —
Go 도구, 저장소 스택과 분리), (d) 직접 구현 (탈락 — 측정 도구 신뢰성 책임이 부담).

---

### Q-LOAD-2 — 측정 환경 토폴로지

**Status:** ✅ Resolved (2026-05-27)

**결정:** **(b) 로컬 + cgroup 격리**.

**근거:** 단일 호스트의 노이즈를 cgroup CPU/메모리 한정으로 격리해 재현성을
높인다. CI 환경(c) 의 runner 사양 분산 위험을 피하면서도 별도 측정 환경(d) 의
비용을 회피. 본 저장소가 단독 개발 + 데모 패턴이므로 "최대한 단순하나 측정
신뢰성이 정량적으로 보존되는" 토폴로지.

**갱신 영향 (잠금):** `02-measurement-tools-and-environment.md` §토폴로지 +
`04-horizontal-scaling.md` §실행 환경 이 docker `cpus` / `mem_limit` 한정값을
잠금. 결과 표에 측정 호스트의 CPU/메모리 사양을 메타데이터로 기록 의무.

**위 외 선택지:** (a) 격리 없음(탈락 — 재현성 약함), (c) CI(탈락 — 분산), (d)
별도 환경(탈락 — 비용).

---

### Q-LOAD-3 — 본 단계 산출물 범위

**Status:** ✅ Resolved (2026-05-27)

**결정:** **(a) PRD 묶음만**.

**근거:** 1~3단계와 동일 패턴(PRD → PLAN → 구현 commit 시리즈). 결정 분리가
명확해 후속 세션이 어느 단계에 있는지 진입 시점에 즉시 판단 가능. 한 묶음에
PRD + PLAN + 구현이 섞이면 자율 일탈 위험이 커진다(자율 일탈 사전 승인 규칙
정합).

**갱신 영향 (잠금):** 본 PRD 묶음(`docs/prd-phase4/`) 은 PRD 파일 6건(README +
00~05) 만. PLAN 묶음(`docs/plan-phase4/`) + 구현(예: `packages/load-tests/` 또는
`docker/k6/`)은 본 PRD 승인 후 별도 세션. 본 세션은 PRD closeout 까지.

**위 외 선택지:** (b) PRD + PLAN 합본(탈락 — 결정 분리 약화), (c) 한 묶음(탈락 —
세션 부담 + 단일 출처 원칙 약화).

---

### Q-LOAD-4 — Redis 단일 인스턴스 한계 식별 vs Cluster 도입

**Status:** ✅ Resolved (2026-05-27)

**결정:** **(a) 단일 인스턴스 한계만 식별**.

**근거:** 본 저장소가 단독 개발 + 데모 패턴이며, 1~2단계 PRD 가 "단일 Redis
인스턴스 + 데모/로컬 전제" 를 명시 잠금. Cluster 도입은 별도 운영 PRD 책임. 본
PRD 는 단일 인스턴스로 처리량/지연이 어떤 N(워커) 또는 RPS 부근에서 꺾이는지
**식별** 만 한다(임계 발견 → 운영 PR 트리거).

**갱신 영향 (잠금):** `04-horizontal-scaling.md` §Redis 토폴로지 가 단일 인스턴스
명세 + "knee point 식별" 측정 절차 잠금. `docker-compose.yml` 변경 없음. HA/Cluster
도입의 트리거 조건(예: RPS X 부근에서 p99 가 SLO 위반) 만 명문화.

**위 외 선택지:** (b) Cluster 도입(탈락 — 운영 복잡도 + 1~2단계 PRD 전제 갱신
필요).

---

### Q-LOAD-5 — 본 PRD 가 1~2단계 IT-S6 (워커 강제 종료) 의 부하 변형을 다룰지

**Status:** ✅ Resolved (2026-05-27)

**결정:** **(a) 정적 부하만**.

**근거:** 부하 측정의 신뢰성과 카오스 시나리오의 신뢰성은 서로 다른 책임이며,
한 PRD 에서 합치면 양쪽 신뢰성이 약화된다. 1~2단계 IT-S6/S6b 가 이미 카오스
회복을 단언하므로(stalled recovery + stalled-loss recovery), 본 PRD 는 지속 부하
하에서 SLO 가 잠금된 임계 안에 머무는지만 측정. 카오스 + 부하 결합은 별도 카오스
엔지니어링 PRD 위임.

**갱신 영향 (잠금):** `01-load-profiles.md` §시나리오 카탈로그 가 정적 부하 프로필
(LP-N) 만 정의. 카오스/실패 시뮬레이션은 비목표(README §비목표 추가).

**위 외 선택지:** (b) 부하 + 카오스(탈락 — 책임 분리 약화 + 측정 도구 부담 증가).

---

## 🟡 PRD 본문에서 옵션 정리 + 결정 위임 (8건, Q-ID 추적만)

본 항목들은 PRD 본문이 옵션과 트레이드오프를 정리한 뒤 사용자가 잠금. 본 문서는
ID 와 결정 대상 PRD 위치만 추적한다.

| Q-ID | 결정 대상 | PRD 위치 (예정) |
|------|-----------|------------------|
| Q-LOAD-6 | 부하 프로필 RPS 등급 (낮음 / 중간 / 높음 / 스파이크) 의 정확한 숫자 | `01-load-profiles.md` §3 |
| Q-LOAD-7 | 페이로드 크기 분포 (예: 1KB / 16KB / 64KB) 와 비율 | `01-load-profiles.md` §4 |
| Q-LOAD-8 | 측정 윈도우 (5분 정상 부하 + 30초 스파이크 등) | `01-load-profiles.md` §5 |
| Q-LOAD-9 | SLO 임계 갱신 규칙 (실측 p99 의 1.5× / 2× 등) | `03-targets-and-rebaseline.md` §4 |
| Q-LOAD-10 | 처리량 선형성 허용 오차 (워커 N 의 함수 형태) | `04-horizontal-scaling.md` §3 |
| Q-LOAD-11 | 본 PRD 가 정의할 "수평 확장 SLO" 의 정확한 형태 (예: 처리량(N) ≥ 처리량(1) × N × 0.8) | `04-horizontal-scaling.md` §4 |
| Q-LOAD-12 | 결과 결과 보존 형식 (Markdown 표 / CSV / Grafana 대시보드 자동 생성) | `02-measurement-tools-and-environment.md` §6 |
| Q-LOAD-13 | 회귀 가드 — 부하 결과의 일부를 IT-LOAD-N 통합 테스트로 잠글지 (CI 시간 부담 vs 회귀 감지) | `02-measurement-tools-and-environment.md` §8 |

---

## 작성 워크플로우

1. 사용자가 본 문서의 🔴 5건 (Q-LOAD-1~5) 을 모두 잠근다.
2. 본 PRD 의 `01-load-profiles.md` ~ `05-out-of-scope-and-open-questions.md` 를 순서대로 작성한다(각 파일 = 1 commit 권장, 본 저장소 단독 개발 + main 직접 작업 + push 패턴).
3. 각 PRD 파일이 🟡 Q-LOAD-6~13 의 해당 항목을 옵션 정리. 사용자가 인라인으로 잠근다.
4. 모든 항목이 Resolved 된 시점에 PLAN 묶음(`docs/plan-phase4/`) 작성 진입 가능.

---

## 출처 / 참조

- 1~2단계 결정 잠금 — [`docs/plan/00-decisions-needed.md`](../plan/00-decisions-needed.md) (21건 Resolved)
- 3단계 결정 잠금 — [`docs/plan-phase3/00-decisions-needed.md`](../plan-phase3/00-decisions-needed.md) (15건 Resolved)
- 3단계 SLO 잠정값 — `prd-phase3/04` §3.1 (Q-OBS-11 에 의해 "잠정" 으로 잠금)
- 3단계 IT-OBS 시나리오 — `prd-phase3/01` §5 매트릭스 + `prd/03` §5.1 cross-link
