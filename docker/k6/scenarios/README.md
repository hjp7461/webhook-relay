# `docker/k6/scenarios/` — k6 시나리오 입출력 계약 단일 출처

> M-LOAD-2 단계 3 가 본 README 의 형식을 잠근다 (PLAN
> `../../../docs/plan-phase4/03-m-load-2-lp1-baseline.md` §4 단계 3).
> M-LOAD-3 단계 6 가 §2 LP-2 절을 추가 (PLAN
> `../../../docs/plan-phase4/04-m-load-3-lp2-nominal.md` §4 단계 6).
> M-LOAD-4 별도 docs commit 이 §3 LP-3 + §4 LP-4 절을 추가 (PLAN
> `../../../docs/plan-phase4/05-m-load-4-lp3-lp4.md` §5).

---

## 0. 폴더 위치 + 마운트

- 호스트 경로: `docker/k6/scenarios/`.
- 컨테이너 마운트: `/scenarios:ro` (docker-compose.yml k6.volumes 잠금).
- 실행 형태: `docker compose --profile measure run --rm k6 run /scenarios/<lp-id>.js`.

---

## 1. LP-1 시나리오 계약 (`lp-1.js`)

| 차원 | 값 | 출처 |
|------|----|------|
| **R (RPS)** | 10 RPS | PRD `prd-phase4/01` §3.1 + Q-LOAD-6 (b) 중도 셋 잠금 |
| **P (페이로드)** | small 1KB **고정** — `POST /webhooks` request body **전체** 가 정확히 1024 bytes | PRD `01` §3.1 + 단계 1 결정 잠금 2 |
| **T (등록 패턴)** | steady (`constant-arrival-rate`) | PRD `01` §2.3 + §3.1 |
| **W (측정 윈도우)** | warmup 60s + load 5m + cooldown 30s ≈ 6.5분 | PRD `01` §5 + Q-LOAD-8 (a) |
| **인증** | `Authorization: Bearer ${K6_API_BEARER_TOKEN}` | Q-API-1 (b) |
| **HMAC 헤더** | **부착 없음** (단계 1 결정 잠금 1) | PRD `01` §4.3 (HMAC 는 워커→수신자 송신 책임) |
| **수신자** | `http://api:3000/_demo/receiver` (request body `url` 필드) | PRD `01` §6 IT-S1 happy-path stub |

---

## 2. LP-2 시나리오 계약 (`lp-2.js`)

> M-LOAD-3 단계 6 이 본 절을 추가 (PLAN
> `../../../docs/plan-phase4/04-m-load-3-lp2-nominal.md` §4 단계 6).
> 본 절은 §1 LP-1 의 4 차원 구조를 mirror + LP-2 특이값(4 변형 / 페이로드
> 분포 / stub 응답 분기).

### 2.1 4 차원

| 차원 | 값 | 출처 |
|------|----|------|
| **R (RPS)** | 100 RPS | PRD `prd-phase4/01` §3.1 + Q-LOAD-6 (b) 중도 셋 잠금 |
| **P (페이로드)** | small 1KB 80% + medium 16KB 15% + large 64KB 5% — 가중치 분포, `POST /webhooks` request body **전체** 기준 | PRD `01` §3.1 + §4.1 + Q-LOAD-7 (a) 운영 평균 가정 |
| **T (등록 패턴)** | steady (`constant-arrival-rate`) | PRD `01` §2.3 + §3.1 |
| **W (측정 윈도우)** | warmup 60s + load 30m + cooldown 60s ≈ 32분 | PRD `01` §5 + Q-LOAD-8 (b) sustained |
| **인증** | `Authorization: Bearer ${K6_API_BEARER_TOKEN}` | Q-API-1 (b) |
| **HMAC 헤더** | **부착 없음** (LP-1 결정 잠금 1 정합 — HMAC 는 워커→수신자 송신 책임) | PRD `01` §4.3 |
| **수신자** | `http://api:3000/_demo/receiver?variant=<variant>` (variant 분기 메커니즘은 §2.3) | PRD `01` §6 IT-S 매핑표 |

### 2.2 4 변형 (PRD `prd-phase4/01` §6 IT-S 매핑표)

| 변형 | 1~2단계 IT-S | stub 응답 | 측정 의도 |
|------|---------------|-----------|------------|
| LP-2-normal | IT-S1 (해피패스) | 항상 200 | nominal 영역 SLO 잠정값 분포 |
| LP-2-S3 | IT-S3 (재시도+백오프) | HMAC 헤더 값별 K=2 회 503 후 200 | C3 retriable_error rate + W3 attempts 분포 |
| LP-2-S4 | IT-S4 (max attempts → DLQ) | 항상 503 | C5 `reason=max_attempts_exceeded` + SLO-4 적재율 |
| LP-2-S5 | IT-S5 (즉시 DLQ) | 항상 400 | C5 `reason=non_retriable` 카운트 + 1 attempt 분포 |

> IT-S2 (멱등성) / IT-S6 (stalled) / IT-S6b (stalled-loss recovery) /
> IT-S7 (그레이스풀 셧다운) 은 본 PRD 의 LP-N 카탈로그가 매핑하지 않는다
> (PRD `prd-phase4/01` §6.1 + Q-LOAD-5 (a) 정합 — 카오스 + 부하 결합은
> 본 PRD 비목표 N4.3).

### 2.3 stub 응답 분기 메커니즘

- k6 시나리오: `K6_RECEIVER_URL` 뒤에 `?variant=normal|s3|s4|s5` 를 query
  param 으로 부착 (`packages/demo/src/api/receiver.ts` 단계 2 commit
  df2ae52 — variant-aware stub 응답 모드).
- variant 미지정 또는 `normal` → 1~2단계 동작 보존 (200 + `{ ok: true }`).
- s3 변형의 카운터 키: M-LOAD-3 fix commit `ec1da6d` 가 `body.idempotencyKey`
  를 1차 키로 추출, HMAC 헤더값을 fallback 으로 보존. 결정성 패딩 환경에서
  multiple unique 작업의 동일 HMAC 충돌 회피.
- s3 카운터 Map 은 라우트 등록 closure 안 — 측정 종료 후 컨테이너 재시작
  으로 초기화. 별도 영속화 0건.

### 2.4 환경변수 입력 (LP-2 특이값)

| 환경변수 | 기본값 | 비고 |
|----------|--------|------|
| `STAGE` | `load` | warmup/load 구분 (LP-1 동일) |
| `DURATION` | `30m` | LP-2 W_load (1800s) |
| `RPS` | `100` | LP-2 부하 (Q-LOAD-6 (b)) |
| `VARIANT` | `normal` | stub 응답 분기 (`normal`/`s3`/`s4`/`s5`) |
| `K6_SEED` | `0` | 페이로드 크기 PRNG (mulberry32) 시드 — §2.5 |

LP-1 과 공유 (`K6_TARGET_URL`, `K6_API_BEARER_TOKEN`, `K6_RECEIVER_URL`)
는 §5 표 참조.

### 2.5 페이로드 분포의 결정성

PRD `prd-phase4/01` §4.3 + I4.5 + PLAN `08-cross-cutting.md` §4 정합.

- k6 의 `Math.random()` 은 시드 불가능 → 자체 PRNG (mulberry32) 도입.
- `K6_SEED` env 으로 시드 (default `0`). 매 측정 같은 시드 → 같은
  `(VU, ITER)` → 같은 페이로드 크기 선택 → 매 측정 같은 분포 패턴.
- 가중치 누적 분포 선택 (`SIZES = [{ 1024, 80 }, { 16384, 15 }, { 65536, 5 }]`,
  total = 100). 매 요청 `selectSize()` 호출.
- LP-1 과 동일하게 `_pad` 길이는 매 요청 skeleton.length 로부터 동적 계산
  (단계 1 결정 잠금 2 정합).
- 단계 1 결정 의존 주의 — 측정 분산 ±5% 안에서 안정적이면 사후 잠금
  (PLAN §4 단계 1, commit 19b9b7f).

### 2.6 시나리오 측 tags 라벨

- `lp_id`: `LP-2`.
- `stage`: `warmup` / `load`.
- `variant`: `normal` / `s3` / `s4` / `s5` (k6 메트릭의 변형 분리).
- `endpoint`: `webhooks_post`.
- `size_bytes`: 선택된 페이로드 크기 (k6 메트릭의 분포 검증 tag).

본 tag 는 k6 메트릭에만 부착되며 본 시스템의 `webhook_relay_*` 메트릭에는
영향이 없다 (IT-OBS-11 카디널리티 가드 자연 제외 — §6.1 정합).

---

## 3. LP-3 시나리오 계약 (`lp-3.js`)

> M-LOAD-4 별도 docs commit 이 본 절을 추가 (PLAN
> `../../../docs/plan-phase4/05-m-load-4-lp3-lp4.md` §4 단계 1 + §5).
> 본 절은 §2 LP-2 의 4 차원 구조를 mirror + LP-3 특이값(stress 영역 / variant
> 없음 / P=large 64KB 고정 / Redis 자원 지표 sampling 보강).

### 3.1 4 차원

| 차원 | 값 | 출처 |
|------|----|------|
| **R (RPS)** | 500 RPS | PRD `prd-phase4/01` §3.1 + Q-LOAD-6 (b) 중도 셋 잠금 — stress 영역 |
| **P (페이로드)** | large 64KB **고정** — `POST /webhooks` request body **전체** 가 정확히 65536 bytes | PRD `01` §3.1 + 단계 1 결정 잠금 2. knee point 1차 탐색 시 payload size variance 를 변수에서 제거 |
| **T (등록 패턴)** | steady (`constant-arrival-rate`) | PRD `01` §2.3 + §3.1 |
| **W (측정 윈도우)** | warmup 60s + load 30m + cooldown 60s ≈ 32분 | PRD `01` §5 + Q-LOAD-8 (b) sustained |
| **인증** | `Authorization: Bearer ${K6_API_BEARER_TOKEN}` | Q-API-1 (b) |
| **HMAC 헤더** | **부착 없음** (LP-1/LP-2 결정 잠금 1 정합) | PRD `01` §4.3 |
| **수신자** | `http://api:3000/_demo/receiver` (variant 미지정 = normal default, stub 응답 항상 200) | PRD `01` §6 IT-S1 happy-path stub |

### 3.2 측정 의도 (PRD `prd-phase4/04` §5)

- **knee point 1차 탐색** — p99 / 처리량 / 큐 길이가 LP-2 nominal 대비 비선형
  으로 증가하는지 식별.
- **선형성 계산** — N=1 LP-3 처리량 / 기대 처리량(R=500) → 1.0 근처면 knee
  미도달, < 0.8 면 knee 진입.
- **bound 원인 분류** — CPU / 메모리 / 네트워크 / 워커 경합 중 어느 자원이
  먼저 포화 (run-lp-3.sh 의 `redis-stats.jsonl` 30초 sampling 이 1차 자료).

### 3.3 환경변수 입력 (LP-3 특이값)

| 환경변수 | 기본값 | 비고 |
|----------|--------|------|
| `STAGE` | `load` | warmup/load 구분 |
| `DURATION` | `30m` | LP-3 W_load (1800s) |
| `RPS` | `500` | LP-3 부하 (Q-LOAD-6 (b) stress) |

`VARIANT` / `K6_SEED` 없음 (LP-3 는 variant 미지정 + 페이로드 단일 64KB
고정이라 PRNG 불필요). LP-1 과 공유 (`K6_TARGET_URL`, `K6_API_BEARER_TOKEN`,
`K6_RECEIVER_URL`) 는 §5 표 참조.

### 3.4 페이로드 결정성

LP-1 패턴 동일 — `_pad` 길이는 매 요청 `skeleton.length` 로부터 동적 계산.
`TARGET_BODY_BYTES = 65536`. payload 안에 `idempotencyKey` + root-level
`idempotencyKey` 양쪽 부착 (M-LOAD-3 fix `ec1da6d` cross-link — 결정성
패딩 환경에서 동일 HMAC 충돌 회피 표준 패턴 일관성).

### 3.5 시나리오 측 tags 라벨

- `lp_id`: `LP-3`.
- `stage`: `warmup` / `load`.
- `endpoint`: `webhooks_post`.
- `size_bytes`: `65536` (LP-3 는 64KB 고정).

---

## 4. LP-4 시나리오 계약 (`lp-4.js`)

> M-LOAD-4 별도 docs commit 이 본 절을 추가 (PLAN
> `../../../docs/plan-phase4/05-m-load-4-lp3-lp4.md` §4 단계 2 + §5).
> LP-4 는 spike pattern (base → spike → base) 으로 `ramping-arrival-rate`
> executor 를 사용 — §1~§3 의 `constant-arrival-rate` 와 다른 형태.

### 4.1 4 차원 + spike 구조

| 차원 | 값 | 출처 |
|------|----|------|
| **R_base (base RPS)** | 100 RPS | PRD `01` §3.1 + Q-LOAD-6 (b) — LP-2 와 동일 nominal 영역 |
| **R_spike (spike RPS)** | 1000 RPS | PRD `01` §3.1 + Q-LOAD-6 (b) — spike 영역 |
| **T_spike** | 30s sustained | PLAN §4 단계 2 잠금 |
| **P (페이로드)** | small 1KB **고정** | PRD `01` §3.1 |
| **T (등록 패턴)** | spike (`ramping-arrival-rate`) | PRD `01` §2.3 + §3.1 |
| **stages** | 5m@100 + 10s ramp 100→1000 + 30s@1000 + 10s ramp 1000→100 + 5m@100 = 10m 50s | PLAN §4 단계 2 명세 — lp-4.js 본 commit 이 시간 배분 잠금 |
| **W_cooldown** | 60s (runner 책임) | PLAN §3.2 |
| **인증** | `Authorization: Bearer ${K6_API_BEARER_TOKEN}` | Q-API-1 (b) |
| **HMAC 헤더** | **부착 없음** | LP-1/LP-2/LP-3 결정 잠금 1 정합 |
| **수신자** | `http://api:3000/_demo/receiver` (variant 미지정 = normal) | PRD `01` §6 IT-S1 happy-path stub |

### 4.2 측정 의도 (PRD `prd-phase4/04` §4.3)

- **spike 흡수 능력** — spike 30s 구간 동안 C1 `queue_depth{job_state="waiting"}`
  의 최대값.
- **회복 시간 (time-to-recover)** — spike 종료 후 큐 길이가 baseline (W_base_1
  60s~300s 분포의 95th percentile 이하) 으로 처음 들어간 시각 - spike 종료 시각.
- **별도 warmup k6 invocation 없음** — lp-4.js 의 stages 안에 W_base_1 5m 첫
  60s 가 사실상 warmup 역할 (PLAN §3.2 "+ warmup 60s = 약 13분" 정합). 분석
  단계 6 의 baseline 분포 추출 시 첫 60s 제외.
- **"측정 윈도우 초과" 케이스** — 큐 길이가 cooldown 종료까지 baseline 으로
  회복되지 않으면 회복 시간 = "측정 윈도우 초과" 로 기록 (knee point T3 트리거
  시사, PRD `04` §6.2).

### 4.3 환경변수 입력 (LP-4 특이값)

| 환경변수 | 기본값 | 비고 |
|----------|--------|------|
| `STAGE` | `load` | LP-4 는 단일 stage |

`DURATION` / `RPS` 없음 (lp-4.js 의 stages 가 시간 + RPS 를 hard-coded
잠금). `VARIANT` / `K6_SEED` 없음 (variant 미지정 + 페이로드 단일 1KB
고정). LP-1 과 공유 (`K6_TARGET_URL`, `K6_API_BEARER_TOKEN`,
`K6_RECEIVER_URL`) 는 §5 표 참조.

### 4.4 페이로드 결정성

LP-1 패턴 동일 — `_pad` 길이는 매 요청 `skeleton.length` 로부터 동적 계산.
`TARGET_BODY_BYTES = 1024`. `payload.idempotencyKey` + root-level
`idempotencyKey` 양쪽 부착 (LP-3 와 동일 cross-link).

### 4.5 시나리오 측 tags 라벨

- `lp_id`: `LP-4`.
- `stage`: `load` (LP-4 는 단일 stage).
- `endpoint`: `webhooks_post`.
- `size_bytes`: `1024` (LP-4 는 1KB 고정).

### 4.6 spike 시각 정합 (분석 단계 6 cross-link)

run-lp-4.sh 의 `metadata.yaml` 에 시각 오프셋 명시:

- `t_spike_seconds_after_load_start: 300` (W_base_1 5m 종료, ramp up 시작)
- `t_spike_end_seconds_after_load_start: 340` (sustained 30s 종료, ramp down 시작)

본 오프셋이 보고서 단계 6 의 baseline / spike / recovery 구간 분리 기준.

---

## 5. 환경변수 입력 (LP-1 + 공유)

본 표는 LP-1 시나리오의 기본값. LP-2 특이값(`DURATION=30m`, `RPS=100`,
`VARIANT`, `K6_SEED`)은 §2.4 참조. LP-3 특이값(`RPS=500`)은 §3.3 참조.
LP-4 는 stages hard-coded (§4.3) — 단, `K6_TARGET_URL` / `K6_API_BEARER_TOKEN`
/ `K6_RECEIVER_URL` 는 LP-1/LP-2/LP-3/LP-4 공유.

| 환경변수 | 기본값 (LP-1) | 출처 |
|----------|--------|------|
| `STAGE` | `load` | 본 시나리오 — warmup/load 구분 (idempotencyKey 충돌 회피용 tag) |
| `DURATION` | `5m` | LP-1 k6 `duration` 값 (LP-2 는 `30m`, LP-3 는 `30m`, LP-4 는 stages hard-coded) |
| `RPS` | `10` | LP-1 k6 `rate` 값 (LP-2 는 `100`, LP-3 는 `500`, LP-4 는 stages hard-coded) |
| `K6_TARGET_URL` | `http://api:3000/webhooks` | docker-compose.yml k6.environment (M-LOAD-1 잠금) |
| `K6_API_BEARER_TOKEN` | (필수, 누락 시 fail-fast) | docker-compose.yml k6.environment = `${API_BEARER_TOKEN}` |
| `K6_RECEIVER_URL` | `http://api:3000/_demo/receiver` | 본 시나리오 default — 측정 환경 확장 시 override 가능 |

> `WEBHOOK_HMAC_SECRET` 은 본 시나리오에서 **사용하지 않는다** (단계 1 결정 잠금 1
> 정합 — HMAC 는 워커 송신 측 책임이며 k6 부착 없음). `docker-compose.yml` 의
> k6 서비스에도 매핑되어 있지 않다 (M-LOAD-1 §5 "변경 0건" 잠금).

---

## 6. 출력 메트릭

k6 의 자체 메트릭(`k6_http_*` 등)은 Prometheus remote write 로 전송된다 —
docker-compose.yml 의 `K6_PROMETHEUS_RW_SERVER_URL` 매핑이 활성화한다 (M-LOAD-1
단계 1, PRD `prd-phase4/02` §2.2).

| 메트릭 | 형태 | 비고 |
|--------|------|------|
| `k6_http_reqs` | counter | 인입 요청 수. RPS achieved 단언 (PLAN §3.3 결과 무효 조건 5) |
| `k6_http_req_duration` | histogram | 등록 응답 p99 비교 (D2 와 cross-check) |
| `k6_http_req_failed` | counter | 5xx / 네트워크 에러 비율 |
| `k6_iteration_duration` | histogram | k6 시나리오 1 iter 의 wall-clock |

### 6.1 본 시스템 메트릭(`webhook_relay_*`) 과의 분리

- k6 의 메트릭은 Prometheus 안에서 별도 job label(예: `job=k6` 또는 remote
  write 의 source label) 로 분리된다.
- 3단계 IT-OBS-11 카디널리티 가드(`webhook_relay_*` 시계열 ≤ 1000) 의 단언
  대상에서 k6 메트릭은 자연 제외 (이름 정규식 `webhook_relay_.*` 외) — PLAN
  `08-cross-cutting.md` §3.

### 6.2 시나리오 측 tags 라벨 (LP-1)

- `lp_id`: `LP-1` (시나리오 단위 식별자, 카탈로그 정합).
- `stage`: `warmup` / `load` (k6 stage 단위 분리).
- `endpoint`: `webhooks_post` (요청 종류 식별).

LP-2 의 tags 는 §2.6, LP-3 는 §3.5, LP-4 는 §4.5. 본 tag 는 k6 메트릭에만
부착되며 본 시스템의 `webhook_relay_*` 메트릭에는 영향이 없다.

---

## 7. 페이로드 결정성

PRD `prd-phase4/01` §4.3 + I4.5 (페이로드 결정성) + PLAN `08-cross-cutting.md`
§4 (k6 시나리오의 결정성 패딩) 정합.

- 페이로드 본문 = `{ "url": "<receiver>", "payload": { "event": "lp-N",
  "_pad": "x...x", "idempotencyKey": "<deterministic>" }, "idempotencyKey":
  "<deterministic>" }`.
- `_pad` 길이는 매 요청 동적 계산해서 request body 전체가 정확히 `TARGET_BODY_BYTES`
  (LP-1=1024 / LP-2=가중치 / LP-3=65536 / LP-4=1024) 가 되도록 (단계 1 결정 잠금 2).
- `idempotencyKey` = `lp{N}-<stage>-<__VU>-<__ITER>` (LP-2 는 variant 포함) —
  k6 의 결정성 인덱스 + stage 분리. 매 요청 고유 + 재현 가능 +
  `[A-Za-z0-9_-]+` / 8~128 chars 정합 (`packages/demo/src/domain/idempotency-key.ts`
  단일 출처).
- `payload.idempotencyKey` 부착 — M-LOAD-3 fix `ec1da6d` 가 잠근 표준 패턴.
  결정성 패딩 환경에서 multiple unique 작업이 동일 HMAC 를 생성하는 충돌
  회피 (receiver 카운터 키 교란 방지). LP-3/LP-4 는 receiver 카운터를
  사용하지 않으나 일관성을 위해 동일 부착.
- **금지:** 난수 페이로드 (`Math.random()` 기반) — 측정 재현성 위반.

### 7.1 결정성의 효과

- 같은 (`__VU`, `__ITER`) → 같은 body → 같은 워커 송신 HMAC 서명 (워커 측
  결정성, `packages/demo/src/domain/hmac.ts`).
- 재측정 1회의 핵심 SLI 차이 ±5% 안 (PRD `prd-phase4/02` §7.2) 보호.
- LP-2 의 페이로드 크기 분포 (80/15/5) 는 `K6_SEED` env 시드된 자체 PRNG
  (mulberry32) 가 결정성 보장 — §2.5.

---

## 8. 측정 실행 스크립트

| 스크립트 | 책임 |
|----------|------|
| `../scripts/collect-metadata.sh` | 측정 호스트 메타데이터 YAML 수집 (M-LOAD-1 산출물) |
| `../scripts/run-lp-1.sh` | LP-1 8 단계 측정 프로토콜 자동화 (M-LOAD-2 산출물) |
| `../scripts/run-lp-2.sh` | LP-2 4 변형 × 8 단계 측정 자동화 (M-LOAD-3 산출물) |
| `../scripts/run-lp-3.sh` | LP-3 8 단계 + Redis 자원 지표 sampling (M-LOAD-4 산출물) |
| `../scripts/run-lp-4.sh` | LP-4 8 단계 + 큐 길이 1초 polling (M-LOAD-4 산출물) |
| `../scripts/run-horizontal-scaling.sh` | N ∈ {1, 2, 5, 10} × LP-2 normal 8 단계 (M-LOAD-5 산출물) |

상세 측정 절차:
- LP-1: `../../../docs/plan-phase4/03-m-load-2-lp1-baseline.md` §3.2.
- LP-2: `../../../docs/plan-phase4/04-m-load-3-lp2-nominal.md` §3.2.
- LP-3: `../../../docs/plan-phase4/05-m-load-4-lp3-lp4.md` §3.1.
- LP-4: `../../../docs/plan-phase4/05-m-load-4-lp3-lp4.md` §3.2.
- 수평 확장 (N 매트릭스): `../../../docs/plan-phase4/06-m-load-5-horizontal-scaling.md` §3.2.

---

## 9. 수평 확장 runner 계약 (`run-horizontal-scaling.sh`)

> M-LOAD-5 단계 4 가 본 절을 추가 (PLAN
> `../../../docs/plan-phase4/06-m-load-5-horizontal-scaling.md` §4 단계 4 + §5).
> 본 절은 §8 표의 `run-horizontal-scaling.sh` 행을 LP-N 시나리오와 다른 N 매트릭스
> 입출력 계약으로 명문화. 본 스크립트는 `lp-2.js` 시나리오를 재사용 (변경 0).

### 9.1 입력 (환경변수)

| 환경변수 | 기본값 | 비고 |
|----------|--------|------|
| `N_VALUES` | `'1 2 5 10'` | 공백 구분 N 매트릭스. PRD §I4.19 폐쇄성 — 임의 N 추가 금지 |
| `W_WARMUP_S` | `60` | 각 N 별 warmup 윈도우 |
| `W_LOAD_S` | `1800` | 각 N 별 load 윈도우 (30m sustained, Q-LOAD-8 (b)) |
| `W_COOLDOWN_S` | `60` | 각 N 별 cooldown 윈도우 |
| `RPS` | `100` | LP-2 normal 부하 (Q-LOAD-6 (b)) |
| `K6_SEED` | `0` | 페이로드 크기 PRNG 시드 (lp-2.js §2.5) |

LP-2 시나리오 공유 (`K6_TARGET_URL`, `K6_API_BEARER_TOKEN`, `K6_RECEIVER_URL`)
는 §5 표 참조. VARIANT=normal 잠금 (4 N 매트릭스가 LP-2 normal 만 사용 —
PLAN §3.1).

### 9.2 8 단계 프로토콜 (각 N 마다)

LP-2 runner (`run-lp-2.sh`) 의 variant loop 패턴을 N loop 로 mirror. 각 N:

1. **[1] Bootstrap** — `docker compose up -d --build --scale worker=${N} redis api worker prometheus grafana`.
2. **Readiness gate** — `/healthz 200 (api)` + `Prometheus targets up >= 2`
   (api + worker job groups). worker host port 매핑 없음 (fix `db23169`).
3. **[2] 메타데이터** — `collect-metadata.sh` + `lp_id: LP-2` + `rps: ${RPS}` +
   `variant: normal` + `k6_seed: ${K6_SEED}` + `worker_count: ${N}` 부착.
4. **[3] Warmup / [4] Load / [5] Cooldown** — `lp-2.js` 단일 invocation × 3
   (warmup/load 각각 별도 invocation).
5. **[5b] Logs capture** — `docker compose logs api/worker` (N 인스턴스 통합).
6. **[6] Prometheus query** — SLO-1~4 + **SLO-H-1 (throughput completed)** +
   **SLO-H-2 (worker_processing_duration_seconds p99)** + C1 큐 길이 + 등록
   RPS + scrape coverage (`min(up{job="webhook-relay-worker"})`).
7. **[8] Cleanup** — `docker compose down -v` 로 다음 N 진입 전 Redis flush.

### 9.3 출력 (`docker/k6/results/LP-2-N${N}_<timestamp>/`)

- `metadata.yaml` — 호스트 + cgroup + `worker_count: N` + `lp_id: LP-2`.
- `k6-warmup.json` / `k6-load.json` — k6 summary export.
- `prom-queries.json` — Prometheus query 결과 (SLO + SLO-H-1/H-2 + 보강).
- `api.log` / `worker.log` — 컨테이너 stdout/stderr (worker.log 는 N 인스턴스 통합).
- `t_start` / `t_end` — load 단계 시각 마커 (SLI 시계열 범위).

### 9.4 prometheus.yml single target round-robin 한계 (사용자 결정 잠금)

PRD `prd-phase4/04` §R4.18 정정 (2026-05-28) + PLAN `06-m-load-5-horizontal-scaling.md`
§3.4 보강 정합.

- `docker/prometheus.yml` 의 worker job 이 single static target `worker:3001`.
- `docker compose up --scale worker=N` (N>=2) 시 docker compose service-level
  DNS round-robin 으로 매 scrape (15s) 마다 N 인스턴스 중 1 응답 → counter
  점프 → `rate()` PromQL 의 N 인스턴스 합산 정확도 저하 가능성.
- 사용자 결정 (2026-05-28 잠금): **prometheus.yml 변경 없이 single target
  동작 그대로 진행**. 한계는 결과 보고서 (`docs/prd-phase4/results/horizontal-
  scaling_<date>.md` §5) 에 명시 + 사후 분석.
- N=1 측정은 본 한계의 영향 없음 (단일 인스턴스, round-robin 없음).
- 후속 권장 (별도 PRD 또는 fix 시리즈): `dns_sd_configs` 도입 + 정확도 비교.

### 9.5 cgroup 호환성 (호스트 사양 12 core, 32 GB, Docker VM 7.65 GB)

- worker 컨테이너에 cgroup limit **없음** (host CPU/메모리 공유).
- M-LOAD-1 §5a 보조 관찰 cross-link — 6 서비스 cgroup 총합 (15.0 cpus) 가
  호스트 코어 (12) over-commit. M-LOAD-5 N=10 측정 시 14 컨테이너 / 12 core
  over-commit 영역 진입 — 단 부하 영역 (LP-2 normal R=100) 이 N=1 capacity
  안에 들어와 over-commit 영향 미관찰.
- M-LOAD-4 LP-3 cross-link — 단일 Redis fork-time 메모리 cliff (Docker VM
  7.65 GB) 영역에서는 LP-2 normal 부하가 fork 영역 진입 안 함 (waiting 큐
  ~0 영역).

### 9.6 측정 결과 무효 조건 + 정확도 한계 보고서 단계

상세는 PLAN `06-m-load-5-horizontal-scaling.md` §3.4 + §3.3 (SLO-H-1/H-2 PromQL).
- 메타데이터 누락 (특히 `worker_count: N` 필수).
- k6 RPS achieved 가 R=100 의 ±2% (= [98, 102]) 를 벗어남.
- 카디널리티 가드 위반 (`webhook_relay_*` ≤ 1000).
- Prometheus target `up=0` 구간이 W_load 안에 존재.
- 정확도 한계 (§9.4) 는 무효 조건은 **아니며** 보고서에 명시.
