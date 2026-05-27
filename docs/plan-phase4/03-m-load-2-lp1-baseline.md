# 03. M-LOAD-2 — LP-1 baseline 측정 (R=10 RPS · P=small 1KB 고정 · W=~6.5분)

> **PLAN 진입 조건:** M-LOAD-1 완료 — k6 서비스 + `docker/k6/` 골격 + 메타데이터
> 헬퍼 + `docs/prd-phase4/results/` 디렉터리. PRD Q-LOAD-1~13 전건 Resolved.
> 1~3단계 IT + UT 전건 그린 + `docker compose config` 유효.
>
> **AI 협업 5원칙 적용:** 본 마일스톤은 **첫 측정 사이클** 이며 결과 보고서 commit
> 정책의 단일 출처 시점이다(원칙 1: 설계 잠금). LP-1 의 4 차원(R / P / T / W) 은
> PRD `prd-phase4/01` §3.1 + Q-LOAD-6 (b) / Q-LOAD-7 (a) / Q-LOAD-8 (a) 가 잠근
> 값을 글자 단위로 옮긴다. 측정 분산 ±5% 초과 시 임의 재측정 결정 금지(원칙 4).
>
> **본 마일스톤이 명시적으로 다루지 않는 것:** LP-2 / LP-3 / LP-4 시나리오
> 작성(M-LOAD-3~4 책임), 수평 확장 N 매트릭스(M-LOAD-5 책임), SLO 재조정 PR
> (M-LOAD-6 책임), IT-S3 / IT-S4 / IT-S5 변형 stub(M-LOAD-3 책임).

---

## 1. 진입 조건

- M-LOAD-1 Exit Criteria 전건 통과 (`02-m-load-1-bootstrap.md` §6).
- 본 마일스톤이 의존하는 PRD 결정 잠금:
  - Q-LOAD-1 (a) k6 → 본 마일스톤이 k6 시나리오를 실제 작성.
  - Q-LOAD-6 (b) 중도 셋 → LP-1 의 R = 10 RPS.
  - Q-LOAD-8 (a) 짧은 측정 (LP-1 / LP-4) → W_warmup=60s + W_load=5m + W_cooldown=30s
    (총 약 6.5분).
  - Q-LOAD-12 (a) Markdown 표 → `docs/prd-phase4/results/LP-1_<date>.md`.
- 측정 호스트 메타데이터 헬퍼(`docker/k6/scripts/collect-metadata.sh`) 동작 확인.
- `docs/prd-phase4/results/README.md` 의 보고서 형식 잠금이 본 마일스톤 첫 보고서
  의 글자 단위 출처.

## 2. 선행 의존

- **마일스톤:** M-LOAD-1.
- **PRD 결정 잠금:** Q-LOAD-1, Q-LOAD-2, Q-LOAD-6, Q-LOAD-8, Q-LOAD-12.
- **1~3단계 결정 정합:**
  - 본 마일스톤이 사용하는 stub 수신자는 1~2단계의 기존 `/_demo/receiver` (PRD
    `prd-phase4/01` §6 IT-S1 매핑 정합 — happy-path stub). 별도 stub 추가 0건.
  - 3단계 메트릭 카탈로그(C1~C11 / D1~D3 / W1~W4) 의 SLI PromQL 형태(I6.1) 정합
    — 본 마일스톤이 변경 없음.
- **자율 일탈 사전 승인 규칙:** LP-1 외 다른 LP 시나리오 작성 금지. 측정 분산
  ±5% 초과 시 즉시 보고 (PRD `prd-phase4/02` §7.2 + `08-cross-cutting.md` §7).

## 3. 측정 우선 시퀀스 (실행 → 결과 보고서 commit)

본 마일스톤의 사이클은 PRD `prd-phase4/03` §3.1 의 8 단계 측정 프로토콜과 정합.
"측정 실행 → 보고서 작성 → commit → push" 가 1 사이클이며, 부분 실패 시 보고서
에 "실패 사유" 절을 명시 + 사용자 검토 (`08-cross-cutting.md` §2).

### 3.1 빨강(시나리오 부재) → 통과(시나리오 + 결과 보고서)

1. **본 마일스톤 시작 시점 (빨강):** `docker/k6/scenarios/lp-1.js` 존재 0건.
   `docs/prd-phase4/results/LP-1_<date>.md` 존재 0건.
2. **단계 1 후:** `lp-1.js` 존재. `docker compose --profile measure run --rm k6
   run /scenarios/lp-1.js` 실행 가능.
3. **단계 4 후 (통과):** `docs/prd-phase4/results/LP-1_<date>.md` 존재. 본 보고
   서가 측정 분산 ±5% 안 + 메타데이터 8 항목 전건 기록.

### 3.2 측정 실행 절차 (PRD `prd-phase4/03` §3.1 8 단계 정합)

```
[1] 부트스트랩
    └ docker compose up -d (k6 제외 5 서비스)
    └ /healthz 200 + /metrics 200 (api + worker) 확인
    └ Prometheus targets up=1 확인 (curl http://localhost:9090/api/v1/targets)
    └ Grafana provisioning 완료 확인 (선택)

[2] 측정 호스트 메타데이터 수집
    └ docker/k6/scripts/collect-metadata.sh > docker/k6/results/<id>/metadata.yaml
    └ 8 항목 전건 (PRD 02 §5.1) — 누락 시 측정 무효

[3] 워밍업 (W_warmup = 60s)
    └ docker compose --profile measure run --rm k6 run /scenarios/lp-1.js \
        --env STAGE=warmup --env DURATION=60s
    └ JIT / V8 inline cache / Redis connection pool 안정화

[4] 부하 인가 (W_load = 5m, R = 10 RPS, P = small 1KB 고정)
    └ docker compose --profile measure run --rm k6 run /scenarios/lp-1.js \
        --env STAGE=load --env DURATION=5m --env RPS=10
    └ k6 의 executor=constant-arrival-rate, rate=10, timeUnit=1s
    └ t_start = W_warmup 종료 시점 / t_end = W_load 종료 시점 기록

[5] 쿨다운 (W_cooldown = 30s)
    └ k6 종료 후 30s 대기. 큐 길이 회복 / DLQ 적재 마무리 확인

[6] Prometheus query — 결과 추출 (PRD 03 §3.2)
    └ SLO-1 (5xx 비율) — query_range, range=[t_start, t_end], step=15s
    └ SLO-2 (p99 등록 지연) — query_range, range=[t_start, t_end], step=15s
    └ SLO-3 (p99 전달 지연) — query_range, range=[t_start, t_end], step=15s
    └ SLO-4 (DLQ 적재율) — query (instant), t = t_end
    └ 처리량 RPS achieved — query_range, sum(rate(jobs_processed_total[5m]))
    └ 카디널리티 — query, count({__name__=~"webhook_relay_.*"})

[7] 통계 추출 + 결과 보고서 작성
    └ p50 / p99 / 평균 / 분산 (W_load 구간 시계열의 통계)
    └ docs/prd-phase4/results/LP-1_<date>.md 작성

[8] 정리
    └ docker compose down -v (Redis 데이터 삭제)
    └ git add + commit + push
```

### 3.3 측정 결과 무효 조건 (PRD `prd-phase4/03` §3.4 정합)

다음 중 하나라도 충족되면 측정 결과 무효 → 보고서에 "실패 사유" 절 명시 + 사용자
검토.

- 메타데이터 8 항목 누락 (PRD `02` §5.3).
- 측정 분산 ±5% 초과 (PRD `02` §7.2). 핵심 SLI: 처리량 ±2% / p99 ±5% / DLQ ±10%.
- 카디널리티 가드 위반 (PRD `03` §2.3). 시계열 수 증가가 라벨 enum 폐쇄성 침범.
- Prometheus target up = 0 구간이 W_load 안에 존재.
- k6 의 RPS 도달률이 목표 R = 10 의 ±2% (즉 9.8 ≤ achieved ≤ 10.2) 를 벗어남.

## 4. 구현 단계 (커밋 단위)

각 번호는 1 commit. Conventional Commits prefix. 본 마일스톤의 총 commit 수는 6건.

### 단계 1 — `feat(docker/k6/scenarios): add LP-1 baseline scenario (R=10, P=small)`

> **2026-05-27 사용자 결정 잠금 2건 (단계 1 진입 시점):**
>
> 1. **HMAC 서명 헤더 부착 제외** — `POST /webhooks` 는 Bearer 만 검증하며
>    `X-Webhook-Signature` 헤더는 **워커 → 외부 수신자** 송신 시 부착하는 헤더
>    이다(`packages/demo/src/handlers/deliver.ts` + `packages/demo/src/domain/hmac.ts`).
>    PRD `01` §4.3 의 "HMAC 서명은 본문에 의존" 은 **워커 측 결정성 서명** 을
>    위해 페이로드 본문이 결정성이어야 한다는 뜻이지 k6 가 부착하라는 뜻이 아니
>    다. `docker-compose.yml` 의 k6 서비스에도 `WEBHOOK_HMAC_SECRET` 환경변수가
>    매핑되어 있지 않다(M-LOAD-1 단계 1 + §5 "변경 0건" 잠금 정합). 따라서 k6
>    시나리오는 HMAC 헤더를 부착하지 않는다.
> 2. **페이로드 1024 bytes 기준 = `POST /webhooks` request body 전체** —
>    D3 메트릭(`api_request_body_bytes`) + PRD `01` §2.2 "P = 요청 본문 바이트
>    분포" 정합. `_pad` 길이를 동적 계산해서 `JSON.stringify({ url, payload:
>    { event, _pad }, idempotencyKey })` 결과가 정확히 1024 bytes 가 되도록.

- `docker/k6/scenarios/lp-1.js` 신규 생성. k6 JS 시나리오. 명세:
  - `import http from 'k6/http';` (HMAC 부착 없음 — 결정 잠금 1).
  - `export const options.scenarios.lp_1_baseline`:
    - `executor: 'constant-arrival-rate'`.
    - `rate: 10`, `timeUnit: '1s'` (R = 10 RPS).
    - `duration: __ENV.DURATION || '5m'` (W_load = 5m).
    - `preAllocatedVUs: 5`, `maxVUs: 10`.
    - `tags: { lp_id: 'LP-1', stage: __ENV.STAGE || 'load' }`.
  - 페이로드 생성: 결정성 패딩 + request body 전체 1024 bytes 동적 계산 (PRD
    `prd-phase4/01` §4.3 + `08-cross-cutting.md` §4 + 결정 잠금 2). 본문 형식:

    ```js
    const TARGET_BODY_BYTES = 1024; // small = 1KB (request body 전체)
    // 결정성 idempotencyKey (8~128 chars, [A-Za-z0-9_-]+).
    // __VU + __ITER 가 k6 의 결정성 인덱스 — 매 요청 고유 + 재현 가능.
    const idempotencyKey = `lp1-${__VU}-${__ITER}`.padEnd(8, '0');
    // _pad 동적 계산: targetBodyBytes - (url + idempotencyKey + JSON 구조 오버헤드).
    const skeleton = JSON.stringify({ url: TARGET_URL, payload: { event: 'lp-1', _pad: '' }, idempotencyKey });
    const padLen = TARGET_BODY_BYTES - skeleton.length;
    const body = JSON.stringify({ url: TARGET_URL, payload: { event: 'lp-1', _pad: 'x'.repeat(padLen) }, idempotencyKey });
    ```

  - Authorization: `Bearer ${__ENV.K6_API_BEARER_TOKEN}` (Q-API-1 (b) 잠금).
  - 대상 URL: `${__ENV.K6_TARGET_URL}` (M-LOAD-1 환경변수, = `http://api:3000/webhooks`).
  - 요청 본문의 `url` 필드: `http://api:3000/_demo/receiver` (PRD `prd-phase4/01`
    §6 IT-S1 매핑 — happy-path stub. 워커가 이 URL 로 송신).
  - HTTP method: `POST`.
- **회귀 가드:** 본 시나리오 파일은 `docker/k6/scenarios/` 안에만 존재. `packages/`
  코드 변경 0건.
- **금지:**
  - 난수 페이로드 금지 (PRD `prd-phase4/01` §4.3 I4.5 결정성 패딩 의무).
  - Bearer 외 다른 인증/서명 헤더 추가 0건 (결정 잠금 1 정합 — HMAC 헤더
    부착도 금지).
  - 다른 LP 시나리오 파일(`lp-2.js` 등) 본 commit 에서 추가 금지.

### 단계 2 — `feat(docker/k6/scripts): add LP-1 measurement runner script`

- `docker/k6/scripts/run-lp-1.sh` 신규 생성. POSIX shell. §3.2 의 8 단계를
  순차 실행 + 실패 단계에서 비-0 종료.
- 입력 환경변수: `MEASUREMENT_ID` (기본값 = `LP-1_$(date -u +%Y-%m-%dT%H-%M-%SZ)`).
- 출력 디렉터리: `docker/k6/results/${MEASUREMENT_ID}/`.
- 단계별 출력:
  - `metadata.yaml` — `collect-metadata.sh` 실행 결과.
  - `k6-warmup.json` — k6 warmup summary.
  - `k6-load.json` — k6 load summary (RPS achieved 등).
  - `prom-queries.json` — Prometheus query 결과 (SLO-1~4 + 처리량 + 카디널리티).
  - `t_start` / `t_end` — W_load 의 시작/종료 ISO 8601 timestamp.
- **회귀 가드:** 본 스크립트는 호스트 측에서 수동 실행. CI 통합 없음 (Q-LOAD-13
  (a) 정합).
- **금지:** 본 스크립트가 결과 보고서 Markdown 을 자동 생성 0건 — 보고서 작성은
  사람이 수동 처리(PRD `prd-phase4/02` §6.3 잠정 권고 정합).

### 단계 3 — `chore(docker/k6): document LP-1 scenario contract`

- `docker/k6/scenarios/README.md` 신규 생성. 시나리오 파일의 입출력 계약 단일
  출처:
  - **§1 LP-1 시나리오 계약:** R=10 / P=small 1KB 고정 / T=steady / W=~6.5분.
  - **§2 환경변수 입력:** `STAGE` / `DURATION` / `RPS` / `K6_TARGET_URL` /
    `K6_API_BEARER_TOKEN`. `WEBHOOK_HMAC_SECRET` 는 본 시나리오에서 **부착하지
    않는다** (단계 1 결정 잠금 1 정합).
  - **§3 출력 메트릭:** k6 자체 메트릭(`k6_http_*`) 이 Prometheus remote write
    로 전송 (PRD `prd-phase4/02` §2.2 정합). 본 메트릭은 `webhook_relay_*` 와
    별도 job label 로 분리 (PRD `prd-phase4/02` §11 R4.8).
  - **§4 페이로드 결정성:** PRD `01` §4.3 I4.5 정합 — 결정성 패딩 의무.
- **금지:** 다른 LP 시나리오 계약을 본 commit 에서 추가 금지 — LP-2~LP-4 는
  M-LOAD-3~4 책임.

### 단계 4 — 측정 실행 (commit 아님 — 사람이 수동 실행)

- `docker/k6/scripts/run-lp-1.sh` 실행 → 8 단계 완료 → `docker/k6/results/<id>/`
  생성.
- 결과 무효 조건(§3.3) 검증:
  - 메타데이터 8 항목 전건 기록 여부.
  - RPS achieved ∈ [9.8, 10.2].
  - 처리량 / p99 / DLQ 분산이 ±5% 안 (재측정 1회로 확인).
  - 카디널리티 가드 통과.
  - Prometheus targets up=1 유지.
- **무효 조건 발동 시:** 본 단계에서 멈춤 → §6 §"실패 사유 절" 절차로 진입.

### 단계 5 — `docs(prd-phase4/results): commit LP-1 baseline measurement report`

- `docs/prd-phase4/results/LP-1_<date>.md` 신규 생성. 형식은 `results/README.md`
  잠금:
  - **YAML 헤더** — PRD `02` §5.2 형식 + 메타데이터 8 항목 + LP-ID + 부하 패턴
    (`steady`) + 페이로드 분포(`small:100`) + 측정 윈도우(`60/300/30`).
  - **본문 Markdown 표 (행 = SLI, 열 = 값):**

    | SLI | p50 | p99 | 평균 | 분산 (stdev) |
    |-----|-----|-----|------|----------------|
    | SLO-1 가용성 (5xx 비율) | (실측) | (실측) | (실측) | (실측) |
    | SLO-2 등록 지연 (D2) | (실측) | (실측) | (실측) | (실측) |
    | SLO-3 전달 지연 (W2) | (실측) | (실측) | (실측) | (실측) |
    | SLO-4 DLQ 적재율 | (실측) | (실측) | (실측) | (실측) |
    | 처리량 (RPS achieved) | (실측) | (실측) | (실측) | (실측) |
    | 카디널리티 (시계열 수) | (실측 시작) | (실측 종료) | (변화) | — |

  - **부속 절: 결과 해석** — LP-1 의 SLI 가 3단계 SLO 잠정값(99.5% / 0.5s / 5s /
    1%) 분포에 들어가는지 사람 검토. LP-1 은 baseline 영역이므로 SLO 위반은
    없어야 함.
  - **부속 절: 측정 분산 확인** — 본 측정 + 재측정 1회의 핵심 SLI 차이가 ±5%
    안인지 확인 (재측정 결과를 별도 행 또는 부속 노트로 기록).
  - **부속 절: 실패 사유 (있을 시)** — §3.3 무효 조건 중 발동된 항목 + 1차 대응
    내역 (재측정 / 환경 점검 / 사용자 결정 대기).
- **commit 메시지:** "M-LOAD-2: LP-1 baseline 측정 결과 commit. 측정 일시 yyyy-mm-dd.
  AC4.4 측정 프로토콜 통과 + 회귀 가드 그린."

### 단계 6 — `chore(docker/k6/results): keep raw artifacts (선택)`

- 선택 사항. `docker/k6/results/<id>/` 의 raw artifact (`k6-load.json` +
  `prom-queries.json` 등) 를 `.gitignore` 추가 또는 commit 결정. 본 PRD `02` §6.4
  가 "결과는 PR 로 commit 되어 추적된다" 라 한 대상은 `docs/prd-phase4/results/`
  의 Markdown 보고서이며, `docker/k6/results/` 의 raw artifact 는 잠정으로
  `.gitignore`. 사용자 결정 위임 시 본 commit 으로 처리.
- **잠정 권고:** `.gitignore` 에 `docker/k6/results/**/k6-*.json` + `prom-queries.json`
  추가. Markdown 보고서가 단일 출처. raw artifact 재생성 가능.
- **금지:** raw artifact 를 commit 하기로 결정한 경우라도 본 PLAN 의 범위 안에서만
  처리. PRD 본문 변경 0건.

> **단계 6 이후 회귀 점검:** `pnpm typecheck` 0 errors, `pnpm test` 그린, 1~3단계
> IT + UT 전건 그린, `docker compose config` 유효, k6 시나리오 1건 등장.

## 5. 생성/수정할 파일 목록 (절대경로)

### 생성

- `/Users/connor/biz/webhook-relay/docker/k6/scenarios/lp-1.js`
- `/Users/connor/biz/webhook-relay/docker/k6/scenarios/README.md`
- `/Users/connor/biz/webhook-relay/docker/k6/scripts/run-lp-1.sh`
- `/Users/connor/biz/webhook-relay/docs/prd-phase4/results/LP-1_<date>.md` (단계 5)

### 수정

- `/Users/connor/biz/webhook-relay/.gitignore` (단계 6, 선택 — raw artifact 제외).

### 절대 만들지/수정하지 않는 것

- `docker/k6/scenarios/lp-2.js`, `lp-3.js`, `lp-4.js` — M-LOAD-3~4 책임.
- `docker/k6/scenarios/stubs/**` — IT-S3 / IT-S4 / IT-S5 변형 stub 은 M-LOAD-3
  책임.
- `packages/**` — 본 마일스톤 코드 변경 0건. 기존 `/_demo/receiver` 사용.
- `docker-compose.yml` — 본 마일스톤은 변경 0건 (M-LOAD-1 이 이미 k6 서비스 추가).
  - **예외 (2026-05-27 단계 4 측정 중 발견 + 사용자 결정 잠금):** api 서비스에
    `/healthz` 기반 healthcheck 추가. M-LOAD-1 의 k6.depends_on.api.condition:
    `service_healthy` 가 api 서비스 healthcheck 부재로 즉시 실패하던 실효 버그
    fix. 본 예외는 docker-compose.yml 의 다른 부분 변경 0건 + healthcheck 1건
    추가에 한정.
- `docs/plan-phase4/README.md`, `00-decisions-needed.md`, `01-milestones.md` —
  outline 3 파일 변경 0건.
- `docs/prd-phase4/00~05.md` — PRD 본문 변경 0건.
- `docker/prometheus.yml`, `docker/grafana/**` — 본문 변경 0건.

## 6. 수용 기준 / Done 정의

본 절은 outline `01-milestones.md` §3 M-LOAD-2 의 Exit Criteria 와 글자 단위
정합 + 본 마일스톤 보강 항목.

- [ ] LP-1 (R=10, P=small 고정, W=~6.5분) k6 시나리오 작성 + happy-path stub 수신
  자(기존 `/_demo/receiver`).
- [ ] `docker/k6/run.sh` (또는 등가 `run-lp-1.sh`) 측정 실행 스크립트. cgroup
  한정값 적용 + Prometheus query 시점 기록 + 메타데이터 수집.
- [ ] 첫 결과 보고서 `docs/prd-phase4/results/LP-1_<date>.md` commit. 측정 분산
  ±5% 안 확인.
- [ ] AC4.4 측정 프로토콜 통과 + 회귀 가드 그린.

### 보강 항목 (본 마일스톤 단위)

- [ ] k6 시나리오의 페이로드가 결정성 패딩(`{"_pad": "x".repeat(...)}`) 으로
  `POST /webhooks` request body **전체** 가 정확히 1024 bytes (small 고정,
  단계 1 결정 잠금 2).
- [ ] 워커 측 HMAC 서명 결정성은 본 마일스톤 책임 0건 — 1~2단계 IT-S3 가 이미
  결정성 재현 가능을 단언(`packages/demo/src/domain/hmac.ts` + Q-SEC-2 (a) 정합).
  k6 시나리오는 HMAC 헤더를 부착하지 않는다(단계 1 결정 잠금 1).
- [ ] k6 메트릭(`k6_http_*`) 이 Prometheus 의 별도 job label 로 분리 — 3단계
  IT-OBS-11 카디널리티 가드의 단언 대상에서 제외 (PRD `02` §11 R4.8 정합).
- [ ] 측정 결과 보고서의 YAML 메타데이터 헤더가 PRD `02` §5.1 의 필수 8 항목 전건
  기록.
- [ ] 본 PLAN 범위 안 파일만 수정 — outline 3 파일 mtime 변경 0건.

## 7. PRD 역참조

| 본 마일스톤 항목 | PRD 절 |
|------------------|---------|
| LP-1 시나리오 (R=10, P=small, W=~6.5분) | `prd-phase4/01` §3.1 + Q-LOAD-6 (b) + Q-LOAD-8 (a) |
| 결정성 패딩 페이로드 | `prd-phase4/01` §4.3 + I4.5 |
| 측정 프로토콜 8 단계 | `prd-phase4/03` §3.1 |
| Prometheus query 형태 | `prd-phase4/03` §3.2 |
| 통계 추출 (p50/p99/평균/분산) | `prd-phase4/03` §3.3 |
| 측정 결과 무효 조건 | `prd-phase4/03` §3.4 |
| 메타데이터 8 항목 | `prd-phase4/02` §5.1 |
| 결과 보고서 형식 | `prd-phase4/02` §6 + Q-LOAD-12 (a) |
| 측정 분산 ±5% | `prd-phase4/02` §7.2 |
| happy-path stub = `/_demo/receiver` | `prd-phase4/01` §6 IT-S1 매핑 |

## 8. 결정 의존

- **Q-LOAD-1** (a) k6 — 시나리오 파일 형식.
- **Q-LOAD-2** (b) 로컬 + cgroup 격리 — 측정 환경.
- **Q-LOAD-6** (b) 중도 셋 — LP-1 R = 10.
- **Q-LOAD-8** (a) LP-1 짧은 측정 — W_warmup=60s + W_load=5m + W_cooldown=30s.
- **Q-LOAD-12** (a) Markdown 표 — 결과 보고서 형식.
- **Q-LOAD-13** (a) IT-LOAD-N 없음 — CI 통합 없음.
- **1~3단계 결정 정합:** Q-API-1 (b) Bearer auth, Q-SEC-2 (a) HMAC SHA-256, 3단계
  메트릭 카탈로그 + SLI PromQL(I6.1) 보존.

> 모든 결정 2026-05-27 Resolved.

## 9. 회귀 점검

본 마일스톤이 끝나는 시점에 다음이 모두 그린:

- `pnpm typecheck` 0 errors.
- `pnpm test:unit` — UT-1~6 + 보강(metrics-c-catalog, metrics-d-w-catalog).
- `pnpm test:integration` — IT-S1~S7, IT-S1b, IT-S2b, IT-S6b, IT-R1, IT-OBS-1~12
  전건 그린.
- `docker compose config` 유효. k6 시나리오 파일 마운트 정상.
- `docker compose up` (k6 제외) 후 1~3단계 데모 정상 동작 — 본 마일스톤은 코드
  변경 0건.
- **부수 효과 0건 검증:** LP-1 측정이 끝난 후 `docker compose down -v` 가 Redis
  데이터를 정리하므로 1~3단계 데모 재실행 시 상태 누적 없음.

## 10. 본 마일스톤 후 데모 상태

- 일반 `docker compose up` 후 1~3단계 데모 그대로 동작 (k6 비실행).
- `docker compose --profile measure run --rm k6 run /scenarios/lp-1.js` 가 실행
  가능 — LP-1 baseline 측정 실행.
- `docs/prd-phase4/results/LP-1_<date>.md` 가 첫 결과 보고서로 등장. 형식이 본
  PLAN 의 후속 마일스톤(M-LOAD-3~6) 결과 보고서의 출처.
- **다음 마일스톤(M-LOAD-3) 진입 가능 조건:** §6 Done 정의 전건 + 본 §9 회귀 가드
  전건 그린 + LP-1 측정 분산 ±5% 안 확인.
