# 08. M7 — Graceful Shutdown: IT-S7 통과

> **PLAN 진입 조건:** M6 완료 + `00-decisions-needed.md` M7 행 Q가 모두 Resolved.
>
> **AI 협업 5원칙 적용:**
> - (1) 불변식 I2.6, I6.3(SIGTERM 후 진행 중 작업은 강제 중단되지 않음)을 사람이 §3 테스트로 먼저 못 박는다.
> - (2) 테스트 먼저.
> - (3) "중도 체크포인트"는 비목표(PRD `06` §6.3). 본 마일스톤에서 도입 금지.
> - (4) 강제 종료 시 exit code는 Q-SEC-4. 테스트 형태는 Q-OPS-2.
> - (5) 위반 코드 발견 시 보고.

## 1. 목표 한 줄

**`IT-S7-graceful-shutdown`을 그린으로 만든다.** 자식 프로세스로 띄운 워커에 실제 SIGTERM을 전송하면, 진행 중 작업은 완료되고 신규 요청은 `503`을 받으며, `SHUTDOWN_TIMEOUT_MS` 내에 프로세스가 종료된다. 타임아웃 초과 시 잔여 작업 ID가 로그에 남고 정해진 exit code로 종료한다.

## 2. 선행 의존

- **마일스톤:** M6.
- **결정 필요 항목:**
  - Q-SEC-4 — 셧다운 강제 종료 exit code (권장 (b) `1`)
  - Q-OPS-2 — SIGTERM 통합 테스트 형태 (권장 (b) 자식 프로세스)

## 3. 테스트 우선 시퀀스

### 3.1 통합 테스트
1. **`IT-S7-graceful-shutdown`**
   - 파일: `packages/demo/test/it-s7-graceful-shutdown.integration.test.ts`
   - 흐름(Q-OPS-2 (b) 가정 — 자식 프로세스):
     1. Testcontainers Redis + 고유 큐.
     2. `child_process.spawn`으로 `packages/demo/src/server.ts`를 자식 프로세스로 띄움(테스트용 env로 큐 이름, Redis URL, `SHUTDOWN_TIMEOUT_MS=3000` 주입).
     3. 데모 수신자는 처리에 1.5초 소요되도록 in-process로 별도 띄우거나(테스트 픽스처가 수신 stub 서버 동시 부팅), 핸들러 안에 의도적 지연.
     4. `POST /webhooks` 1회.
     5. 잠시 대기(워커가 작업을 잡았음을 확인) 후 자식 프로세스에 `kill('SIGTERM')`.
     6. 자식 프로세스의 stdout/stderr에서 다음을 확인:
        - 셧다운 진행 중 추가 `POST /webhooks` 요청 보내면 `503`.
        - 셧다운 진행 중 `GET /healthz`는 `503` (Q-SEC-5 정합).
     7. 폴링: 작업이 `completed`로 끝남. 자식 프로세스가 종료(exit code 0 — 잔여 작업 없음).
     8. **별도 케이스:** 처리에 `SHUTDOWN_TIMEOUT_MS`보다 더 긴 시간(예: 5초) 소요되는 작업을 등록 후 SIGTERM 송신. 자식 프로세스 exit code가 Q-SEC-4 결정값(권장 (b) `1`). 잔여 작업 ID가 로그에 등장.
   - 격리: 자식 프로세스의 작업 디렉터리, 포트, 큐 이름 모두 고유.
   - 결정성: SIGTERM 송신 타이밍은 워커가 작업을 잡았음을 확신할 수 있을 때까지 폴링한 뒤 송신.

### 3.2 회귀 단언
- `IT-S1~S6`, `IT-R1`, 모든 UT 그린 유지.

## 4. 구현 단계 (커밋 단위)

### 단계 1 — 실패 테스트 작성

1. **`test: add IT-S7 graceful shutdown (failing)`**
   - 자식 프로세스 spawn 헬퍼 + 자식 프로세스로 부팅 가능한 진입점이 없으면 실패.

### 단계 2 — `core` 셧다운 시퀀스

2. **`feat(core): shutdown sequencer`**
   - `packages/core/src/shutdown.ts`:
     - `gracefulShutdown(input: { worker: Worker; queue: Queue; dlqQueue: Queue; redis: IORedis; httpServer: { close: () => Promise<void>; setDraining?: (b: boolean) => void }; timeoutMs: number; onTimeout?: (remainingIds: string[]) => void }): Promise<void>`
     - 시퀀스(PRD `06` §6.2):
       1. `httpServer.setDraining(true)` — 새 요청 거절 토글.
       2. `worker.pause()` 또는 `worker.close({ force: false })`.
       3. 진행 중 작업 완료를 `timeoutMs` 내에서 대기. BullMQ에서 진행 중 작업의 완료 신호는 `worker.close()` 자체가 `force: false`일 때 대기한다.
       4. 타임아웃 도달 시 `onTimeout`에 잔여 작업 ID 목록 전달(가능하면 BullMQ로부터 조회).
       5. `queue.close()`, `dlqQueue.close()`, `redis.quit()`.
     - 도메인 식별자 금지. Fastify 임포트 금지(httpServer 인터페이스를 추상 인자로 받음).

### 단계 3 — `demo` 부트스트랩 통합

3. **`feat(demo): http server draining state`**
   - Fastify 앱에 "drain" 상태 플래그. `POST /webhooks`와 `GET /healthz`가 draining 시 `503` 응답.
   - 다른 라우트(`/_demo/receiver`, `/dashboard`)는 정책 결정: 본 PLAN 권장은 **`/_demo/receiver`는 계속 200**(데모 수신자가 데모 작업 처리를 방해하지 않도록), **`/dashboard`도 200**(관측 가능성 유지). PRD `06` §6.2가 명시한 두 라우트만 `503`.

4. **`feat(demo): wire signal handlers to shutdown sequencer`**
   - `demo/src/server.ts`:
     - `process.on('SIGTERM', ...)` + `process.on('SIGINT', ...)` 등록.
     - 핸들러는 `core.gracefulShutdown(...)`을 호출. 시그널 중복 수신 방어(이미 진행 중이면 무시).
     - `onTimeout` 콜백: 잔여 작업 ID를 구조화 로그로 출력(PRD `06` §6.2.5).
     - 셧다운 완료 후 exit code 0. 타임아웃으로 강제 종료 시 exit code Q-SEC-4 결정값(권장 (b) → `process.exit(1)`).

### 단계 4 — 테스트 통과 + 회귀

5. **`test: ensure IT-S7 is green`**
6. **회귀 점검:** `IT-S1~S6`, `IT-R1`, 모든 UT 그린.

## 5. 생성/수정할 파일 목록 (절대경로)

### 새 파일
- `/Users/connor/biz/webhook-relay/packages/demo/test/it-s7-graceful-shutdown.integration.test.ts` (IT-S7)
- `/Users/connor/biz/webhook-relay/packages/demo/test/helpers/spawn-server.ts` (자식 프로세스 spawn 헬퍼)

### 수정 파일
- `/Users/connor/biz/webhook-relay/packages/core/src/shutdown.ts` — 실 구현
- `/Users/connor/biz/webhook-relay/packages/demo/src/server.ts` — 시그널 핸들러 + draining 상태
- `/Users/connor/biz/webhook-relay/packages/demo/src/api/webhooks.ts` — draining 시 `503`
- `/Users/connor/biz/webhook-relay/packages/demo/src/api/healthz.ts` — draining 시 `503`

### 본 마일스톤에서 절대 만들지 않는 것
- 중도 체크포인트(PRD `06` §6.3 비목표)
- 셧다운 중 작업 큐잉(PRD `06` §6.3 비목표 — 모두 `503`)
- 그레이스풀 셧다운 측정(SLO) — 4단계 PRD

## 6. 수용 기준 / Done 정의

- **AC-M7-1** `IT-S7` 그린: 정상 케이스 — 작업 완료 후 자식 프로세스 종료(exit 0). 셧다운 진행 중 `/webhooks`와 `/healthz`가 `503`.
- **AC-M7-2** `IT-S7` 그린: 타임아웃 케이스 — 잔여 작업 ID 로그 + exit code Q-SEC-4 결정값(권장 (b) → `1`).
- **AC-M7-3** `core/shutdown.ts`에 도메인 식별자/Fastify 임포트 0개(grep, AC4.1).
- **AC-M7-4** PRD `06` §AC6.4 (SIGTERM 후 진행 중 작업 완료 + 신규 요청 `503`) 충족.
- **AC-M7-5** `IT-S1~S6`, `IT-R1`, 모든 UT 회귀 없음.

## 7. PRD 역참조

- PRD `02-resilience.md` §F2.6 — 셧다운 요약.
- PRD `02-resilience.md` §I2.6 — 불변식.
- PRD `06-security-and-ops.md` §6 — 셧다운 시퀀스 전체.
- PRD `06-security-and-ops.md` §AC6.4 — 수용 기준.
- PRD `03-test-strategy.md` §3 IT-S7.

## 8. 시그널 처리 / exit code 메모

- Q-SEC-4 권장 (b) `1`:
  - 정상 셧다운 완료(잔여 작업 없음) → `process.exit(0)`.
  - 타임아웃 도달(잔여 작업 있음) → `process.exit(1)`. 모니터링이 명확히 신호를 구분 가능.
- 시그널 중복 수신 시 두 번째 이후는 무시(단, 세 번째 SIGTERM은 즉시 `process.exit(1)`로 처리하는 옵션 — 본 PLAN은 단순화 위해 무시만 권장).
- Node의 `SIGKILL`은 잡을 수 없다. 본 마일스톤은 `SIGTERM`/`SIGINT`만 다룬다.

## 9. 오픈 퀘스천 의존

- Q-SEC-4 — 권장 (b) `1`. (a)로 결정되면 §4 단계 3의 exit code 분기를 0으로 통일.
- Q-OPS-2 — 권장 (b) 자식 프로세스. (a) 동일 프로세스 시뮬레이션으로 결정되면 §3.1과 §4 단계 1의 테스트 인프라를 동일 프로세스 모킹으로 재작성(단, "진짜 시그널 검증"이 약화됨).

## 10. PRD 변경 제안

- (잠재) PRD `06` §6.2는 "단계 5: 타임아웃 도달 시 강제 종료 직전에 로그로 잔여 작업 ID 기록"이라고 명시하지만, "잔여 작업 ID"가 워커가 잡은 active jobs를 의미하는지 큐 전체 대기 작업을 의미하는지 모호. 본 PLAN은 **워커가 active 상태에서 보유 중인 작업 ID 목록**으로 해석. PRD 보강이 바람직.

## 11. 회귀 점검 (Done 직전)

- `pnpm test:unit && pnpm test:integration` 그린.
- `IT-S1~S7`, `IT-R1` 모두 그린(CLAUDE.md §5의 7개 시나리오 완성).
- 사람이 로컬에서 `docker compose up` 후 `docker compose stop api`로 SIGTERM 흐름 1회 수동 검증.

## 12. 본 마일스톤 후 데모 상태

- 데모는 본 PRD가 정의한 모든 보장을 충족:
  - 해피패스, 멱등성, 재시도, DLQ, Stalled 회수, 그레이스풀 셧다운.
- 다음 단계(3단계 관측성, 4단계 부하/측정, 부록 트랙)는 본 PLAN 범위 외.
