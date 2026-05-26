# 09. Cross-Cutting Concerns — 횡단 관심사

> 본 문서는 특정 마일스톤에 귀속되지 않고 **여러 마일스톤에 걸쳐 일관되게 적용**되어야 하는 정책을 모은다.
> 각 항목은 "어느 마일스톤에서 처음 도입되는가"를 표로 명시한다.
>
> **AI 협업 5원칙 적용:** 본 문서의 정책은 CLAUDE.md §4, §8과 PRD `04`/`05`/`06`의 규약을 PLAN 수준으로 풀어 적은 것. **임의 결정을 더하지 않는다.** 모호 사항은 `00-decisions-needed.md`로 보낸다.

---

## 1. 구조화 로깅 (Structured Logging)

### 정책 (PRD `05` §9)

| 필드 | 1단계(M2) | 2단계(M3~M7) | 비고 |
|------|---|---|------|
| `requestId` | ✅ | ✅ | API 요청 단위. Fastify의 `request.id` 활용 또는 자체 UUID. |
| `jobId` | ✅ | ✅ | BullMQ 작업 ID. M3 이후 `idempotencyKey`와 동일. |
| `idempotencyKey` | (수집만) | ✅ | M3에서 필수 컨텍스트로 격상. |
| `attempt` | — | ✅ | M4에서 도입(워커 시도 번호). |
| `errorClass` | — | ✅ | M4에서 도입. `RetriableError` / `NonRetriableError` / `WebhookDeliveryError`. |
| `httpStatus` | — | ✅ | M4에서 도입. 외부 응답 상태. |
| `queueName` | ✅ | ✅ | 큐/DLQ 분리(M5 이후). |
| `durationMs` | (선택) | (선택) | 처리 소요. 권장 도입은 M4. |

### 도입 시점 매트릭스

| 마일스톤 | 도입 항목 |
|---------|-----------|
| **M2** | `requestId`, `jobId`, `queueName` 기본 컨텍스트. 시크릿 출력 금지 정책 명시(코드 리뷰 가드). |
| **M3** | `idempotencyKey` 필수화. |
| **M4** | `attempt`, `errorClass`, `httpStatus`. 분류 결과 로그. |
| **M5** | DLQ 이동 시 별도 로그 이벤트(`queueName = DLQ_NAME`). |
| **M6** | 회수된 작업 처리 시 컨텍스트 일치 검증. |
| **M7** | 셧다운 진행 단계별 로그(시퀀스 1~6). 잔여 작업 ID 목록 로그. |

### 도구 결정 (PLAN 권장)
- 별도 로깅 라이브러리(`pino`, `winston`) 도입을 **본 PLAN 범위에서는 보류**. CLAUDE.md §2 고정 스택에 로깅 라이브러리가 명시되지 않았으므로, 신규 의존성은 사람의 결정이 필요하다.
  - **잠정 권장:** Fastify의 내장 로깅(pino 기반)을 활용. Fastify 의존성 안에 이미 포함되어 있어 새 의존성 0건.
  - 워커 측 로그도 같은 logger 인스턴스를 주입받아 사용.
- 시크릿 자동 마스킹은 Q-SEC-6에 따름(권장 (a) — 본 PRD는 정책만, 자동화는 후속).

### 금지 사항
- `WEBHOOK_HMAC_SECRET` 값, `headers.Authorization`, 요청 본문 전체를 로그에 남기지 않는다(PRD `05` §9 금지 사항).
- `debug` 레벨에서도 페이로드 전체 덤프는 마스킹 권장(본 PLAN은 의무화하지 않음 — Q-SEC-6 결정 의존).

---

## 2. Zod 경계 파싱 (Boundary Validation)

### 적용 지점 (PRD `04` §7-A, `05` §1)

| 경계 | 도입 시점 | 책임 모듈 |
|------|-----------|-----------|
| HTTP 요청 본문 (`POST /webhooks`) | M2 | `demo/domain/schemas.ts::WebhookCreateRequestSchema` |
| HTTP 요청 본문 (`POST /_demo/receiver`) | M2 | `demo/api/receiver.ts` 내 Zod (수신만 — payload는 임의 JSON 허용) |
| 환경변수 | M2 | `demo/config.ts` |
| Redis에서 꺼낸 작업 페이로드 | M2 | `demo/handlers/webhook-delivery.ts`에서 `WebhookJobDataSchema`로 재검증 |
| `idempotencyKey` 형식 검증 | M3 | `demo/domain/idempotency-key.ts` (Zod refine + 순수 함수) |
| 분류 함수 입력 | M4 | `demo/handlers/classify-error.ts`는 내부 타입만 사용 — 외부 입력 없음 |
| DLQ 엔트리 데이터 | M5 | DLQ에서 꺼낼 때 별도 스키마(`DlqJobDataSchema`)로 재검증 — `core` 측은 제네릭 유지, `demo` 측에서 검증 |

### 규칙
- 경계 통과 전엔 모든 외부 입력이 `unknown`(I5.1).
- `any` 금지(`unknown` + 타입 가드)(CLAUDE.md §4).
- Zod 스키마는 `demo/domain/**` 또는 `demo/config.ts`에 단일 출처(AC5.1).
- `core`는 Zod에 직접 의존하지 않는다 — `demo`가 파싱한 결과(이미 타입 안전)를 `core`에 넘긴다. `core/package.json`의 dependencies에 `zod`를 추가하지 않는다.

---

## 3. HMAC 서명 위치 (PRD `06` §2)

### 정책
- **알고리즘:** HMAC-SHA256.
- **시크릿:** `WEBHOOK_HMAC_SECRET` 환경변수. 32 bytes 이상(Q-SEC-3 (a)).
- **헤더:** `WEBHOOK_HMAC_HEADER` (기본 `X-Webhook-Signature`)에 `sha256=<hex>` 형식.
- **서명 대상:** 직렬화된 JSON 페이로드의 raw bytes.
- **결정성:** 같은 페이로드/시크릿 → 같은 서명. 재시도 시에도 동일(Q-SEC-2 (a)).
- **금지:** 시크릿을 큐 페이로드에 저장하지 않는다(PRD `05` §7). 워커가 환경변수에서 직접 읽어 송신 직전에 서명.

### 도입 시점
| 마일스톤 | 작업 |
|---------|------|
| M2 | `WEBHOOK_HMAC_SECRET` 환경변수 fail-fast 검증만(미사용이어도 부재 시 종료). |
| M4 | `demo/domain/hmac.ts` 작성 + 송신 직전 헤더 부착 + `UT-6` 결정성 단위 테스트. |
| M5~M7 | 변경 없음(M4의 동작 유지). |

### 검증
- UT-6 (M4)에서 결정성 + 형식 단언.
- 통합 테스트에서는 outgoing 헤더에 `sha256=`이 등장하는지 형식 단언만(데모 수신자가 검증할 의무 없음).

---

## 4. 시크릿 / 타임아웃 / 외부 호출 정책

### 시크릿
- 모든 시크릿은 환경변수로만 주입(CLAUDE.md §8, PRD `06` §4).
- `.env.example`로 키만 문서화. 실제 값 커밋 금지.
- `WEBHOOK_HMAC_SECRET`:
  - 부재 → 부트스트랩 즉시 종료.
  - 32 bytes 미만(Q-SEC-3 (a)) → 동일.
- 시크릿이 로그/에러/메트릭/응답/큐 페이로드 어디에도 등장하지 않음(I6.1).

### 타임아웃
- 외부 송신: `WEBHOOK_DELIVERY_TIMEOUT_MS` (기본 5000ms). `AbortController` 사용.
- M2부터 적용. AC6.1.

### SSRF (Q-SEC-1 권장 (b))
- `ALLOW_PRIVATE_TARGETS=true` 기본. 데모가 `localhost:3000`을 수신자로 쓰므로 데모 동작 보장.
- `false` 설정 시 private CIDR/localhost 호스트 거부 → `NonRetriableError` throw.
- 도입 시점: M2(`deliver.ts` 작성 시점).

### Redirect
- 자동 따라가지 않거나 최대 1회. 본 PLAN 권장: **자동 follow 비활성화**(보수적). 3xx는 분류 함수에서 `NonRetriableError`(Q-RETRY-1 (a))로 처리.
- 도입 시점: M2(`deliver.ts`에서 `redirect: 'manual'` 또는 동등 설정).

---

## 5. Redis 재연결 백오프 (PRD `06` §5)

### 정책
- ioredis 옵션으로 지수 백오프 구현. 무한 즉시 재시도 금지.
- `REDIS_RECONNECT_BASE_MS` (기본 200ms), `REDIS_RECONNECT_MAX_MS` (기본 10s).
- 재연결 실패 로그의 폭주를 막기 위해 throttling 권장(실 구현 형태는 PLAN 단계 결정 — 본 PLAN 권장: 처음 1회 + 매 30초마다 1회만 출력).

### 도입 시점
| 마일스톤 | 작업 |
|---------|------|
| M2 | `core/queue.ts::createConnection`에서 ioredis `retryStrategy` 옵션 적용. |
| M4 이후 | 변경 없음. |

### 검증
- 본 PLAN은 통합 테스트로 검증하지 않는다(Testcontainers Redis는 안정적이라 의도적 단절 시뮬레이션이 어렵다). 코드 리뷰 단계에서 옵션 적용 여부만 확인.
- PRD `06` §AC6.3은 "1초 이내에 수십 번 재시도하는 일이 없다"인데, 본 PLAN 범위에서는 정적 코드 리뷰로 대체. 통합 테스트는 후속 PRD 또는 카오스 테스트(범위 외)에서 다룬다.

---

## 6. 도메인 경계 가드 (CLAUDE.md §3, PRD `04`)

### 정책
- `core/**`에 도메인 식별자(`webhook`, `fastify`, `_demo`, `Payload`(데이터 식별자), `http`(코드 식별자 — 라이브러리 모듈 이름 `node:http`/`http` 임포트는 별도 정책 결정 필요))가 등장하지 않는다.
- `core/**` → `demo/**` 임포트 0건.
- `streams-internals/**` 격리(부록 트랙).

### 검증
- `IT-R1-domain-boundary` 통합 테스트(M1에서 도입). Q-ARCH-2 (c) 채택 시 본 테스트가 유일한 검증.
- 모든 마일스톤 PR에서 `IT-R1` 그린이 필수(회귀 점검).

### `http` 토큰 관련 주의
- `core`에서 외부 HTTP 호출을 하지 않는다(M2의 `deliver.ts`는 `demo`에 위치 — 도메인 책임).
- `core/queue.ts`가 Redis URL을 다룰 때 `http`라는 단어가 등장할 가능성은 없다(`redis://` 또는 `rediss://` 사용).
- 본 PLAN의 `IT-R1`은 `http`를 식별자 토큰으로 검사하되, `node:http`나 라이브러리 import 문자열은 예외 처리(테스트 코드 안에서 정확히 정의 — `BANNED_TOKENS = ['webhook', 'fastify', '_demo', 'Payload']`로 시작하고, `http`는 일단 빼는 것을 권장. PRD `04` AC4.1이 `http`를 포함하지만 라이브러리 import와 충돌할 수 있어 본 PLAN은 보수적 시작 권장. **이 결정은 사람 검토 필요** — `00`에 새 Q로 추가 검토 필요할 수 있음).

> **PRD 변경 제안:** PRD `04` AC4.1의 grep 토큰 목록을 명확히 정의(`http` 포함 여부). 본 PLAN의 잠정은 `webhook`, `fastify`, `_demo`, `Payload`로 시작.

---

## 7. Floating Promise / 동시성 정책 (CLAUDE.md §4)

- 모든 Promise는 await 또는 의도적 처리(`.catch(...)` 또는 명시적 로그).
- `core/worker.ts`가 BullMQ 콜백을 등록할 때 미처리 Promise가 떠 있지 않도록 주의.
- ESLint `no-floating-promises` 도입 여부는 본 PLAN 범위 외(새 의존성). 코드 리뷰 시 사람이 가드.

---

## 8. 단위 vs 통합 테스트 격리 (CLAUDE.md §5, PRD `03`)

- 단위 테스트(`*.unit.test.ts`)는 Redis 없이 실행. Vitest 기본 환경.
- 통합 테스트(`*.integration.test.ts`)는 Testcontainers로 실제 Redis. 각 테스트마다 고유 큐 이름/prefix(uuid 기반).
- `ioredis-mock` 등 Redis 모킹 라이브러리 사용 금지(PRD `03` §6).
- fake timer 사용 시 BullMQ 내부와의 상호작용을 검증(M4 §8 메모 참조).

---

## 9. 매직 스트링 금지 (CLAUDE.md §4 네이밍)

- 큐 이름, DLQ 이름, 라우트 경로, 헤더 이름 등은 모두 `demo/src/constants.ts`에 정의.
- 환경변수 키는 `demo/src/config.ts`의 Zod 스키마 키 이름이 단일 출처.
- `core`는 상수를 인자로 받는다(직접 정의하지 않는다).

---

## 10. 마일스톤별 횡단 적용 점검 체크리스트

각 마일스톤 PR 종료 직전에 본 체크리스트로 자체 검수.

- [ ] 구조화 로깅의 해당 마일스톤 필드가 모두 등장하는가
- [ ] 모든 외부 입력이 Zod로 파싱되는가
- [ ] 시크릿이 코드/로그/응답 어디에도 등장하지 않는가
- [ ] 외부 송신 코드에 타임아웃이 적용되는가
- [ ] Redis 연결에 재연결 백오프가 적용되어 있는가
- [ ] `IT-R1-domain-boundary` 그린인가
- [ ] 새 의존성을 추가했다면 정당성이 커밋 메시지에 명시되어 있는가
- [ ] 매직 스트링이 `constants.ts`/`config.ts` 외부에 등장하지 않는가

---

## 11. 본 문서가 다루지 않는 것 (범위 외)

- Prometheus 메트릭 노출, Grafana 대시보드 — 3단계 PRD.
- 부하 측정, p50/p99 — 4단계 PRD.
- 시크릿 자동 마스킹 유틸리티 — Q-SEC-6 (a) 채택 시 후속 PRD.
- 로깅 라이브러리 도입 변경 — 본 PLAN은 Fastify 내장 pino를 활용.
