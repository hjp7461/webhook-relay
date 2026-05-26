# 07. Out of Scope & Future — 3~4단계 / 부록 트랙 / 오픈 퀘스천

> 담당 페르소나: **PM**
> 본 문서는 "본 PRD에서 다루지 않는 것"과 "임의 결정을 피해 사람에게 미룬 결정"을 한 곳에 모은다.

## 1. 명시적 Out of Scope

본 PRD(1~2단계)는 다음 항목을 다루지 않는다. 후속 PRD에서 별도로 다룬다.

### 1.1 3단계 — 관측성
- Prometheus 메트릭 노출(`/metrics`)
- 라벨 설계 (큐, 작업 종류, 에러 클래스, 시도 번호 등)
- Grafana 대시보드 JSON (`docker/grafana/` 자리만 예약)
- SLO/알람 임계값

> 본 PRD 범위에서는 `core/metrics.ts`를 **정의만** 두는 것조차 인터페이스 수준에서 보수적으로
> 처리한다 (구체 구현은 3단계 PRD가 정의한다).

### 1.2 4단계 — 부하 / 셧다운 측정 / 수평 확장
- 처리량(throughput), p50/p99 지연 분포 측정
- 워커 수 변경에 따른 스루풋 변화 그래프
- 그레이스풀 셧다운의 측정 가능한 SLO (예: "30초 이내에 99%가 종료된다")
- 카오스 시나리오의 정량 분석 (`packages/demo/src/chaos.ts`의 정식 활용)

### 1.3 부록 트랙 — Streams Internals
- `packages/streams-internals/`에서 Raw Redis Streams로 큐 내부를 직접 구현
- 추상화 비용 벤치마크(BullMQ vs raw streams)
- 본 PRD 범위에서는 **임포트·참조·문서 인용 모두 금지**. 폴더 자리만 보존한다.

### 1.4 기타 본 PRD가 명시적으로 거부한 항목
- 멀티 테넌트 권한 모델, API 키 발급/회수
- 다중 큐/라우팅, 우선순위 큐, 지연 작업 스케줄러
- 웹훅 수신자 등록부(엔드포인트 카탈로그, 구독 모델)
- DLQ 작업의 자동 재투입
- exactly-once 전달 시도
- UI 폴리싱, 인증 화면, 사용자 관리

## 2. 결정 보류(오픈 퀘스천) — **2026-05-26 전건 일괄 잠금**

> **Status:** PRD 작성 시점의 21건 보류 항목은 PLAN 단계에서 모두 결정되었다.
> 단일 소스 오브 트루스: **`docs/plan/00-decisions-needed.md`** (각 Q-ID의 최종 선택과 결정일이 기록됨).
> 본 섹션의 Q-ID/Options/Provisional 기록은 의사결정 이력 추적 목적으로 그대로 보존한다.
>
> **요약 결정표:**
>
> | Q-ID | 최종 결정 | Provisional과의 일치 |
> |------|-----------|----------------------|
> | Q-API-1 | (b) Bearer 공유 시크릿 | **불일치** (provisional `(a)` → 결정 `(b)`) |
> | Q-API-2 | (a) `202` + 동일 `jobId` | 일치 |
> | Q-API-3 | (a) 블랙리스트 | 일치 |
> | Q-API-4 | (a) `jobId`만 반환 | 일치 |
> | Q-RETRY-1 | (a) `NonRetriableError` | 일치 |
> | Q-RETRY-2 | (a) 모두 retriable | 일치 |
> | Q-RETRY-3 | (a) jitter 없음 | 일치 |
> | Q-DLQ-1 | (a) 두지 않음 | 일치 |
> | Q-STALL-1 | (a) 운영 30s + env 단축 | 일치 |
> | Q-SEC-1 | (b) `ALLOW_PRIVATE_TARGETS` 토글 | 일치 |
> | Q-SEC-2 | (a) replay 방어 미적용 | 일치 |
> | Q-SEC-3 | (a) 32 bytes | 일치 |
> | Q-SEC-4 | (b) exit code `1` | 일치 |
> | Q-SEC-5 | (a) `503` | 일치 |
> | Q-SEC-6 | (a) 정책만 | 일치 |
> | Q-ARCH-1 | (a) Node 내장 `fetch` | 일치 |
> | Q-ARCH-2 | (c) 통합 테스트 1건 | 일치 |
> | Q-ARCH-3 | (a) 빈 파일/타입만 | 일치 |
> | Q-ARCH-4 | (a) `<TData>` 1개 | 일치 |
> | Q-OPS-1 | (b) 통합 테스트 별도 CI 잡 | 일치 |
> | Q-OPS-2 | (b) 자식 프로세스 SIGTERM | 일치 |

> 형식 (이력 보존용): **Q#** — 질문 / **Options** — 선택지 / **Provisional** — 잠정 가정(어디까지나 임시. 최종 결정은 PLAN에 있음)

### 2.1 API / 인증 / 인터페이스

- **Q-API-1** 작업 등록 API 인증 방식
  - Options:
    (a) 인증 없음 (데모용 명시)
    (b) 공유 시크릿(`Authorization: Bearer <SECRET>`)
    (c) HMAC 요청 서명(수신용 HMAC과 별도 키)
  - Provisional: **(a)** — README에 "데모/로컬 전용" 명시. 운영 배포 시 (b)로 격상.

- **Q-API-2** 멱등성 재요청 응답 코드 의미
  - Options:
    (a) `202` + 동일 `jobId` (idempotent re-submit)
    (b) `409 Conflict` + 기존 `jobId`
  - Provisional: **(a)** — 클라이언트가 동일 응답을 받으면 단순함.

- **Q-API-3** 요청 본문 `headers` 화이트리스트 정책
  - Options:
    (a) 모두 허용 (단, `Authorization`/`Cookie`/`Host` 등은 제외)
    (b) 허용 목록 명시
  - Provisional: **(a)** 금지 헤더 블랙리스트만 적용. 단, `06`의 시크릿 누출 위험 재검토 필요.

- **Q-API-4** API 응답에 `attemptsMade`/`status` 같은 작업 추적 필드를 포함할지
  - Options:
    (a) 등록 응답은 `jobId`만, 추적은 별도 GET API
    (b) 등록 응답에 상태 일부 포함
  - Provisional: **(a)** — 단순함 우선. 추적 GET API는 본 PRD 범위 밖(필요 시 PLAN 단계에서 결정).

### 2.2 에러 분류 / 재시도 정책

- **Q-RETRY-1** 3xx 응답의 분류
  - Options:
    (a) `NonRetriableError` (자동 리다이렉트 미수행)
    (b) 자동 1회 리다이렉트
  - Provisional: **(a)** — 보수적. SSRF/체인 우려.

- **Q-RETRY-2** 408 Request Timeout, 425 Too Early, 429 Too Many Requests의 분류
  - Options:
    (a) 모두 `RetriableError`
    (b) 408/425만 retriable, 429는 별도 정책 (Retry-After 헤더 존중)
  - Provisional: **(a)** — 단순. 429의 Retry-After 존중은 후속 개선.

- **Q-RETRY-3** 백오프 jitter 적용 여부
  - Options:
    (a) BullMQ 기본 지수 백오프만
    (b) jitter(±랜덤) 추가
  - Provisional: **(a)** — 결정론적 테스트 우선.

### 2.3 DLQ / 회수

- **Q-DLQ-1** DLQ 재투입 인터페이스 스텁을 본 단계에서 둘지
  - Options:
    (a) 두지 않음 (격리만)
    (b) 스텁 함수만 두기 (미구현 표시)
  - Provisional: **(a)** — "있으면 좋을 것 같은" 코드 금지 원칙.

- **Q-STALL-1** `STALLED_INTERVAL_MS` 기본값 (운영 vs 테스트 분리)
  - Options:
    (a) 운영 기본 30s, 테스트는 환경변수로 단축
    (b) 운영 기본 60s, 테스트는 별도 옵션 주입
  - Provisional: **(a)**.

### 2.4 보안 / SSRF / 시크릿

- **Q-SEC-1** SSRF 방어 (private CIDR/localhost 차단)
  - Options:
    (a) 차단하지 않음 (데모가 `localhost:3000` 수신자를 쓰므로 필수 예외)
    (b) 환경변수로 차단 ON/OFF (`ALLOW_PRIVATE_TARGETS`, 기본 `true`)
    (c) 차단 ON 기본, 데모는 별도 우회 경로
  - Provisional: **(b)**.

- **Q-SEC-2** HMAC 서명에 timestamp/nonce 추가 (replay 방어)
  - Options:
    (a) 본 단계 미적용 (단순 본문 HMAC만)
    (b) 헤더에 `X-Webhook-Timestamp` 추가, 서명 대상에 포함
  - Provisional: **(a)** — 본 PRD 범위.

- **Q-SEC-3** 시크릿 최소 길이/엔트로피
  - Options:
    (a) 최소 32 bytes
    (b) 최소 16 bytes
  - Provisional: **(a)**.

- **Q-SEC-4** 셧다운 강제 종료 시 exit code
  - Options:
    (a) `0` (정상 종료의 일부로 간주)
    (b) `1` (잔여 작업이 있었음을 신호)
  - Provisional: **(b)** — 모니터링과의 신호 일치성.

- **Q-SEC-5** `/healthz`의 degraded 표현
  - Options:
    (a) Redis 끊김 시 `503`
    (b) `200`에 `{ status: "degraded" }`
  - Provisional: **(a)**.

- **Q-SEC-6** 시크릿 자동 마스킹 도입 시점
  - Options:
    (a) 본 PRD에서는 정책만, 자동 마스킹은 후속 PRD
    (b) 본 PRD에서 마스킹 유틸리티 포함
  - Provisional: **(a)**.

### 2.5 아키텍처 / 의존성

- **Q-ARCH-1** HTTP 클라이언트 선택
  - Options:
    (a) Node 내장 `fetch`(undici) 사용 — 새 의존성 없음
    (b) `undici`를 명시적 의존성으로 추가
  - Provisional: **(a)** — CLAUDE.md §2 정책상 새 의존성 추가는 금지.

- **Q-ARCH-2** 의존 방향 검증 수단
  - Options:
    (a) eslint-plugin-import 규칙
    (b) 자체 grep/스크립트 + CI step
    (c) 단순 통합 테스트 한 건
  - Provisional: **(c)** — 새 의존성 없이 최소 비용.

- **Q-ARCH-3** `core/metrics.ts`를 본 PRD 범위에서 어디까지 둘지
  - Options:
    (a) 빈 파일/타입 인터페이스만
    (b) prom-client import도 본 단계에서 도입
  - Provisional: **(a)** — 3단계 PRD가 형태를 결정한다.

- **Q-ARCH-4** core 핸들러 시그니처 제네릭화 범위
  - Options:
    (a) `<TData>` 1개 제네릭 (페이로드 타입)
    (b) `<TData, TResult>` 2개
  - Provisional: **(a)**.

### 2.6 운영 / 테스트 인프라

- **Q-OPS-1** Testcontainers의 컨테이너 기동 시간이 CI에서 임계가 될 경우
  - Options:
    (a) GitHub Actions service container(docker-in-docker) 활용
    (b) 통합 테스트만 별도 CI 잡으로 분리
  - Provisional: **(b)**.

- **Q-OPS-2** SIGTERM 핸들링 통합 테스트의 워커 실행 형태
  - Options:
    (a) 동일 프로세스 내 워커 인스턴스 + 종료 시뮬레이션
    (b) 자식 프로세스로 실제 SIGTERM 전송
  - Provisional: **(b)** — 진짜 시그널을 검증.

## 3. 임의 결정을 피한 운영 규칙

- 위 Provisional은 어디까지나 **임시 가정**이다. PLAN 단계 진입 전에 사람이 각 항목을 확정한다.
- 위에 없는 새 결정이 필요해지면, **임의로 정하지 않고** 본 문서에 새 Q-#를 추가한다.
- 본 문서의 항목을 PLAN 단계에서 확정한 뒤에는, 관련 PRD 문서(`00`~`06`)에 결정 결과를 반영하고
  본 문서에서는 "Resolved (PLAN 단계에서 확정: ...)"로 표기한다.

## 4. 다음 단계

1. 위 오픈 퀘스천을 사람이 한 번에 검토하고 확정.
2. 확정 내용을 관련 PRD에 반영.
3. [`03-test-strategy.md`](./03-test-strategy.md)의 7개 시나리오에 대해 **실패하는 테스트**를 먼저 작성.
4. 테스트를 통과시키는 최소 구현 작성 (PLAN 단계의 첫 산출물).
