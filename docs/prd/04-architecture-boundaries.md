# 04. Architecture Boundaries — `core` vs `demo`, 데이터 흐름

> 담당 페르소나: **Architect**
> 본 문서는 폴더 경계와 의존 방향, 데이터 흐름을 PRD 관점에서 못 박는다.
> CLAUDE.md §3과 충돌해선 안 된다.
> 구현 코드는 본 PRD가 승인된 뒤 **후속 PLAN 단계**에서 작성한다.
>
> **AI 협업 5원칙(CLAUDE.md §7) 적용:** 도메인 경계 위반 코드를 발견하면 임의로 수정하지 않고 사람에게 보고한다(원칙 5). 범위 외 추상화(여러 도메인 일반화 등)는 추가하지 않는다(원칙 3).

## 1. 컨텍스트 / 배경

본 프로젝트의 핵심 설계 결정 중 하나는:

> **`core` 패키지는 도메인(웹훅)에 의존하지 않는다.** 웹훅 관련 로직은 전부 `demo`에 둔다.

이 경계가 흐려지면 다음과 같은 문제가 생긴다:

- "큐를 다른 도메인에 쓰자"는 후속 시도가 불가능해진다.
- 부록 트랙(streams-internals)이 메인 트랙 추상화와 비교 가능한 형태로 발전할 수 없다.
- 테스트가 도메인 로직과 큐 로직을 함께 검증하게 되어 회귀 추적이 어려워진다.

본 PRD는 이 경계를 **불변식 수준**에서 강제한다.

## 2. 목표 (Goals)

- **G4.1** `core` 패키지가 도메인 식별자를 갖지 않는다 (`webhook`, `http`, `fastify` 등).
- **G4.2** 의존 방향은 **단방향**이다: `demo` → `core`. 역방향 임포트 금지.
- **G4.3** `core`가 노출하는 인터페이스는 도메인 무관한 큐/워커/재시도/DLQ/셧다운 추상화로 한정된다.
- **G4.4** 모든 환경변수·HTTP 라우트·웹훅 도메인 타입은 `demo`에만 존재한다.

## 3. 비목표 (Non-Goals)

- **N4.1** `core`를 별도 npm 패키지로 퍼블리시 (모노레포 내 워크스페이스로 충분).
- **N4.2** `core`를 멀티 도메인(여러 작업 종류) 지원하도록 일반화. 본 PRD는 **하나의 도메인이 들어가도 깔끔하게 분리되는 구조**까지만 보장.
- **N4.3** 플러그인 시스템·런타임 디스커버리. 모두 컴파일-타임 의존이다.

## 4. 폴더 구조 (CLAUDE.md §3과 동일)

```
.
├── packages/
│   ├── core/                   # 도메인 비의존 큐 추상화
│   │   ├── src/
│   │   │   ├── queue.ts         # 큐 정의·연결 관리 (BullMQ 래핑)
│   │   │   ├── producer.ts      # 작업 등록 + 멱등성 키 인터페이스
│   │   │   ├── worker.ts        # 워커 + 핸들러 실행 (핸들러는 외부 주입)
│   │   │   ├── retry.ts         # 백오프 정책 + DLQ 이동
│   │   │   ├── metrics.ts       # prom-client 정의 (정의만, 노출은 3단계)
│   │   │   ├── shutdown.ts      # 그레이스풀 셧다운
│   │   │   └── errors.ts        # RetriableError / NonRetriableError
│   │   └── test/
│   ├── demo/                    # 웹훅 도메인 + Fastify + 대시보드
│   │   ├── src/
│   │   │   ├── api/             # Fastify 라우트 (POST /webhooks, /_demo/receiver, /dashboard)
│   │   │   ├── handlers/        # webhook-delivery 핸들러 (core/worker에 주입)
│   │   │   ├── receiver/        # 데모 수신 엔드포인트 저장소
│   │   │   ├── domain/          # WebhookDeliveryError, 스키마(Zod), HMAC
│   │   │   ├── config.ts        # 환경변수 파싱(Zod)
│   │   │   ├── constants.ts     # 큐 이름·DLQ 이름·라우트 경로 상수
│   │   │   └── chaos.ts         # 장애 주입 (2단계 셧다운 테스트용)
│   │   └── test/
│   └── streams-internals/       # [부록 트랙 자리, 본 PRD 범위 밖 — 비어 있음]
├── docker/
├── docker-compose.yml
├── CLAUDE.md
├── README.md
└── docs/prd/                    # 본 PRD 묶음
```

> `core/metrics.ts`는 본 PRD 범위에서 **정의만** 두고 외부에 노출하지 않는다. 실제 Prometheus
> 노출과 Grafana 연동은 3단계.

## 5. 의존 방향과 금지 사항

- **허용:**
  - `demo/**` → `core/**`
  - `demo/**` 내부 임포트
  - `core/**` 내부 임포트
  - 두 패키지 → 외부 라이브러리(BullMQ, ioredis, Fastify, Zod 등 §CLAUDE.md§2 고정 스택)
- **금지:**
  - `core/**` → `demo/**` (역방향 임포트 금지)
  - `core/**` → 도메인 식별자(`webhook`, `http`, `fastify`)를 포함하는 모든 심볼
  - 두 패키지 → `streams-internals/**` (부록 트랙 격리)
  - 새 의존성 추가 (CLAUDE.md §2). 추가가 필요하면 `07`의 오픈 퀘스천에 사유와 함께 기록.

## 6. 데이터 흐름 (ASCII)

### 6.1 1단계 해피패스

```
   ┌──────────┐                                   ┌────────────────┐
   │ Client   │  ① POST /webhooks (Zod 검증)      │ Demo Receiver  │
   │ (curl)   │ ────────────────────────────┐     │ /_demo/receiver│
   └──────────┘                              │     └────────┬───────┘
                                             ▼              ▲
                                    ┌─────────────────┐     │ ⑤ HTTP POST
                                    │ demo/api        │     │
                                    │ POST /webhooks  │     │
                                    └────────┬────────┘     │
                                             │ ② core.producer.add
                                             ▼              │
                                    ┌─────────────────┐     │
                                    │ core/queue      │     │
                                    │ (BullMQ Queue)  │     │
                                    └────────┬────────┘     │
                                             │ Redis        │
                                             ▼              │
                                    ┌─────────────────┐     │
                                    │ core/worker     │     │
                                    │ + demo/handlers │─────┘
                                    │ webhook-delivery│ ④ 실제 HTTP 전송
                                    └─────────────────┘
                                             │
                                             │ ⑥ 결과를 BullMQ 상태에 반영 (completed/failed)
                                             ▼
                                    ┌─────────────────┐
                                    │ /dashboard      │  ⑦ 카운터 표시
                                    │ (demo/api)      │
                                    └─────────────────┘
```

### 6.2 2단계 에러 분류와 DLQ

```
                   ┌───────────────────────┐
                   │ demo/handlers         │
                   │ webhook-delivery      │
                   └──────────┬────────────┘
                              │
              HTTP 응답/네트워크 결과
                              │
              ┌───────────────┴───────────────┐
              ▼                                ▼
     ┌──────────────────┐              ┌──────────────────┐
     │ NonRetriableError│              │ RetriableError   │
     │ (4xx 등)         │              │ (5xx/timeout 등) │
     └─────────┬────────┘              └─────────┬────────┘
               │                                  │
               │                       core/worker가 throw → BullMQ 재시도
               │                                  │
               │                       지수 백오프, attempts 누적
               │                                  │
               │                                  ▼
               │                          attempts 초과?
               │                            ┌─────┴─────┐
               │                            │ no        │ yes
               │                            ▼           ▼
               │                         재시도      ┌──────┐
               └────────────────────────────────────►│ DLQ  │
                                                     │ 큐    │
                                                     └──────┘
```

### 6.3 2단계 Stalled-job 회수

```
   Worker A          Worker B          BullMQ/Redis
     │                  │                  │
     │  pick job J  ────┼────────────────► │  (active: J 잡힘)
     │                  │                  │
     │  SIGKILL ✗       │                  │
                        │                  │
                        │   poll/heartbeat │
                        │ ◄──────────────► │
                        │                  │  stalledInterval 경과
                        │                  │  → J를 다시 waiting으로
                        │                  │
                        │  pick job J ────►│
                        │  처리 완료       │
                        └─►(completed) ───►│
```

## 7. 인터페이스 책임 분담 (요약 표)

| 책임 | 위치 | 비고 |
|------|------|------|
| BullMQ Queue/Worker 생성·옵션 | `core/queue.ts`, `core/worker.ts` | 도메인 식별자 금지 |
| 멱등성 키 인터페이스 (`jobId`) | `core/producer.ts` | 정책 결정은 `demo` |
| 재시도 횟수·백오프 옵션의 **수치 결정** | `demo/config.ts` (환경변수) → `core`로 주입 | 기본값은 `core`에 있을 수 있으나 도메인 식별자 금지 |
| 에러 분류 (`RetriableError` / `NonRetriableError`) | 추상 클래스: `core/errors.ts`. 도메인 매핑: `demo/handlers/*` | |
| HTTP 라우트 | `demo/api/**` | |
| 데모 수신자, 대시보드 | `demo/api/**`, `demo/receiver/**` | |
| HMAC 서명 | `demo/domain/*` | 시크릿은 환경변수 → `demo/config` |
| 셧다운 시퀀스 | `core/shutdown.ts` | 시그널 핸들러 등록은 `demo`의 부트스트랩에서 호출 |
| 환경변수 정의/파싱 | `demo/config.ts` | `core`는 환경변수를 직접 읽지 않는다 |
| 메트릭 정의(정의만) | `core/metrics.ts` | 실제 노출은 3단계 |

## 7-A. 구현 규약 (CLAUDE.md §4의 PRD 요구사항화)

본 PRD는 다음 코딩 컨벤션을 **요구사항**으로 강제한다. PLAN 단계에서 작성될 모든 코드는 이를
충족해야 한다.

- **TypeScript strict.** `tsconfig`는 `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`를 켠다.
- **`any` 금지.** 불가피할 때는 `unknown` + 타입 가드로 처리한다.
- **공개 함수는 명시적 반환 타입.**
- **경계에서 Zod 파싱.** HTTP body, 환경변수, Redis에서 읽은 페이로드는 Zod 스키마를 통과해야 한다.
- **에러 분류 명시.** `RetriableError` / `NonRetriableError`를 구분한다. 조용한 `catch {}` 금지.
- **구조화 로깅.** `jobId`, `attempt`, `idempotencyKey`를 컨텍스트에 포함한다. 시크릿은 로그 금지.
- **Floating promise 금지.** 모든 Promise는 await하거나 의도적으로 처리한다. ESLint `no-floating-promises` 권장(설정 결정은 PLAN 단계).
- **공유 상태는 Redis에.** 워커 인메모리 상태에 의존하지 않는다. 워커는 언제든 죽고 재시작될 수 있다.
- **네이밍.** 파일 `kebab-case.ts`, 타입/클래스 `PascalCase`, 함수/변수 `camelCase`, 상수 `UPPER_SNAKE_CASE`. 큐/작업 이름은 `constants.ts`로 모은다.

> 본 규약은 모든 PRD 문서의 수용 기준의 **묵시적 전제**다. 다른 문서에서 명시되지 않더라도 본 항목을 위반하면 안 된다.

## 8. 수용 기준 (Acceptance Criteria)

- **AC4.1** `core/**` 소스에 `webhook`/`http`/`fastify`/`Payload`/`URL` 같은 도메인 식별자가 grep으로 검출되지 않는다.
- **AC4.2** `core/**`가 `demo/**`를 임포트하는 경로가 정적으로 0개다.
- **AC4.3** 의존 방향 위반은 lint/test 단계에서 검출된다 (구체 수단은 PLAN 단계 결정 — eslint-plugin-import 또는 자체 grep 스크립트).
- **AC4.4** `packages/streams-internals/**`는 본 PRD 범위에서 어떤 임포트/참조도 생성하지 않는다.

## 9. 불변식 (Invariants)

- **I4.1 (단방향)** `core` → `demo`로의 import는 **언제나** 존재하지 않는다.
- **I4.2 (도메인 격리)** `core`의 공개 API 시그니처는 도메인 타입을 노출하지 않는다.
- **I4.3 (부록 트랙 격리)** 메인 트랙 코드가 부록 트랙을 import 하지 않는다.

## 10. 리스크 / 오픈 퀘스천

- **R4.1** core가 노출하는 핸들러 시그니처의 제네릭 형태 — 어디까지 일반화할 것인가 → `07`.
- **R4.2** 의존 방향 검증을 lint 룰로 강제할지, 테스트 스크립트로 할지 → `07`.
- **R4.3** `core/metrics.ts`를 본 PRD 범위에서 어디까지 정의해 둘지 (정의만? 인터페이스만?) → `07`.

> **참고:** 구현 코드는 본 PRD가 승인된 뒤 PLAN 단계에서 작성한다. 본 문서의 의존 방향과
> 인터페이스 책임은 PLAN의 첫 산출물(인터페이스 정의)의 입력이다.
