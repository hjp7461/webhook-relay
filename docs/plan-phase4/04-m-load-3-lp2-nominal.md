# 04. M-LOAD-3 — LP-2 nominal sustained (R=100 RPS · P=80/15/5 · W=~32분 + IT-S 변형)

> **PLAN 진입 조건:** M-LOAD-2 완료 — LP-1 baseline 결과 보고서 commit + 측정
> 분산 ±5% 안 확인. PRD Q-LOAD-1~13 전건 Resolved. 1~3단계 IT + UT 전건 그린.
>
> **AI 협업 5원칙 적용:** 본 마일스톤은 **운영 기대 부하 영역(nominal)** 에서 SLO
> 잠정값(99.5% / 0.5s / 5s / 1%) 이 검증되어야 할 분포를 확보한다 (PRD `prd-phase4/03`
> §4 SLO 재조정 규칙의 기초 분포). IT-S3 / IT-S4 / IT-S5 의 부하 변형은 PRD
> `prd-phase4/01` §6 매핑표가 단일 출처이며, stub 응답을 명세대로 구성한다(원칙 1
> 설계 잠금).
>
> **본 마일스톤이 명시적으로 다루지 않는 것:** LP-3 stress / LP-4 spike 시나리오
> (M-LOAD-4 책임), 수평 확장 N 매트릭스(M-LOAD-5 책임), Redis knee point 식별
> (M-LOAD-6 책임), IT-S2 / IT-S6 / IT-S7 의 부하 변형(Q-LOAD-5 (a) 정합 — 카오스
> + 부하 결합은 본 PRD 비목표 N4.3).

---

## 1. 진입 조건

- M-LOAD-2 Exit Criteria 전건 통과 (`03-m-load-2-lp1-baseline.md` §6).
- 본 마일스톤이 의존하는 PRD 결정 잠금:
  - Q-LOAD-6 (b) 중도 셋 → LP-2 의 R = 100 RPS.
  - Q-LOAD-7 (a) 운영 평균 가정 → P = small 80% / medium 15% / large 5%.
  - Q-LOAD-8 (b) sustained 측정 → W_warmup=60s + W_load=30m + W_cooldown=60s
    (총 약 32분).
  - Q-LOAD-12 (a) Markdown 표 → `docs/prd-phase4/results/LP-2_<date>.md`.
- LP-1 측정 분산이 본 측정 환경의 신뢰성을 검증 — 본 마일스톤이 그 위에서 sustained
  영역으로 확장.

## 2. 선행 의존

- **마일스톤:** M-LOAD-2.
- **PRD 결정 잠금:** Q-LOAD-6, Q-LOAD-7, Q-LOAD-8, Q-LOAD-12.
- **1~3단계 결정 정합:**
  - IT-S3 / IT-S4 / IT-S5 의 stub 응답 변형은 PRD `prd-phase4/01` §6 매핑표 +
    1~2단계 `prd/03` §3 IT-S 시나리오의 단일 실행 결정 잠금 위에서 부하 인가만
    확장.
  - 본 마일스톤이 사용하는 stub 변형은 `packages/demo/src/receiver/` 의 기존 코드
    경계 안에서 stub 응답 모드를 환경변수 또는 query param 으로 분기 — 1~2단계
    PRD `04` 도메인 경계 침범 0건(IT-R1 정합).
- **자율 일탈 사전 승인 규칙:** LP-2 외 다른 LP 시나리오 작성 금지. IT-S2 / IT-S6
  / IT-S7 의 부하 변형 금지(Q-LOAD-5 (a) 정합). 측정 분산 ±5% 초과 시 즉시 보고.

## 3. 측정 우선 시퀀스 (4 변형 × 측정 → 결과 보고서 commit)

본 마일스톤의 측정 사이클은 PRD `prd-phase4/03` §3.1 의 8 단계 프로토콜과 정합
하며, 4 변형의 측정을 순차 실행한다.

### 3.1 4 변형의 정의 (PRD `prd-phase4/01` §6 매핑 정합)

| 변형 ID | 1~2단계 IT-S | stub 응답 | 측정 의도 |
|---------|---------------|-----------|------------|
| LP-2-normal | IT-S1 (해피패스) | 항상 200 | nominal 영역 SLO 잠정값 분포 확보 |
| LP-2-S3 | IT-S3 (재시도+백오프) | K회 5xx 후 200 (K=2) | C3 `outcome="retriable_error"` + W3 attempts 분포 측정 |
| LP-2-S4 | IT-S4 (max attempts → DLQ) | 항상 5xx | C5 `reason="max_attempts_exceeded"` + SLO-4 적재율 측정 |
| LP-2-S5 | IT-S5 (4xx 즉시 DLQ) | 항상 4xx | C5 `reason="non_retriable"` 측정 |

> IT-S2 (멱등성) / IT-S6 (stalled) / IT-S6b (stalled-loss recovery) / IT-S7
> (그레이스풀 셧다운) 은 본 PRD 의 LP-N 카탈로그가 매핑하지 않는다 (PRD
> `prd-phase4/01` §6.1 + Q-LOAD-5 (a) 정합).

### 3.2 측정 사이클 (4 변형 순차)

각 변형은 PRD `prd-phase4/03` §3.1 의 8 단계 프로토콜을 그대로 따른다. 변형 사이
의 격리:

- 각 변형 측정 후 `docker compose down -v` (Redis flush — `08-cross-cutting.md`
  §5 정합).
- 다음 변형의 부트스트랩 [1] 단계부터 재시작.
- Prometheus 인스턴스는 같은 인스턴스가 4 변형의 시계열을 누적 → 측정별 time range
  로 PromQL 쿼리 분리(`08-cross-cutting.md` §3).

### 3.3 측정 결과 무효 조건 (PRD `prd-phase4/03` §3.4 정합)

LP-1 과 동일 + 본 마일스톤 보강:

- 메타데이터 8 항목 누락.
- 측정 분산 ±5% 초과 (4 변형 각각).
- 카디널리티 가드 위반.
- Prometheus target up = 0 구간이 W_load 안에 존재.
- k6 의 RPS 도달률이 목표 R = 100 의 ±2% (98 ≤ achieved ≤ 102) 를 벗어남.
- **보강 (LP-2-S4 변형):** SLO-4 (DLQ 적재율) 가 모든 작업이 max_attempts_exceeded
  로 DLQ 진입했는지 검증 — 만약 일부가 성공으로 분류되면 stub 응답 변형이 의도
  대로 동작 안 함.
- **보강 (LP-2-S5 변형):** 모든 작업이 1 attempt 만에 non_retriable 분류로 DLQ
  진입했는지 검증.
- **보강 (LP-2-S3 변형):** W3 attempts 히스토그램의 평균 attempts 가 약 3 (=K+1)
  근처인지 검증.

## 4. 구현 단계 (커밋 단위)

각 번호는 1 commit. 본 마일스톤의 총 commit 수는 7건.

### 단계 1 — `feat(docker/k6/scenarios): add LP-2 nominal sustained scenario`

- `docker/k6/scenarios/lp-2.js` 신규 생성. k6 JS 시나리오. 명세:
  - `executor: 'constant-arrival-rate'`, `rate: 100`, `timeUnit: '1s'`.
  - `duration: __ENV.DURATION || '30m'` (W_load = 30m).
  - `preAllocatedVUs: 50`, `maxVUs: 100`.
  - `tags: { lp_id: 'LP-2', stage: __ENV.STAGE || 'load', variant: __ENV.VARIANT || 'normal' }`.
  - 페이로드 분포 (PRD `prd-phase4/01` §4.1 + Q-LOAD-7 (a) 정합):
    - small 1KB (80%), medium 16KB (15%), large 64KB (5%).
    - 결정성 패딩 (I4.5). 가중치 선택은 k6 의 `randomItem` 또는 누적 분포 기반
      선택.

    ```js
    const SIZES = [
      { bytes: 1024, weight: 80 },
      { bytes: 16384, weight: 15 },
      { bytes: 65536, weight: 5 },
    ];
    function selectSize() {
      const cum = SIZES.reduce((acc, s) => acc + s.weight, 0); // 100
      let r = Math.floor(Math.random() * cum);
      for (const s of SIZES) {
        if ((r -= s.weight) < 0) return s.bytes;
      }
      return SIZES[0].bytes;
    }
    ```

  - 페이로드 본문: `{ event: 'lp-2', _pad: 'x'.repeat(selectSize() - 64) }`.
  - HMAC 서명 + Authorization Bearer — LP-1 과 동일.
  - 대상 URL 의 변형 분기: `K6_TARGET_URL` + query param `?variant=${__ENV.VARIANT}`
    (stub 응답을 분기시키는 메커니즘. 본 query param 의 해석은 단계 4 의 stub
    응답 모드가 처리).

> **결정 의존 주의:** k6 의 `Math.random()` 시드는 결정성을 위해 환경변수
> `K6_SEED` 또는 시나리오의 시작 시각으로 잠정. 본 PLAN 은 잠정 형태만 잠금하며,
> 실제 시드 처리가 측정 분산 ±5% 안에서 안정적이면 사용자 확인 + commit.

### 단계 2 — `feat(demo/receiver): add variant-aware stub response modes`

- `packages/demo/src/receiver/` 의 기존 라우트(`/_demo/receiver`) 가 query param
  `?variant=...` 또는 헤더 `X-Stub-Variant: ...` 를 받아 stub 응답을 분기:
  - `variant=normal` 또는 미지정 → 항상 200 (1~2단계 기본 동작 그대로).
  - `variant=s3` → 멱등성 키별 카운터를 메모리에 두고 K=2회 5xx 후 200 (IT-S3
    부하 변형).
  - `variant=s4` → 항상 5xx (IT-S4 부하 변형).
  - `variant=s5` → 항상 4xx (IT-S5 부하 변형).
- **회귀 가드:**
  - 1~2단계 IT-S1 / IT-S3 / IT-S4 / IT-S5 가 query param / 헤더 변경 없이 그대로
    그린 (variant 미지정 = normal).
  - 1~2단계 IT-S2 (멱등성) 가 그대로 그린 — 본 변경이 멱등성 검사 흐름을 변경
    하지 않음.
- **금지:**
  - `core/` 변경 0건 (IT-R1 도메인 격리 보존).
  - 1~2단계 IT 의 기대 응답 변경 0건. 본 stub 변경은 query param / 헤더가 있을
    때만 분기.
  - 멱등성 키별 카운터(`variant=s3`) 가 메모리 누적 — 측정 종료 후 컨테이너
    재시작으로 초기화. 별도 영속화 0건.
- **자율 일탈 사전 승인 규칙:** 만약 `packages/demo/src/receiver/` 의 변경이
  1~2단계 IT-S1 / IT-S3 / IT-S4 / IT-S5 의 한 건이라도 빨강이면 본 단계 멈춤 +
  사용자에게 보고.

### 단계 3 — `feat(docker/k6/scripts): add LP-2 measurement runner (4 variants)`

- `docker/k6/scripts/run-lp-2.sh` 신규 생성. POSIX shell. 4 변형(normal / s3 /
  s4 / s5) 을 순차 실행:

  ```sh
  for VARIANT in normal s3 s4 s5; do
    MEASUREMENT_ID="LP-2-${VARIANT}_$(date -u +%Y-%m-%dT%H-%M-%SZ)"
    mkdir -p "docker/k6/results/${MEASUREMENT_ID}"
    docker/k6/scripts/collect-metadata.sh > "docker/k6/results/${MEASUREMENT_ID}/metadata.yaml"
    docker compose up -d
    # /healthz 200 + Prometheus targets up=1 확인
    TSTART=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    docker compose --profile measure run --rm \
      -e VARIANT="${VARIANT}" -e DURATION=30m \
      k6 run /scenarios/lp-2.js
    TEND=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    echo "t_start: ${TSTART}" >> "docker/k6/results/${MEASUREMENT_ID}/metadata.yaml"
    echo "t_end: ${TEND}" >> "docker/k6/results/${MEASUREMENT_ID}/metadata.yaml"
    # Prometheus query 실행
    # docker/k6/scripts/query-slis.sh "${TSTART}" "${TEND}" > .../prom-queries.json
    docker compose down -v
  done
  ```

- 각 변형 사이 `docker compose down -v` 로 Redis flush (`08-cross-cutting.md` §5).
- **회귀 가드:** 4 변형의 순차 실행이 총 약 130분 (32 × 4). 측정 호스트의 안정성
  유지 (백그라운드 부하 없음).

### 단계 4 — 측정 실행 (commit 아님 — 사람이 수동 실행)

- §3.2 측정 사이클을 4 변형에 대해 순차 실행. 각 변형의 결과 무효 조건 검증.
- **무효 조건 발동 시:** 본 변형의 측정 결과를 보고서 "실패 사유" 절에 명시.
  남은 변형 측정은 사용자 결정에 따라 진행 또는 중단.

### 단계 5 — `docs(prd-phase4/results): commit LP-2 normal + S3/S4/S5 variants`

- `docs/prd-phase4/results/LP-2_<date>.md` 신규 생성. 형식은 LP-1 보고서와 동일
  + 본 마일스톤 보강:
  - **YAML 헤더 (4 변형 공통)** — 측정 호스트 메타데이터 + cgroup 한정값. 변형별
    측정 시각은 본문 표의 변형 행 안에 기록.
  - **본문 Markdown 표 (4 변형 × SLI):**

    | 변형 | SLI | p50 | p99 | 평균 | 분산 |
    |------|-----|-----|-----|------|------|
    | LP-2-normal | SLO-1 / SLO-2 / SLO-3 / SLO-4 / 처리량 / 카디널리티 | ... | ... | ... | ... |
    | LP-2-S3 | ... | ... | ... | ... | ... |
    | LP-2-S4 | ... | ... | ... | ... | ... |
    | LP-2-S5 | ... | ... | ... | ... | ... |

  - **부속 절: SLO 잠정값 검증 분포** — LP-2-normal 변형의 SLI 가 3단계 SLO
    잠정값 분포에 들어가는지. SLO-1 (5xx ≤ 0.5%), SLO-2 (p99 ≤ 0.5s), SLO-3
    (p99 ≤ 5s), SLO-4 (DLQ ≤ 1%) 의 4 항목.
  - **부속 절: IT-S3 변형 결과 해석** — W3 attempts 히스토그램 평균이 약 3 근처
    (K+1=3 = 1차 시도 + 2회 5xx 재시도 + 3차 시도 성공).
  - **부속 절: IT-S4 변형 결과 해석** — SLO-4 DLQ 적재율의 절대값 (s4 변형에서는
    모든 작업이 DLQ → SLO-4 가 의미 있는 분포 확보).
  - **부속 절: IT-S5 변형 결과 해석** — C5 `reason="non_retriable"` 카운트 + W3
    attempts 가 1로 고정.
  - **부속 절: 측정 분산 확인** — 4 변형 각각의 재측정 ±5% 안 확인.
  - **부속 절: 실패 사유 (있을 시).**

### 단계 6 — `docs(docker/k6/scenarios/README): document LP-2 contract + variant`

- `docker/k6/scenarios/README.md` 의 §1 LP-1 절 뒤에 §2 LP-2 절 추가:
  - LP-2 의 4 차원 + Q-LOAD-7 (a) 페이로드 분포 + 4 변형.
  - stub 응답 분기 메커니즘 (query param / 헤더).
- **금지:** LP-3 / LP-4 의 계약은 본 commit 에서 추가 금지 — M-LOAD-4 책임.

### 단계 7 — `test(demo/receiver): integration tests for variant-aware stub`

- `packages/demo/test/receiver-variants.integration.test.ts` 신규 생성.
- 본 테스트는 **회귀 가드 추가가 아닌** stub 변형의 단위 검증:
  - `variant=normal` (또는 미지정) → 200.
  - `variant=s3` → 첫 2회 5xx, 3회째 200 (멱등성 키별 카운터).
  - `variant=s4` → 항상 5xx.
  - `variant=s5` → 항상 4xx.
- **회귀 가드 추가 0건 정합 (Q-LOAD-13 (a)):** 본 테스트는 stub 자체의 단위 검증
  이며 부하 측정의 회귀 가드가 아니다. 본 테스트가 빨강이면 M-LOAD-3 진입 불가
  (stub 변형 구현 빨강).

> **단계 7 이후 회귀 점검:** `pnpm typecheck` 0 errors, `pnpm test` 그린(신규
> stub 테스트 포함), 1~3단계 IT + UT 전건 그린 (IT-S1 / IT-S3 / IT-S4 / IT-S5
> 가 variant 미지정으로 그대로 그린).

## 5. 생성/수정할 파일 목록 (절대경로)

### 생성

- `/Users/connor/biz/webhook-relay/docker/k6/scenarios/lp-2.js`
- `/Users/connor/biz/webhook-relay/docker/k6/scripts/run-lp-2.sh`
- `/Users/connor/biz/webhook-relay/packages/demo/test/receiver-variants.integration.test.ts`
- `/Users/connor/biz/webhook-relay/docs/prd-phase4/results/LP-2_<date>.md` (단계 5)

### 수정

- `/Users/connor/biz/webhook-relay/packages/demo/src/receiver/` (또는 등가 라우트
  파일) — variant-aware stub 응답 모드 추가.
- `/Users/connor/biz/webhook-relay/docker/k6/scenarios/README.md` (LP-2 계약 추가).

### 절대 만들지/수정하지 않는 것

- `docker/k6/scenarios/lp-3.js`, `lp-4.js` — M-LOAD-4 책임.
- `packages/core/**` — IT-R1 도메인 격리 보존.
- `packages/demo/src/handlers/`, `api/`, `chaos.ts` — 본 마일스톤 변경 0건. stub
  변경은 `receiver/` 안에서만.
- `docker-compose.yml` — 본 마일스톤 변경 0건.
- `docker/prometheus.yml`, `docker/grafana/**` — 본문 변경 0건.
- `docs/plan-phase4/README.md`, `00-decisions-needed.md`, `01-milestones.md` —
  outline 3 파일 변경 0건.
- `docs/prd-phase4/00~05.md` — PRD 본문 변경 0건.

## 6. 수용 기준 / Done 정의

본 절은 outline `01-milestones.md` §3 M-LOAD-3 의 Exit Criteria 와 글자 단위
정합 + 본 마일스톤 보강 항목.

- [ ] LP-2 (R=100, P=80/15/5, W=~32분) k6 시나리오. 페이로드 결정성 패딩.
- [ ] IT-S3 변형 (stub 가 K회 5xx 후 200) / IT-S4 변형 (항상 5xx) / IT-S5 변형
  (항상 4xx) 의 부하 인가.
- [ ] 결과 보고서 `docs/prd-phase4/results/LP-2_<date>.md` + 변형별 별도 행.
- [ ] SLO 잠정값 분포 확보(99.5% / 0.5s / 5s / 1%) + 회귀 가드 그린.

### 보강 항목 (본 마일스톤 단위)

- [ ] stub 변형(`variant=normal|s3|s4|s5`) 이 query param 또는 헤더로 분기하며,
  1~2단계 IT-S1 / IT-S3 / IT-S4 / IT-S5 가 variant 미지정으로 그대로 그린.
- [ ] LP-2 시나리오의 페이로드 분포가 의도된 비율(80/15/5) 안에서 D3
  `api_request_body_bytes` 히스토그램 분포로 검증 가능.
- [ ] 4 변형의 측정 분산이 각각 ±5% 안.
- [ ] LP-2-S3 의 W3 attempts 평균이 약 3 근처 (K=2 의 결과).
- [ ] LP-2-S4 의 SLO-4 DLQ 적재율이 100% 근처 (모든 작업이 max_attempts_exceeded).
- [ ] LP-2-S5 의 C5 `reason="non_retriable"` 카운트가 부하 인가 작업 수와 일치.
- [ ] 본 PLAN 범위 안 파일만 수정 — outline 3 파일 mtime 변경 0건.

## 7. PRD 역참조

| 본 마일스톤 항목 | PRD 절 |
|------------------|---------|
| LP-2 시나리오 (R=100, P=80/15/5, W=~32분) | `prd-phase4/01` §3.1 + Q-LOAD-6 (b) + Q-LOAD-7 (a) + Q-LOAD-8 (b) |
| 4 변형 (normal / S3 / S4 / S5) | `prd-phase4/01` §6 IT-S 매핑표 |
| 페이로드 결정성 패딩 | `prd-phase4/01` §4.3 + I4.5 |
| 측정 프로토콜 8 단계 | `prd-phase4/03` §3.1 |
| SLO 잠정값 분포 (99.5% / 0.5s / 5s / 1%) | `prd-phase4/03` §4 + `prd-phase3/04` §3.1 |
| 측정 분산 ±5% | `prd-phase4/02` §7.2 |
| 카오스 + 부하 비목표 (IT-S2/S6/S7) | `prd-phase4/00-overview` §3 N4.3 + Q-LOAD-5 (a) |

## 8. 결정 의존

- **Q-LOAD-6** (b) 중도 셋 — LP-2 R = 100.
- **Q-LOAD-7** (a) 운영 평균 가정 — small 80% / medium 15% / large 5%.
- **Q-LOAD-8** (b) sustained 측정 — W_warmup=60s + W_load=30m + W_cooldown=60s.
- **Q-LOAD-12** (a) Markdown 표 — 결과 보고서 형식.
- **Q-LOAD-5** (a) 정적 부하만 — IT-S2 / IT-S6 / IT-S7 변형 금지.
- **1~3단계 결정 정합:** 1~2단계 IT-S1 / IT-S3 / IT-S4 / IT-S5 시나리오 결정
  보존, 3단계 메트릭 카탈로그 + SLI PromQL(I6.1) 보존.

> 모든 결정 2026-05-27 Resolved.

## 9. 회귀 점검

본 마일스톤이 끝나는 시점에 다음이 모두 그린:

- `pnpm typecheck` 0 errors.
- `pnpm test:unit` — UT-1~6 + 보강.
- `pnpm test:integration` — IT-S1~S7, IT-S1b, IT-S2b, IT-S6b, IT-R1, IT-OBS-1~12
  전건 그린 + 신규 `receiver-variants.integration.test.ts` 그린.
- 특히 IT-S3 fake timer 단언 그대로 그린 — stub 변형이 1~2단계 IT-S3 의 기대
  응답을 변경하지 않음 (variant 미지정 시).
- IT-S2 멱등성 그대로 그린 — stub 변형의 멱등성 키별 카운터가 1~2단계 멱등성
  검사 흐름에 영향 없음.
- IT-R1 그대로 그린 — stub 변형이 `packages/demo/src/receiver/` 안에서만 처리,
  `core/` 변경 0건.

## 10. 본 마일스톤 후 데모 상태

- 일반 `docker compose up` 후 1~3단계 데모 그대로 동작.
- `docker/k6/scenarios/lp-2.js` 가 4 변형 부하 인가 가능.
- `docs/prd-phase4/results/LP-2_<date>.md` 가 4 변형 × SLI 분포 + SLO 잠정값
  검증 결과 commit.
- `/_demo/receiver?variant=s4` 같은 호출이 stub 응답 분기 동작.
- **다음 마일스톤(M-LOAD-4) 진입 가능 조건:** §6 Done 정의 전건 + 본 §9 회귀 가드
  전건 그린 + LP-2 4 변형의 측정 분산 각각 ±5% 안.
