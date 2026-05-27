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

## 🔴 사전 잠금 필수 (5건)

### Q-LOAD-1 — 측정 도구 결정

**Status:** Open

**선택지:**

- **(a) k6 (Grafana Labs, JS):** 시나리오를 JS 로 작성. Prometheus output 플러그인 내장. CLI + Docker 둘 다 지원. 본 저장소가 이미 Grafana 스택이라 톤 일치.
- **(b) Artillery (Node.js):** YAML 시나리오 + 플러그인. Node 생태계 친화. Prometheus output 은 플러그인.
- **(c) Vegeta (Go):** 텍스트 기반 attack list + CLI 파이프. Prometheus output 은 별도 도구. 가장 가벼움.
- **(d) 직접 구현 (`packages/load-tests/` 신규 패키지):** 본 저장소의 BullMQ producer 헬퍼 재사용. 새 의존성 0 건. 측정 출력은 직접 작성.

**트레이드오프:**

- (a) 가장 강력하나 새 Docker 이미지 + JS DSL 학습. 본 저장소 톤(타입 안전, Zod 경계) 과 거리.
- (b) Node 친화이나 시나리오 표현력 < k6.
- (c) 가볍지만 본 저장소가 사용하지 않는 Go 도구 + Prometheus 통합 별도 작업.
- (d) "프로덕션급 작업 큐를 검증된 라이브러리 위에서 조립하는 판단력" 어필 포인트와 정합. 다만 측정 도구의 신뢰성 자체를 우리가 책임져야 함.

**갱신 영향:** `02-measurement-tools-and-environment.md` 본문 + `package.json`/CLAUDE.md §2 기술 스택 표.

---

### Q-LOAD-2 — 측정 환경 토폴로지

**Status:** Open

**선택지:**

- **(a) 로컬 단일 머신:** `docker compose up` 로 redis + api + worker + prometheus + grafana 동일 호스트. 가장 단순, CI 호환. 단, 측정 머신 자체의 노이즈가 결과에 섞임.
- **(b) 로컬 + 측정 격리:** docker network 분리 + cgroup CPU/메모리 한정. 격리 강화이나 설정 복잡도 증가.
- **(c) CI 환경 (GitHub Actions):** Linux runner 에서 정량 측정. 재현성 강이나 runner 사양이 일정하지 않아 결과 분산.
- **(d) 별도 측정 환경 (예: AWS EC2 1대):** 비용 발생. 사용자 결정 시 본 PRD 가 명세하나 구현은 본 PRD 범위 밖일 수 있음.

**갱신 영향:** `02-measurement-tools-and-environment.md` §토폴로지 / `04-horizontal-scaling.md` §실행 환경.

---

### Q-LOAD-3 — 본 단계 산출물 범위

**Status:** Open

**선택지:**

- **(a) PRD 묶음만:** 3단계와 동일 패턴. PRD 5건(00~05) 작성 → 별도 commit 시리즈로 PLAN(`docs/plan-phase4/`) 작성 → 별도 commit 시리즈로 구현. 결정 분리 명확.
- **(b) PRD + PLAN 묶음 (구현 별도):** PRD 와 PLAN 을 한 단위로 다룸. 구현(부하 스크립트, 측정 자동화)은 별도. 진입 마찰 감소.
- **(c) PRD + PLAN + 구현 한 묶음:** 본 단계에서 전체 closeout. 가장 큰 작업, 1회성.

**갱신 영향:** 본 세션 작업 범위 + 후속 세션 진입 패턴.

---

### Q-LOAD-4 — Redis 단일 인스턴스 한계 식별 vs Cluster 도입

**Status:** Open

**선택지:**

- **(a) 단일 인스턴스 한계만 식별 (권장):** Redis 단일 인스턴스로 처리량/지연이 어떤 N(워커 수) 또는 RPS 부근에서 꺾이는지 측정. HA / Cluster 도입은 별도 PRD 위임. 본 저장소가 "단독 개발 + 데모" 패턴이므로 보수적.
- **(b) Redis Cluster 도입 + 측정:** 본 PRD 가 Cluster 토폴로지를 명세. `docker-compose.yml` 에 Cluster 노드 3+ 추가. 운영 복잡도 증가.

**갱신 영향:** `04-horizontal-scaling.md` §Redis 토폴로지 / `docker-compose.yml`.

---

### Q-LOAD-5 — 본 PRD 가 1~2단계 IT-S6 (워커 강제 종료) 의 부하 변형을 다룰지

**Status:** Open

**선택지:**

- **(a) 정적 부하만 (권장):** 지속적 부하 하에서 SLO 측정만. 워커 강제 종료 같은 카오스 시나리오는 본 PRD 범위 밖 (별도 카오스 엔지니어링 PRD).
- **(b) 부하 + 카오스 시나리오:** 부하 진행 중 워커 강제 종료 → stalled recovery 가 SLO 안에서 동작하는지 측정. 의미 있는 검증이나 PRD 범위 + 측정 도구 부담 증가.

**갱신 영향:** `01-load-profiles.md` §시나리오 카탈로그 + `04-horizontal-scaling.md` §회복 측정.

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
