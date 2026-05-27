# `docker/k6/scenarios/` — k6 시나리오 입출력 계약 단일 출처

> M-LOAD-2 단계 3 가 본 README 의 형식을 잠근다 (PLAN
> `../../../docs/plan-phase4/03-m-load-2-lp1-baseline.md` §4 단계 3).
> 후속 마일스톤(M-LOAD-3~4) 의 LP-2~LP-4 시나리오는 본 README 의 §1~§4 구조를
> mirror 한다.

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

## 2. 환경변수 입력

| 환경변수 | 기본값 | 출처 |
|----------|--------|------|
| `STAGE` | `load` | 본 시나리오 — warmup/load 구분 (idempotencyKey 충돌 회피용 tag) |
| `DURATION` | `5m` | 본 시나리오 — k6 `duration` 값 |
| `RPS` | `10` | 본 시나리오 — k6 `rate` 값 |
| `K6_TARGET_URL` | `http://api:3000/webhooks` | docker-compose.yml k6.environment (M-LOAD-1 잠금) |
| `K6_API_BEARER_TOKEN` | (필수, 누락 시 fail-fast) | docker-compose.yml k6.environment = `${API_BEARER_TOKEN}` |
| `K6_RECEIVER_URL` | `http://api:3000/_demo/receiver` | 본 시나리오 default — 측정 환경 확장 시 override 가능 |

> `WEBHOOK_HMAC_SECRET` 은 본 시나리오에서 **사용하지 않는다** (단계 1 결정 잠금 1
> 정합 — HMAC 는 워커 송신 측 책임이며 k6 부착 없음). `docker-compose.yml` 의
> k6 서비스에도 매핑되어 있지 않다 (M-LOAD-1 §5 "변경 0건" 잠금).

---

## 3. 출력 메트릭

k6 의 자체 메트릭(`k6_http_*` 등)은 Prometheus remote write 로 전송된다 —
docker-compose.yml 의 `K6_PROMETHEUS_RW_SERVER_URL` 매핑이 활성화한다 (M-LOAD-1
단계 1, PRD `prd-phase4/02` §2.2).

| 메트릭 | 형태 | 비고 |
|--------|------|------|
| `k6_http_reqs` | counter | 인입 요청 수. RPS achieved 단언 (PLAN §3.3 결과 무효 조건 5) |
| `k6_http_req_duration` | histogram | 등록 응답 p99 비교 (D2 와 cross-check) |
| `k6_http_req_failed` | counter | 5xx / 네트워크 에러 비율 |
| `k6_iteration_duration` | histogram | k6 시나리오 1 iter 의 wall-clock |

### 3.1 본 시스템 메트릭(`webhook_relay_*`) 과의 분리

- k6 의 메트릭은 Prometheus 안에서 별도 job label(예: `job=k6` 또는 remote
  write 의 source label) 로 분리된다.
- 3단계 IT-OBS-11 카디널리티 가드(`webhook_relay_*` 시계열 ≤ 1000) 의 단언
  대상에서 k6 메트릭은 자연 제외 (이름 정규식 `webhook_relay_.*` 외) — PLAN
  `08-cross-cutting.md` §3.

### 3.2 시나리오 측 tags 라벨

- `lp_id`: `LP-1` (시나리오 단위 식별자, 카탈로그 정합).
- `stage`: `warmup` / `load` (k6 stage 단위 분리).
- `endpoint`: `webhooks_post` (요청 종류 식별 — LP-2~LP-4 의 확장에 대비).

본 tag 는 k6 메트릭에만 부착되며 본 시스템의 `webhook_relay_*` 메트릭에는
영향이 없다.

---

## 4. 페이로드 결정성

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

### 4.1 결정성의 효과

- 같은 (`__VU`, `__ITER`) → 같은 body → 같은 워커 송신 HMAC 서명 (워커 측 결정
  성, `packages/demo/src/domain/hmac.ts`).
- 재측정 1회의 핵심 SLI 차이 ±5% 안 (PRD `prd-phase4/02` §7.2) 보호.
- LP-2 의 페이로드 크기 분포 (80/15/5) 도 결정성 시드 또는 가중치 순환으로
  보장 (M-LOAD-3 책임 — 본 README 는 LP-1 단일 출처).

---

## 5. 후속 시나리오 (M-LOAD-3~4 책임)

| 파일 | 마일스톤 | 비고 |
|------|---------|------|
| `lp-2.js` | M-LOAD-3 | nominal sustained, 4 변형 (normal / s3 / s4 / s5) |
| `lp-3.js` | M-LOAD-4 | stress (knee point 식별) |
| `lp-4.js` | M-LOAD-4 | spike (base → spike → base) |

본 README 의 §1~§4 구조를 LP-2~LP-4 도 mirror 한다. LP-ID 확장 시 본 README
§1 표에 행 추가 + §2 환경변수 표 갱신.

---

## 6. 측정 실행 스크립트

| 스크립트 | 책임 |
|----------|------|
| `../scripts/collect-metadata.sh` | 측정 호스트 메타데이터 YAML 수집 (M-LOAD-1 산출물) |
| `../scripts/run-lp-1.sh` | LP-1 8 단계 측정 프로토콜 자동화 (본 마일스톤 산출물) |

상세 측정 절차는 `../../../docs/plan-phase4/03-m-load-2-lp1-baseline.md` §3.2.
