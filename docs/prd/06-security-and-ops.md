# 06. Security & Ops — HMAC, 타임아웃, 시크릿, Redis 재연결, 그레이스풀 셧다운(2단계 범위)

> 담당 페르소나: **Security** + **SRE(범위 제한)**
> 본 문서는 CLAUDE.md §8(보안/운영 주의)을 PRD 수준으로 구체화한다. **3단계 메트릭/관측성은 placeholder**.
> 구현 코드는 본 PRD가 승인된 뒤 **후속 PLAN 단계**에서 작성한다.
>
> **AI 협업 5원칙(CLAUDE.md §7) 적용:** 보안 정책의 트레이드오프(SSRF, replay 방어 등)는 임의 결정 금지(원칙 4) — 모두 `07`의 오픈 퀘스천에 선택지로 기록한다.

## 1. 컨텍스트 / 배경

웹훅 전송은 외부와 직접 통신하므로 보안과 운영 안정성이 곧 신뢰성의 일부다. CLAUDE.md §8은
다음 항목을 운영 주의 사항으로 명시한다:

- 웹훅 송신 시 HMAC 서명 부착
- 외부 요청 타임아웃
- 환경변수로 시크릿 관리, 시크릿 커밋 금지
- Redis 재연결 백오프 (무한 폭주 방지)

본 PRD는 이를 1~2단계 범위에서 어떻게 충족할지 명세한다.

## 2. HMAC 서명

### 2.1 목적
수신자가 페이로드 위변조 여부를 검증할 수 있도록 한다.

### 2.2 명세
- **알고리즘:** HMAC-SHA256 (기본). 다른 알고리즘 도입은 `07` 오픈 퀘스천.
- **시크릿:** 환경변수 `WEBHOOK_HMAC_SECRET`. 부재 시 부트스트랩 실패(fail-fast).
- **헤더:** `WEBHOOK_HMAC_HEADER`(기본 `X-Webhook-Signature`)에 `sha256=<hex>` 형태로 부착.
- **서명 대상:** 송신 본문(직렬화된 JSON 페이로드의 raw bytes).
- **재시도 시 동일 서명 보장:** 같은 페이로드/시크릿이면 같은 서명. (결정성)
- **시크릿은 큐 페이로드에 저장하지 않는다.** 워커가 환경변수에서 직접 읽어 송신 직전에 서명한다.

### 2.3 비목표
- 비대칭 키 서명(JWT-style RS256 등). 1~2단계 범위 밖.
- 시크릿 로테이션 메커니즘.
- 수신자 측 서명 검증 라이브러리 제공.

## 3. 타임아웃과 외부 호출 안전성

- **외부 송신 타임아웃:** `WEBHOOK_DELIVERY_TIMEOUT_MS` (기본 5000ms). HTTP 클라이언트의
  AbortController로 구현. **무한 대기 금지**.
- **연결 풀:** 1~2단계 범위에서는 표준 동작에 의존. 명시적인 keep-alive 풀 설정은 `07` 오픈 퀘스천.
- **리다이렉트:** 자동 따라가지 않거나, 최대 1회까지만. SSRF 방어와 함께 `07`.
- **SSRF 방어:** private CIDR/localhost로의 송신 차단 정책 → `07`. 본 PRD 범위에서는 **데모용으로
  허용**(`http://localhost:3000/_demo/receiver`가 동작해야 하므로) — 단, 위험 명시.
  운영(`ALLOW_PRIVATE_TARGETS=false`) 시에는 **hostname 문자열 검사 + DNS 조회 결과 IP 검사**
  두 단계를 모두 적용한다(`packages/demo/src/handlers/deliver.ts`의 `isPrivateUrl` + `isPrivateIp`).
  동적 DNS 우회(`evil.example.com` → `10.0.0.1`) 차단. DNS 조회 timeout(2초) 도달 시 보수적
  `NonRetriableError` 로 거부.

## 4. 시크릿 / 환경변수 관리

- 모든 시크릿은 환경변수로만 주입한다.
- `.env.example`로 키만 문서화하고, 실제 시크릿은 절대 커밋하지 않는다.
- `WEBHOOK_HMAC_SECRET`가 비었거나 짧으면(예: 32바이트 미만) 부트스트랩이 거부한다 — 정확한
  최소 길이는 `07` 오픈 퀘스천.
- 시크릿은 로그·에러 메시지·메트릭 라벨·대시보드 응답 어디에도 노출되지 않는다.

## 5. Redis 연결 / 재연결

### 5.1 정책
- BullMQ는 ioredis 권장. 재연결 정책은 ioredis 옵션으로 구현하며 **무한 즉시 재시도 금지**.
- `REDIS_RECONNECT_BASE_MS` (기본 200ms), `REDIS_RECONNECT_MAX_MS` (기본 10s)로 지수 백오프 적용.
- 적용 함수: `packages/core/src/queue.ts::computeReconnectDelay`
  (ioredis `retryStrategy` 에 주입). 공식: `delay = min(cap, base * 2^(times-1))`
  (base = max(1, REDIS_RECONNECT_BASE_MS), cap = max(base, REDIS_RECONNECT_MAX_MS)).
  단위 테스트(`packages/core/test/reconnect-backoff.unit.test.ts`)로 단언.
- 재연결 실패는 구조화 로그로 남기되, 동일 메시지의 폭주를 막기 위해 로그 throttling 권장
  (구현 방법은 PLAN 단계 결정).

### 5.2 헬스체크
- `GET /healthz`는 Redis ping을 포함한다. Redis 끊김 시 `503`을 반환할지 `200 (degraded)`로
  표시할지는 `07` 오픈 퀘스천.

## 6. 그레이스풀 셧다운 (2단계 범위)

### 6.1 목적
무중단 배포·스케일 인 시 진행 중 작업이 잘리지 않도록 한다.

### 6.2 시퀀스 (워커 프로세스)
1. SIGTERM 수신 → 부트스트랩에서 셧다운 핸들러 호출 (`core/shutdown.ts`).
2. 워커 `pause()` → 새 작업 수신 중단.
3. Fastify 서버의 draining 토글이 다음 라우트에 영향을 준다:
   - `POST /webhooks` → `503 ERR_SHUTTING_DOWN` (인증 검증 이전에 분기)
   - `GET /healthz` → `503` (LB/오케스트레이터 표준 신호 — Q-SEC-5 (a) 정합)
   - `GET /dashboard`, `POST /_demo/receiver`, `GET /api/queue/stats` → **200 유지**
     (관측성과 데모 수신자 동작을 셧다운 진행 중에도 보존)
4. 진행 중 작업 완료 대기 (최대 `SHUTDOWN_TIMEOUT_MS`, 기본 30s).
5. 타임아웃 도달 시 강제 종료 직전에 로그로 **잔여 작업 ID** 기록.
   - **정의:** "잔여 작업 ID" = `worker.getJobs(['active'])`의 결과. 즉 워커가
     현재 lock을 보유하고 처리 중이던 active 작업의 ID 목록. 큐 전체의 대기
     작업(`waiting`/`delayed`)은 포함하지 않는다(BullMQ가 재기동 시 자동 회수).
   - 로그 형식: 구조화 JSON 한 줄(`{ remainingJobIds: string[], signal: ... }`).
6. BullMQ Worker/Queue close → ioredis quit → 프로세스 종료.
   - exit code: 정상 완료 시 `0`. 타임아웃 도달 시 `1` (Q-SEC-4 (b) — 잔여
     작업이 있었음을 모니터링 신호로 일치).

### 6.3 비목표
- 진행 중 작업의 **중도 체크포인트**(부분 진행 저장). 본 PRD 범위 밖.
- 셧다운 도중의 신규 요청 큐잉. 모두 `503`으로 거부한다.

### 6.4 테스트 매핑
- 통합 시나리오 **IT-S7**가 본 시퀀스를 검증한다. ([`03`](./03-test-strategy.md))

## 7. 데모 수신 엔드포인트의 보안 메모

- `POST /_demo/receiver`는 **로컬 데모용**이다. 외부에 노출하지 않는 것을 README에 명시.
- HMAC 검증을 데모 수신자에 적용할지 여부는 **선택 사항** — 데모 가치는 "도착 확인"이지
  "서명 검증"이 아니므로, 본 PRD에서는 적용 의무를 두지 않는다. 단, 적용 예시 코드를 두는
  것은 PLAN 단계에서 결정.

## 8. 비기능 요구사항

| 분류 | 요구 |
|------|------|
| **보안** | 시크릿 미설정 시 부트스트랩 실패. 시크릿이 로그에 남지 않음. |
| **신뢰성** | Redis 재연결 폭주 방지. 진행 중 작업이 셧다운으로 인해 잘리지 않음. |
| **결정성** | HMAC 서명은 같은 입력 → 같은 출력. 재시도 시에도 동일. |
| **관측성(범위 제한)** | 구조화 로그 필드(시도 횟수, 에러 클래스). 메트릭 노출은 3단계. |

## 9. 수용 기준 (Acceptance Criteria)

- **AC6.1** 외부 송신 코드는 `AbortController` 타임아웃을 적용한다.
- **AC6.2** 시크릿 미설정 상태로 부트스트랩하면 즉시 종료되며, 종료 메시지에 시크릿 값이 등장하지 않는다.
- **AC6.3** Redis가 일시 단절된 환경에서 워커는 지수 백오프로 재연결을 시도하며, 1초 이내에 수십 번 재시도하는 일이 없다.
- **AC6.4** SIGTERM 수신 후 진행 중 작업이 끝까지 완료되며, 신규 요청에는 `503`을 응답한다.
- **AC6.5** HMAC 서명은 단위 테스트에서 결정성/형식이 검증된다 (UT-6).

## 10. 불변식 (Invariants)

- **I6.1 (시크릿 격리)** `WEBHOOK_HMAC_SECRET`은 로그·에러·메트릭·응답·큐 페이로드 어디에도 등장하지 않는다.
- **I6.2 (타임아웃 강제)** 외부 송신은 반드시 유한한 타임아웃을 갖는다.
- **I6.3 (셧다운 약속)** SIGTERM 이후 진행 중 작업은 강제 중단되지 않는다 (셧다운 타임아웃 내).
- **I6.4 (재연결 백오프)** Redis 재연결 간격은 백오프를 따른다. 즉시 재시도 폭주가 없다.

## 11. 리스크 / 오픈 퀘스천

- **R6.1** SSRF 방어 정책 (private CIDR 차단 vs 데모 편의) → `07`.
- **R6.2** HMAC 서명 헤더에 timestamp/nonce 추가 여부 (replay 방어) → `07`.
- **R6.3** 셧다운 타임아웃 초과 시 강제 종료의 exit code (0 vs 1) → `07`.
- **R6.4** `/healthz`의 degraded 상태 표현 방식 → `07`.
- **R6.5** 시크릿 최소 길이/엔트로피 정책 → `07`.

## 12. 3단계 관측성 — Placeholder

> 본 PRD는 3단계 항목을 정의하지 않는다. 단지 다음 항목들이 "후속 PRD에서 다뤄야 한다"는
> 사실만 기록한다. 본 PRD의 코드/요구로 이행해선 안 된다.

- Prometheus 메트릭 노출 엔드포인트(`/metrics`)와 라벨 설계
- Grafana 대시보드(JSON으로 버전 관리)
- SLO/알람 정의

위 항목들은 본 PRD의 어떤 수용 기준에도 포함되지 않는다.
