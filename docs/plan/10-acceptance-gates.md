# 10. Acceptance Gates — 마일스톤별 Exit Gate 체크리스트

> 본 문서는 각 마일스톤이 끝나는 시점에 사람이 PR을 닫기 전 확인해야 할 **Done Gate**를 단일 출처로 모은다.
>
> **운영 규칙:** 본 체크리스트의 모든 항목이 통과되지 않으면 다음 마일스톤으로 진입하지 않는다. 회귀가 발생하면 이전 마일스톤의 게이트로 되돌아간다.

---

## 0. 전 마일스톤 공통 게이트 (모든 PR에 적용)

각 마일스톤이 닫히기 전에 **공통으로** 통과해야 한다.

- [ ] `pnpm install`이 0 에러
- [ ] `pnpm typecheck` 0 에러(모든 패키지)
- [ ] `pnpm test:unit` 그린
- [ ] `pnpm test:integration` 그린
- [ ] `IT-R1-domain-boundary` 그린
- [ ] `core/**` grep: 도메인 식별자(`webhook`, `fastify`, `_demo`, `Payload`) 0건
- [ ] 새 의존성을 추가했다면 정당성이 커밋 메시지에 명시되어 있고, CLAUDE.md §2 고정 스택 내에 속한다
- [ ] Conventional Commits 형식의 커밋 메시지(원자적, 관심사 분리)
- [ ] 매직 스트링 0건(`constants.ts`/`config.ts` 외부)
- [ ] `streams-internals/**`에 변경 0건
- [ ] PRD/CLAUDE.md/README.md를 수정하지 않음(필요 시 별도 PR — PLAN 단계에서는 PRD 변경 금지)

---

## 1. M1 — Bootstrap

### 통과 조건
- [ ] `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `vitest.config.ts`, `.env.example`, `docker-compose.yml` 모두 존재
- [ ] `packages/core/`, `packages/demo/`, `packages/streams-internals/` 디렉터리 생성
- [ ] `core` 빈 모듈(`queue/producer/worker/retry/shutdown/errors/metrics`) 모두 존재(빈 export OK)
- [ ] `demo` 빈 모듈(`api/handlers/receiver/domain/config/constants/chaos`) 모두 존재
- [ ] `IT-R1-domain-boundary` 통합 테스트 도입(처음에는 그린)
- [ ] `docker compose config` 유효(`redis` 서비스만)
- [ ] `.env.example`이 PRD `05` §8 키를 모두 포함

### 데모 동작 가능 상태
- 코드가 없으므로 "동작 가능"은 **빌드/테스트 그린**으로 정의(CLAUDE.md §6 해석).

### 회귀 보호
- 없음 — 본 마일스톤이 첫 마일스톤.

---

## 2. M2 — MVP (해피패스)

### 통과 조건
- [ ] `UT-3` (요청 Zod) 그린
- [ ] `UT-4` (환경변수 Zod) 그린
- [ ] `IT-S1-happy-path` 그린
- [ ] `POST /webhooks`가 `202` + `jobId` 반환
- [ ] `_demo/receiver`가 페이로드 수신(로그/메모리로 확인)
- [ ] `GET /dashboard`가 `waiting/active/completed/failed/delayed` 카운터 표시
- [ ] `GET /api/queue/stats`가 JSON 반환
- [ ] `GET /healthz`가 Redis 끊김 시 `503` (Q-SEC-5 (a))
- [ ] 잘못된 본문에 `400` + PRD `05` §4.4 형식의 에러 응답
- [ ] 외부 송신에 `AbortController` 타임아웃 적용(AC6.1)
- [ ] 시크릿 미설정 또는 32 bytes 미만 → 부트스트랩 종료, 에러 메시지에 시크릿 값 미등장 (AC6.2)
- [ ] SSRF 토글(`ALLOW_PRIVATE_TARGETS`) 환경변수 작동

### 데모 동작 가능 상태
- `docker compose up` 후 README의 `curl` 명령이 그대로 동작.
- 사람이 30분 안에 데모 검증 가능.

### 회귀 보호
- `IT-R1` 그린.

---

## 3. M3 — Idempotency

### 통과 조건
- [ ] `UT-5` (멱등성 키 정합성) 그린
- [ ] `IT-S2-idempotency` 그린: 동시 3회 등록 시 핸들러 호출 1회, 수신자 수신 1회, 응답 jobId 동일
- [ ] `idempotencyKey` 누락 요청 → `400` (AC2.2)
- [ ] BullMQ `jobId`로 멱등성 흡수 — 자체 키 저장소 미사용 (F2.1)
- [ ] 로그 컨텍스트에 `idempotencyKey` 등장

### 데모 동작 가능 상태
- M2 + 동일 키 중복 등록이 한 번만 처리됨.

### 회귀 보호
- M2의 모든 게이트 통과(`IT-S1`, UT-3, UT-4 그린).
- `IT-R1` 그린.

---

## 4. M4 — Retry & Classification (+ HMAC)

### 통과 조건
- [ ] `UT-1` (백오프 계산) 그린
- [ ] `UT-2` (에러 분류) 그린
- [ ] `UT-6` (HMAC 결정성) 그린
- [ ] `IT-S3-retriable-backoff` 그린: 5xx → 백오프 재시도 → `completed`, attemptsMade 단계 증가
- [ ] `IT-S5-non-retriable-immediate-dlq` (M4 버전) 그린: 4xx → `failed`, attemptsMade==1, 추가 호출 없음
- [ ] HMAC 서명 헤더가 outgoing에 부착됨(`sha256=` 형식 단언)
- [ ] 분류 함수의 매핑 규칙이 Q-RETRY-1/2 결정과 일치
- [ ] `core/retry.ts`에 도메인 식별자 0건 (AC2.4)

### 데모 동작 가능 상태
- M3 + 5xx 수신자에 대해 지수 백오프로 재시도. 4xx는 즉시 실패. HMAC 헤더 부착.

### 회귀 보호
- M2, M3의 모든 게이트 통과.
- `IT-R1` 그린.

---

## 5. M5 — DLQ

### 통과 조건
- [ ] `IT-S4-max-attempts-dlq` 그린: 재시도 초과 → DLQ 큐 적재, 원 큐 없음
- [ ] `IT-S5` 강화 그린: 4xx → DLQ 큐 적재
- [ ] DLQ 작업에서 페이로드 + 마지막 에러 컨텍스트(분류, HTTP 상태, attempts) 조회 가능 (AC2.3)
- [ ] `GET /api/queue/stats`에 `dlq` 카운터 추가
- [ ] DLQ 자동 재투입 미구현 (Q-DLQ-1 (a))
- [ ] `core/dlq.ts`에 도메인 식별자 0건

### 데모 동작 가능 상태
- M4 + DLQ로 격리. 대시보드에 `dlq` 카운터 표시.

### 회귀 보호
- M2~M4의 모든 게이트 통과(`IT-S1`, `IT-S2`, `IT-S3` 그린).
- `IT-R1` 그린.

---

## 6. M6 — Stalled Recovery

### 통과 조건
- [ ] `IT-S6-stalled-recovery` 그린: 워커 A 강제 종료 → 워커 B 회수 → `completed`
- [ ] `STALLED_INTERVAL_MS`, `MAX_STALLED_COUNT` 환경변수 노출
- [ ] BullMQ stalled 메커니즘 의존 — 자체 stalled 매니저 없음 (F2.5)
- [ ] `core/worker.ts`에 도메인 식별자 0건

### 데모 동작 가능 상태
- M5 + 워커 강제 종료 후 다른 워커가 자동 회수.

### 회귀 보호
- M2~M5의 모든 게이트 통과(`IT-S1~S5` 그린).
- `IT-R1` 그린.

---

## 7. M7 — Graceful Shutdown

### 통과 조건
- [ ] `IT-S7-graceful-shutdown` 그린 (정상 케이스): 작업 완료 후 자식 프로세스 종료(exit 0)
- [ ] `IT-S7` 그린 (타임아웃 케이스): 잔여 작업 ID 로그 + exit code Q-SEC-4 (b) → `1`
- [ ] 셧다운 진행 중 `POST /webhooks` → `503` (AC6.4)
- [ ] 셧다운 진행 중 `GET /healthz` → `503`
- [ ] `core/shutdown.ts`에 도메인 식별자/Fastify 임포트 0건
- [ ] 시그널 핸들러는 `demo/src/server.ts`에 등록(부트스트랩 책임)

### 데모 동작 가능 상태
- M6 + `docker compose stop api`로 SIGTERM 흐름 동작 검증 가능.
- **CLAUDE.md §5의 7개 시나리오 전체 그린** = 본 PRD가 정의한 모든 보장 충족.

### 회귀 보호
- M2~M6의 모든 게이트 통과(`IT-S1~S6` 그린).
- `IT-R1` 그린.

---

## 8. CLAUDE.md / PRD 원칙 준수 게이트

각 마일스톤 PR에서 추가로 확인.

- [ ] CLAUDE.md §2 기술 스택 외 새 의존성 없음(있다면 정당성 명시)
- [ ] CLAUDE.md §3 폴더 경계 준수
- [ ] CLAUDE.md §4 코딩 컨벤션 준수 (strict, `any` 없음, Zod 경계, 에러 분류, 구조화 로깅, floating promise 없음, 매직 스트링 없음)
- [ ] CLAUDE.md §5 테스트 정책 준수 (Redis 모킹 금지, 격리, fake timer 결정성)
- [ ] CLAUDE.md §6 Conventional Commits 준수
- [ ] CLAUDE.md §7 AI 협업 5원칙 준수:
  - [ ] 설계(불변식)가 코드 전에 정의되었는가
  - [ ] 시나리오 테스트가 구현 전에 작성되었는가
  - [ ] 범위 외 기능을 추가하지 않았는가
  - [ ] 불확실한 결정을 임의로 잠그지 않았는가(`00-decisions-needed.md` 잠금 확인)
  - [ ] 위반 코드를 발견하면 보고했는가
- [ ] CLAUDE.md §8 보안/운영 주의 (HMAC, 타임아웃, 시크릿 격리, Redis 재연결 백오프)

---

## 9. PLAN 전체의 최종 게이트 (모든 마일스톤 완료 후)

본 PLAN이 정의한 7개 마일스톤이 모두 완료되었을 때 사람이 한 번 더 검증.

- [ ] CLAUDE.md §5의 **7개 시나리오 모두 그린** (`IT-S1` ~ `IT-S7`)
- [ ] `IT-R1` 그린
- [ ] 모든 단위 테스트(UT-1~UT-6) 그린
- [ ] PRD `00` §5 성공 지표 S1~S5 모두 충족:
  - [ ] S1: `pnpm test:unit`, `pnpm test:integration` 모두 통과
  - [ ] S2: 7개 시나리오 테스트와 PRD `03` §3 표의 매핑이 코드에서 동일 ID로 추적 가능
  - [ ] S3: `curl` 해피패스 데모 동작
  - [ ] S4: 워커 강제 종료 후 다른 워커 처리(`IT-S6`로 증명)
  - [ ] S5: `core` 패키지 grep으로 도메인 식별자 검출 없음
- [ ] PRD `07-out-of-scope-and-future.md`의 모든 오픈 퀘스천이 Resolved
- [ ] 3단계, 4단계, 부록 트랙은 손대지 않은 상태(범위 통제 검증)
