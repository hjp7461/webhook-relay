# 10. Risks & Rollback — 가장 깨지기 쉬운 부분 + 롤백 전략 (Phase 4 Load · Measurement)

> 본 문서는 본 PLAN 을 실행하는 동안 가장 자주 어긋날 수 있는 지점과, 어긋났을
> 때 어떻게 되돌릴지를 명시한다.
>
> **AI 협업 5원칙 적용:** 본 문서는 "불확실하면 멈추고 묻는다"(원칙 4) 의 실행
> 가이드. 아래 리스크가 현실화되면 임의로 PLAN 을 확장하지 말고 사용자에게 보고
> + `00-decisions-needed.md` §3 에 새 Q-LOAD-N-PLAN-M 추가.

---

## 1. 리스크 등급 정의

| 등급 | 의미 | 대응 |
|------|------|------|
| ★★★ | 마일스톤 차단 가능성 매우 높음 | 사전 PoC 1~2시간 필요. |
| ★★☆ | 마일스톤 일정 영향 큼 | 발견 즉시 사용자에게 보고. PLAN 변경 검토. |
| ★☆☆ | 마일스톤 내 해결 가능 | 모니터링만. |

---

## 2. 핵심 리스크 목록

### R-LOAD-001 — 측정 분산 ±5% 초과 (★★★)

- **대상 마일스톤:** M-LOAD-2 ~ M-LOAD-5 전건.
- **현상:** 같은 LP-ID + 같은 cgroup 한정값 + 같은 git commit + 같은 측정 호스트
  사양에서 재측정 시 핵심 SLI (처리량 / p50 / p99 / DLQ 적재율) 가 ±5% 초과
  변동.
- **사전 신호:**
  - LP-1 baseline (M-LOAD-2) 의 재측정 분산이 이미 ±5% 초과.
  - 측정 호스트의 백그라운드 부하 (Chrome / Slack / IDE / 시스템 업데이트).
- **대응 (우선순위 순):**
  1. **Plan A (호스트 노이즈 점검):** 백그라운드 프로세스 닫기 → 재측정. 분산
     ±5% 안 회복 시 정상 진행.
  2. **Plan B (cgroup 한정값 정합 재검증):** 호스트 사양 대비 over-commit / under-allocate
     여부 확인 (`08-cross-cutting.md` §6). 한정값 조정 결정은 사용자.
  3. **Plan C (k6 RPS 분산 점검):** `k6 summary` 의 RPS achieved 값 분산이 본질적
     으로 큰지 확인. k6 시나리오의 `executor` 설정 조정 결정은 사용자.
  4. **Plan D (사용자 결정 위임):** 1~3 모두 실패 → `00-decisions-needed.md` §3
     에 새 Q-LOAD-N-PLAN-M 추가 + 사용자 결정 대기 (재측정 / 측정 환경 점검 / 결과
     폐기).
- **롤백 트리거:** Plan A/B/C 모두 1일(8시간) 내 안정화 실패.
- **롤백 동작:** 본 마일스톤의 측정 결과 보고서 commit revert + 사용자 결정 대기.

### R-LOAD-002 — k6 시나리오 RPS 분산 (★★★)

- **대상 마일스톤:** M-LOAD-2 ~ M-LOAD-5 전건.
- **현상:** k6 의 `executor: constant-arrival-rate` 가 목표 RPS 를 정확히 인가
  하지 못함. 예: 목표 R=100 인데 achieved=85 또는 achieved=115.
- **사전 신호:**
  - k6 의 `dropped_iterations` 카운터가 0 보다 큼.
  - `preAllocatedVUs` / `maxVUs` 가 부족.
- **대응:**
  1. **Plan A:** `preAllocatedVUs` 와 `maxVUs` 를 늘림. 단, cgroup `cpus` 한정값
     안에서.
  2. **Plan B:** k6 컨테이너의 `cpus` 한정값 (M-LOAD-1 기준 2.0) 을 증가. 호스트
     사양 호환성 재검증 필요.
  3. **Plan C:** 목표 RPS 를 낮춤. 단, Q-LOAD-6 (b) 잠금 안에서 — RPS 변경은 PRD
     본문 갱신 PR 필요.
- **롤백 트리거:** RPS achieved 가 목표의 ±2% (PRD `03` §3.4) 를 W_load 전체에
  걸쳐 초과.
- **롤백 동작:** 본 측정 결과 무효 → 보고서 "실패 사유" 절 명시 + 사용자 결정.

### R-LOAD-003 — Redis OOM / 워커 OOM (★★★)

- **대상 마일스톤:** M-LOAD-4 (LP-3 stress), M-LOAD-5 (N=10 측정), M-LOAD-6
  (종합 분석).
- **현상:** LP-3 (R=500, P=large 64KB) 측정 중 Redis 메모리 사용량이 cgroup
  `mem_limit=512M` 도달 → OOM killed. 또는 워커 인스턴스가 워크로드 처리 중 OOM.
- **사전 신호:**
  - `docker stats` 의 redis 컨테이너 메모리 사용률이 90% 이상.
  - `webhook_relay_redis_up` Gauge 가 0 으로 떨어짐.
  - 워커 컨테이너가 restart 되며 `up=0` 구간 발생.
- **대응:**
  1. **Plan A (측정 변수로 기록):** OOM 자체가 knee point 식별의 결과 — PRD
     `prd-phase4/04` §5 정합. 측정 결과 보고서에 "Redis OOM at t=X" 또는 "워커 OOM
     at t=Y" 명시 + bound 원인 = "메모리 bound" 로 분류.
  2. **Plan B (PLAN 중단):** OOM 이 반복 발생 → 본 마일스톤 중단 + 사용자 결정.
     cgroup `mem_limit` 증가 결정은 PRD `02` §4.2 본문 변경 PR 필요.
  3. **Plan C (사용자 결정 위임):** `00-decisions-needed.md` §3 에 새 Q-LOAD-N-PLAN-M
     추가.
- **롤백 트리거:** OOM 이 LP-3 측정의 50% 이상 구간에서 발생.
- **롤백 동작:** 본 측정 결과를 "knee point = 메모리 bound" 로 기록 → PLAN 진행
  (knee point 식별 자체가 본 마일스톤의 목표).

### R-LOAD-004 — 결과 보고서 비결정성 (★★☆)

- **대상 마일스톤:** M-LOAD-2 ~ M-LOAD-6 전건.
- **현상:** 같은 측정 입력에서 결과 보고서의 SLI 값이 달라짐. 페이로드 결정성
  패딩이 깨지거나 (난수 페이로드 누수), HMAC 서명 재현 실패, Prometheus query
  의 시점이 일치하지 않음.
- **사전 신호:**
  - HMAC 서명 헤더의 hex 값이 매 측정마다 다름.
  - `k6 summary` 의 페이로드 분포가 의도된 80/15/5 와 다름 (LP-2).
- **대응:**
  1. **Plan A (결정성 패딩 검증):** k6 시나리오 코드 리뷰 → `Math.random()` 누수
     검출. PRD `prd-phase4/01` §4.3 + I4.5 정합 강제.
  2. **Plan B (HMAC 시크릿 일관성):** `WEBHOOK_HMAC_SECRET` 환경변수가 측정 사이클
     사이 변경되지 않는지 확인.
  3. **Plan C (Prometheus time range 정합):** `t_start` / `t_end` 가 메타데이터
     에 정확히 기록되는지 확인 (`08-cross-cutting.md` §3).
- **롤백 트리거:** 결과 보고서의 SLI 값이 같은 입력에서 ±5% 초과 변동.
- **롤백 동작:** 본 측정 결과 무효 → 보고서 "실패 사유" 절 명시 + k6 시나리오
  결정성 재검증.

### R-LOAD-005 — 1~3단계 회귀 위험 (★★★)

- **대상 마일스톤:** M-LOAD-1 (k6 서비스 추가), M-LOAD-3 (stub variant 추가).
- **현상:** 본 PLAN 의 변경이 1~3단계 IT (IT-S1~S7, IT-S1b, IT-S2b, IT-S6b,
  IT-R1, IT-OBS-1~12) 또는 UT (UT-1~6 + 보강) 의 한 건이라도 빨강.
- **사전 신호:**
  - M-LOAD-1 `docker-compose.yml` 변경 후 `docker compose config` invalid 또는
    기존 5 서비스 변경 누수.
  - M-LOAD-3 `packages/demo/src/receiver/` 변경이 IT-S1 / IT-S3 / IT-S4 / IT-S5
    의 variant 미지정 동작 변경.
- **대응:**
  1. **Plan A:** 본 마일스톤의 모든 commit 을 `git revert` → 회귀 가드 그린 확인
     → 사용자 결정 대기.
  2. **Plan B (M-LOAD-1 한정):** k6 서비스 추가가 기존 5 서비스에 영향을 주지
     않도록 `profiles: ["measure"]` 분리 강화. command 플래그 변경 (prometheus
     `--web.enable-remote-write-receiver`) 이 기존 scrape 동작에 영향을 주는지
     검증.
  3. **Plan C (M-LOAD-3 한정):** variant 미지정 (= normal) 동작이 1~2단계 기본
     동작과 100% 일치하도록 분기 조건 보강.
- **롤백 트리거:** 1~3단계 IT / UT 의 1건이라도 빨강.
- **롤백 동작:** Plan A — 본 마일스톤의 모든 commit revert → 사용자에게 즉시
  보고.

### R-LOAD-006 — cgroup 한정값의 호스트 사양 호환성 (★★☆)

- **대상 마일스톤:** M-LOAD-1 (단계 6 사전 체크), M-LOAD-5 (N=5 / N=10).
- **현상:** 측정 호스트 사양이 PRD `prd-phase4/02` §4.2 의 cgroup 한정값 총합
  미달. over-commit (총합이 호스트 한계 초과) 시 cgroup 격리 의미 약화.
- **사전 신호:**
  - 측정 호스트가 ARM64 Apple Silicon 의 저사양 (M1 기본 8 코어) — N=10 측정
    (cpus 총합 15.0) 한계 초과.
  - 측정 분산이 N=5 / N=10 에서 비정상 증가.
- **대응:**
  1. **Plan A:** N=5 / N=10 측정 결과의 메타데이터에 over-commit 여부 기록 (PRD
     `prd-phase4/04` §2.3 정합).
  2. **Plan B:** N 매트릭스 축소 (예: N=1, 2, 5 만 측정, N=10 제외) — PRD
     `prd-phase4/04` §I4.19 폐쇄성 위반이므로 사용자 결정.
  3. **Plan C:** 호스트 교체 / cgroup 한정값 축소 — PRD `prd-phase4/02` §4.2 본문
     변경 PR 필요. 사용자 결정.
- **롤백 트리거:** M-LOAD-1 단계 6 사전 체크에서 호스트 사양 미달 검출.
- **롤백 동작:** M-LOAD-1 중단 + 사용자 결정 대기.

### R-LOAD-007 — Prometheus remote write 의 k6 metric 누수 (★★☆)

- **대상 마일스톤:** M-LOAD-1 (prometheus command 추가), M-LOAD-2 이후 전건.
- **현상:** k6 자체 메트릭 (`k6_http_*`) 이 Prometheus 에 누적되며 카디널리티
  증가. 3단계 IT-OBS-11 (시계열 ≤ 1000) 단언 대상에 누수되면 가드 빨강.
- **사전 신호:**
  - Prometheus `/api/v1/label/__name__/values` 응답에 `k6_*` 라벨 등장.
  - IT-OBS-11 의 시계열 수가 측정 후 1000 근처.
- **대응:**
  1. **Plan A (job label 분리 강화):** k6 메트릭이 `job=k6` 으로 분리되어 `webhook_relay_*`
     정규식 외 이므로 자연 분리 (`08-cross-cutting.md` §3). IT-OBS-11 의 단언
     대상을 `__name__=~"webhook_relay_.*"` 로 명시.
  2. **Plan B:** Prometheus 의 `metric_relabel_configs` 로 k6 메트릭을 drop —
     단, 본 변경은 PRD `prd-phase3/03` 의 prometheus 설정 변경 → 별도 PR 결정 위임.
- **롤백 트리거:** IT-OBS-11 빨강.
- **롤백 동작:** Plan A — IT-OBS-11 의 정규식 단언이 `webhook_relay_*` 만 가드
  하는지 확인. 그래도 빨강이면 Plan B 사용자 결정.

### R-LOAD-008 — LP-4 spike 의 회복 시간이 측정 윈도우 초과 (★★☆)

- **대상 마일스톤:** M-LOAD-4 (LP-4).
- **현상:** spike 종료 후 큐 길이가 W_base_2 (300s) 안에 baseline 으로 회복되지
  않음. PRD `prd-phase4/04` §6.2 T3 트리거 (knee point RPS < 운영 평균 RPS × 2)
  발동 시사.
- **사전 신호:**
  - LP-3 (R=500) 측정에서 이미 knee point 후보 식별 + bound 원인이 Redis 또는
    워커 자원 경합.
- **대응:**
  1. **Plan A (측정 변수로 기록):** 회복 시간 = "측정 윈도우 초과" 로 보고서에
     명시 → knee point 가 base RPS=100 안에 들어왔음을 PRD `prd-phase4/04` §6.2
     T3 트리거 cross-link.
  2. **Plan B:** W_base_2 를 늘려 재측정 — PRD `prd-phase4/01` §3.1 잠정 형태의
     변경은 PRD 본문 갱신 PR 필요. 사용자 결정.
- **롤백 트리거:** W_base_2 의 마지막 30초 안에서도 큐 길이가 baseline 분포 외.
- **롤백 동작:** Plan A — 본 결과를 측정 변수로 기록 → M-LOAD-6 종합 분석에서
  HA/Cluster 트리거 검토.

### R-LOAD-009 — `--scale worker=N` 의 호스트 포트 충돌 (★☆☆)

- **대상 마일스톤:** M-LOAD-5 (N=2 / 5 / 10).
- **현상:** docker-compose 의 worker 서비스가 `ports: "3001:3001"` 매핑이라 첫
  인스턴스만 호스트 3001 에 매핑. N≥2 시 추가 인스턴스는 동적 포트 폴백.
- **사전 신호:** PRD `prd-phase4/04` §R4.18 가 이미 명시 — Prometheus scrape 는
  컨테이너 network 로 영향 없음.
- **대응:**
  - Prometheus targets 가 `worker:3001` 컨테이너 network 이름으로 N 인스턴스 모두
    `up=1` 인지 확인.
- **롤백 트리거:** Prometheus targets `up=0` 구간이 W_load 안에 존재 (`08-cross-cutting.md`
  §3).
- **롤백 동작:** 본 측정 결과 무효 + 사용자 결정 (docker-compose ports 매핑 조정
  은 별도 PR).

### R-LOAD-010 — SLO 임계 갱신 PR 의 글자 단위 정합 위반 (★★☆)

- **대상 마일스톤:** M-LOAD-6 (단계 3 별도 commit 시리즈).
- **현상:** 단계 3 의 실제 PR 이 `prd-phase3/04` §3.1 의 임계 숫자 외 항목을 변경.
  SLI PromQL 형태 / 측정 윈도우 / burn rate / 알람 YAML 구조 변경 누수.
- **사전 신호:**
  - PR diff 에 SLI PromQL 의 `rate(...[5m])` 변경.
  - PR diff 에 burn rate `14.4` 또는 `6` 값 변경.
- **대응:**
  1. **Plan A:** PR 리뷰에서 거부 → 단계 3 의 commit revert → M-LOAD-6 §11 의
     template 와 글자 단위 정합 재확인.
  2. **Plan B (사용자 결정 위임):** SLI PromQL / burn rate / 알람 YAML 구조의
     변경이 필요해지면 3단계 PRD 본문 갱신 PR 우선 — `prd-phase3/04` 의 I6.1 /
     I6.2 / I3.1 / I3.2 잠금 보존.
- **롤백 트리거:** 3단계 IT-OBS-10 / IT-OBS-11 빨강.
- **롤백 동작:** 단계 3 의 commit revert → 사용자에게 즉시 보고.

---

## 3. 마일스톤별 리스크 표

| 마일스톤 | 주요 리스크 |
|---------|-------------|
| M-LOAD-1 | R-LOAD-005 (★★★) 1~3단계 회귀, R-LOAD-006 (★★☆) cgroup 호환성, R-LOAD-007 (★★☆) Prometheus remote write |
| M-LOAD-2 | R-LOAD-001 (★★★) 측정 분산, R-LOAD-002 (★★★) k6 RPS 분산, R-LOAD-004 (★★☆) 결과 보고서 비결정성 |
| M-LOAD-3 | R-LOAD-001, R-LOAD-002, R-LOAD-004, R-LOAD-005 (★★★) 1~3단계 회귀 (stub variant) |
| M-LOAD-4 | R-LOAD-001, R-LOAD-002, R-LOAD-003 (★★★) OOM, R-LOAD-008 (★★☆) LP-4 회복 시간 |
| M-LOAD-5 | R-LOAD-001, R-LOAD-003, R-LOAD-006 (★★☆) cgroup × N, R-LOAD-009 (★☆☆) 호스트 포트 충돌 |
| M-LOAD-6 | R-LOAD-003 (종합 분석), R-LOAD-010 (★★☆) SLO PR 정합 위반 |

---

## 4. PLAN 자체에 변경이 필요할 때 (보고 절차)

본 PLAN 실행 중 다음 상황이 발견되면 임의로 PLAN/PRD 를 갱신하지 말고 사용자에
게 보고한다 (자율 일탈 사전 승인 규칙).

1. **PRD 모순 발견:** PRD `prd-phase4/00~05.md` 의 §AC / §I / §F 가 서로 모순 —
   본 PLAN 진행 전 사용자 결정.
2. **결정 누락 발견:** 본 PLAN 실행 중 새 결정이 필요 — `00-decisions-needed.md`
   §3 에 새 Q-LOAD-N-PLAN-M 행 추가 + 사용자 결정 대기.
3. **1~3단계 회귀:** IT-S1~S7, IT-S1b, IT-S2b, IT-S6b, IT-R1, IT-OBS-1~12, UT-1~6
   + 보강 중 1건이라도 빨강 → 본 PLAN 진행 즉시 중단 → 회귀 원인 분석 → 사용자
   보고.
4. **카디널리티 폭주:** IT-OBS-11 단언이 빨강 (k6 메트릭 누수 또는 라벨 enum
   침범) → 즉시 보고.
5. **새 의존성 요구:** `grafana/k6` Docker 이미지 외 새 의존성이 필요해 보이는
   상황 → 사용자 보고 + CLAUDE.md §2 정합 확인.
6. **N 매트릭스 미세화 요구:** knee point 정밀 식별을 위한 N=3/4/6/7/8 등 미세
   매트릭스가 필요해지면 사용자 결정 (`00-decisions-needed.md` §3 후보 4번
   정합).

---

## 5. 롤백 일반 전략

본 PLAN 의 모든 마일스톤은 **순차적/원자적 commit** 으로 진행되므로, 특정 마일스
톤이 빨강일 때:

1. 해당 마일스톤의 모든 commit 을 `git revert`.
2. 이전 마일스톤의 게이트 (`09-acceptance-gates.md` §1~6) 로 되돌아가 그린 확인.
3. 문제 원인 분석 → 본 문서 §2 의 Plan A/B/C 적용 또는 `00-decisions-needed.md`
   §3 에 새 Q-LOAD-N-PLAN-M 결정.
4. 사용자 승인 후 재시도.

**금지 사항:**

- 1~3단계 코드를 변경하여 회귀를 "숨기지" 않음. 모든 회귀는 사용자에게 보고.
- `core` 도메인 격리를 "예외 추가" 로 회피하지 않음 (IT-R1 의 BANNED 세트 임의
  축소 금지).
- 카디널리티 폭주 시 라벨 enum 을 임의로 늘리지 않음 — PRD `prd-phase3/01`
  §4.2 / §4.4 표 갱신은 별도 결정.
- 측정 분산 ±5% 초과를 "정상 변동" 으로 해석하지 않음 — PRD `prd-phase4/02`
  §7.2 의 무효 조건 강제.
- SLO 임계 갱신 PR 의 SLI PromQL / 측정 윈도우 / burn rate / 알람 YAML 구조 변경
  금지 — M-LOAD-6 §11 template 글자 단위 정합 강제.

---

## 6. 측정 환경 외 변경의 회귀 위험 (M-LOAD-1 단계 1~2 한정 가드)

본 PLAN 의 `docker-compose.yml` 변경은 다음 두 항목만:

1. **단계 1:** k6 서비스 추가 + `profiles: ["measure"]` 분리.
2. **단계 2:** prometheus 서비스 command 에 `--web.enable-remote-write-receiver`
   추가.

위 두 변경이 기존 5 서비스 (redis / api / worker / prometheus / grafana) 에
영향을 주지 않음을 가드:

- 일반 `docker compose up` 으로 5 서비스 정상 기동 (k6 비실행).
- 1~3단계 IT-OBS-7 (provisioning YAML 단언) / IT-OBS-8 (대시보드 UID) / IT-OBS-9
  (셧다운 진행 중 `/metrics` 200) 그대로 그린.
- 3단계 알람 규칙 그대로 그린 (M-LOAD-6 단계 3 의 별도 commit 시리즈가 임계 숫자
  만 갱신).

위반 시 → R-LOAD-005 (1~3단계 회귀) 발동 → 본 문서 §2 Plan A 적용.

---

## 7. SLO 임계 갱신 PR 의 롤백 경계 (M-LOAD-6 단계 3 한정)

본 PLAN closeout 후 단계 3 의 별도 commit 시리즈가 잘못된 임계를 도입할 경우:

### 잘못된 임계의 정의

- 실측 p99 × 1.5 가 3단계 잠정 임계보다 **느슨한** 경우 (예: 실측 p99=0.3s →
  갱신 p99=0.45s. 3단계 잠정 p99=0.5s 보다 엄격이라 정상). 본 PRD `prd-phase4/03`
  §4.4 의 예시 표 정합.
- 실측 p99 × 1.5 가 3단계 잠정 임계보다 **엄격한** 경우 (예: 실측 p99=2s →
  갱신 p99=3s. 3단계 잠정 p99=5s 보다 엄격). 본 PRD 의 의도된 동작 — 실측 기반
  재조정.
- **잘못된 임계:** 실측 p99 × 1.5 가 운영 변동을 흡수하지 못해 알람 false positive
  급증.

### 롤백 절차

- 단계 3 의 commit revert → 3단계 잠정값 복원 → 사용자 결정 대기.
- 재측정 결과로 본 PRD `prd-phase4/03` §4 의 옵션 (b) p99 + 3σ 또는 (d) p99 × 2.0
  으로 변경 결정은 PRD 본문 갱신 PR 필요. 사용자 결정.

### 알람 false positive 정량 측정

- 갱신 후 1주 운영 데이터로 알람 발화율 변동 측정 → false positive 증가가 ≥ 10%
  면 롤백 결정 (사용자).

---

## 8. 결정 자리 cross-link

본 문서의 모든 리스크의 사용자 결정 위임은 `00-decisions-needed.md` §3 의 새
Q-LOAD-N-PLAN-M 행으로 추적. 발생 시점에 본 문서 §2 의 해당 R-LOAD-N 의 Plan D
또는 사용자 결정 대기 라인이 cross-link.

본 PLAN 진입 시점의 결정 대기: **0건** (`00-decisions-needed.md` §1 정합).
