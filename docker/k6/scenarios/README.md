# `docker/k6/scenarios/` — k6 시나리오 입출력 계약 단일 출처

> M-LOAD-2 단계 3 가 본 README 의 형식을 잠근다 (PLAN
> `../../../docs/plan-phase4/03-m-load-2-lp1-baseline.md` §4 단계 3).
> M-LOAD-3 단계 6 가 §2 LP-2 절을 추가 (PLAN
> `../../../docs/plan-phase4/04-m-load-3-lp2-nominal.md` §4 단계 6).
> 후속 마일스톤(M-LOAD-4) 의 LP-3/LP-4 시나리오는 본 README 의 §1/§2 형식
> (시나리오 계약) 을 mirror 한다.

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
- s3 변형의 카운터 키: 워커 송신 헤더의 HMAC 서명값 (`sha256=<hex>`).
  같은 jobData → 결정성 본문 → 결정성 HMAC → 재시도 시 같은 카운터 슬롯.
  HMAC 헤더 이름이 무엇이든(env `WEBHOOK_HMAC_HEADER`) 식별 가능하도록
  prefix 매칭으로 추출 — env / config 외부 의존 0.
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
는 §3 표 참조.

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
영향이 없다 (IT-OBS-11 카디널리티 가드 자연 제외 — §4.1 정합).

---

## 3. 환경변수 입력 (LP-1 + 공유)

본 표는 LP-1 시나리오의 기본값. LP-2 특이값(`DURATION=30m`, `RPS=100`,
`VARIANT`, `K6_SEED`)은 §2.4 참조 — 단, `K6_TARGET_URL` / `K6_API_BEARER_TOKEN`
/ `K6_RECEIVER_URL` 는 LP-1/LP-2 공유.

| 환경변수 | 기본값 (LP-1) | 출처 |
|----------|--------|------|
| `STAGE` | `load` | 본 시나리오 — warmup/load 구분 (idempotencyKey 충돌 회피용 tag) |
| `DURATION` | `5m` | LP-1 k6 `duration` 값 (LP-2 는 `30m`) |
| `RPS` | `10` | LP-1 k6 `rate` 값 (LP-2 는 `100`) |
| `K6_TARGET_URL` | `http://api:3000/webhooks` | docker-compose.yml k6.environment (M-LOAD-1 잠금) |
| `K6_API_BEARER_TOKEN` | (필수, 누락 시 fail-fast) | docker-compose.yml k6.environment = `${API_BEARER_TOKEN}` |
| `K6_RECEIVER_URL` | `http://api:3000/_demo/receiver` | 본 시나리오 default — 측정 환경 확장 시 override 가능 |

> `WEBHOOK_HMAC_SECRET` 은 본 시나리오에서 **사용하지 않는다** (단계 1 결정 잠금 1
> 정합 — HMAC 는 워커 송신 측 책임이며 k6 부착 없음). `docker-compose.yml` 의
> k6 서비스에도 매핑되어 있지 않다 (M-LOAD-1 §5 "변경 0건" 잠금).

---

## 4. 출력 메트릭

k6 의 자체 메트릭(`k6_http_*` 등)은 Prometheus remote write 로 전송된다 —
docker-compose.yml 의 `K6_PROMETHEUS_RW_SERVER_URL` 매핑이 활성화한다 (M-LOAD-1
단계 1, PRD `prd-phase4/02` §2.2).

| 메트릭 | 형태 | 비고 |
|--------|------|------|
| `k6_http_reqs` | counter | 인입 요청 수. RPS achieved 단언 (PLAN §3.3 결과 무효 조건 5) |
| `k6_http_req_duration` | histogram | 등록 응답 p99 비교 (D2 와 cross-check) |
| `k6_http_req_failed` | counter | 5xx / 네트워크 에러 비율 |
| `k6_iteration_duration` | histogram | k6 시나리오 1 iter 의 wall-clock |

### 4.1 본 시스템 메트릭(`webhook_relay_*`) 과의 분리

- k6 의 메트릭은 Prometheus 안에서 별도 job label(예: `job=k6` 또는 remote
  write 의 source label) 로 분리된다.
- 3단계 IT-OBS-11 카디널리티 가드(`webhook_relay_*` 시계열 ≤ 1000) 의 단언
  대상에서 k6 메트릭은 자연 제외 (이름 정규식 `webhook_relay_.*` 외) — PLAN
  `08-cross-cutting.md` §3.

### 4.2 시나리오 측 tags 라벨 (LP-1)

- `lp_id`: `LP-1` (시나리오 단위 식별자, 카탈로그 정합).
- `stage`: `warmup` / `load` (k6 stage 단위 분리).
- `endpoint`: `webhooks_post` (요청 종류 식별 — LP-2~LP-4 의 확장에 대비).

본 tag 는 k6 메트릭에만 부착되며 본 시스템의 `webhook_relay_*` 메트릭에는
영향이 없다. LP-2 의 tags 는 §2.6.

---

## 5. 페이로드 결정성

PRD `prd-phase4/01` §4.3 + I4.5 (페이로드 결정성) + PLAN `08-cross-cutting.md`
§4 (k6 시나리오의 결정성 패딩) 정합.

- 페이로드 본문 = `{ "url": "<receiver>", "payload": { "event": "lp-1",
  "_pad": "x...x" }, "idempotencyKey": "<deterministic>" }`.
- `_pad` 길이는 매 요청 동적 계산해서 request body 전체가 정확히 `TARGET_BODY_BYTES`
  (= 1024 bytes) 가 되도록 (단계 1 결정 잠금 2).
- `idempotencyKey` = `lp1-<stage>-<__VU>-<__ITER>` — k6 의 결정성 인덱스 +
  stage 분리. 매 요청 고유 + 재현 가능 + `[A-Za-z0-9_-]+` / 8~128 chars 정합
  (`packages/demo/src/domain/idempotency-key.ts` 단일 출처).
- **금지:** 난수 페이로드 (`Math.random()` 기반) — 측정 재현성 위반.

### 5.1 결정성의 효과

- 같은 (`__VU`, `__ITER`) → 같은 body → 같은 워커 송신 HMAC 서명 (워커 측
  결정성, `packages/demo/src/domain/hmac.ts`).
- 재측정 1회의 핵심 SLI 차이 ±5% 안 (PRD `prd-phase4/02` §7.2) 보호.
- LP-2 의 페이로드 크기 분포 (80/15/5) 는 `K6_SEED` env 시드된 자체 PRNG
  (mulberry32) 가 결정성 보장 — §2.5.

---

## 6. 후속 시나리오 (M-LOAD-4 책임)

| 파일 | 마일스톤 | 비고 |
|------|---------|------|
| `lp-3.js` | M-LOAD-4 | stress (knee point 식별) |
| `lp-4.js` | M-LOAD-4 | spike (base → spike → base) |

본 README 의 §1~§5 구조를 LP-3/LP-4 도 mirror 한다. LP-ID 확장 시 본
README 에 시나리오 계약 절 (§1/§2 형식) 추가 + §3 환경변수 표 갱신 + §7
측정 스크립트 행 추가.

---

## 7. 측정 실행 스크립트

| 스크립트 | 책임 |
|----------|------|
| `../scripts/collect-metadata.sh` | 측정 호스트 메타데이터 YAML 수집 (M-LOAD-1 산출물) |
| `../scripts/run-lp-1.sh` | LP-1 8 단계 측정 프로토콜 자동화 (M-LOAD-2 산출물) |
| `../scripts/run-lp-2.sh` | LP-2 4 변형 × 8 단계 측정 자동화 (M-LOAD-3 단계 3 산출물) |

상세 측정 절차:
- LP-1: `../../../docs/plan-phase4/03-m-load-2-lp1-baseline.md` §3.2.
- LP-2: `../../../docs/plan-phase4/04-m-load-3-lp2-nominal.md` §3.2.
