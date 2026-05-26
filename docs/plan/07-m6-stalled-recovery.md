# 07. M6 — Stalled-job Recovery: IT-S6 통과

> **PLAN 진입 조건:** M5 완료 + `00-decisions-needed.md` M6 행 Q가 모두 Resolved.
>
> **AI 협업 5원칙 적용:**
> - (1) 불변식 I2.5(워커가 죽어도 작업이 유실되지 않음)를 사람이 §3 테스트로 먼저 못 박는다.
> - (2) 테스트 먼저.
> - (3) F2.5 — 자체 stalled-job 매니저 금지. BullMQ 메커니즘에 의존.
> - (4) `stalledInterval` 임계값은 Q-STALL-1에 종속.
> - (5) 위반 코드 발견 시 보고.

## 1. 목표 한 줄

**`IT-S6-stalled-recovery`를 그린으로 만든다.** 워커 A가 작업을 잡은 채 강제 종료되면, `STALLED_INTERVAL_MS` 이후 워커 B가 같은 작업을 회수해 처리한다. BullMQ의 stalled 메커니즘에만 의존한다.

## 2. 선행 의존

- **마일스톤:** M5.
- **결정 필요 항목:**
  - Q-STALL-1 — `STALLED_INTERVAL_MS` 기본값 (권장 (a) 운영 30s + 테스트 환경변수 단축)

## 3. 테스트 우선 시퀀스

### 3.1 통합 테스트
1. **`IT-S6-stalled-recovery`**
   - 파일: `packages/demo/test/it-s6-stalled-recovery.integration.test.ts`
   - 흐름:
     1. Testcontainers Redis + 고유 큐.
     2. 환경: `STALLED_INTERVAL_MS=500`, `MAX_STALLED_COUNT=1`(테스트 단축, Q-STALL-1 (a)).
     3. 워커 A와 워커 B 두 인스턴스를 in-process로 부팅.
     4. 데모 수신자(또는 핸들러 직접 스텁)가 "처리 시작" 신호를 외부에서 감지 가능하게 함(예: 첫 시도에 `setTimeout(2s)` 후 응답).
     5. 워커 A가 작업을 잡은 직후 강제 종료(`worker.close({ force: true })` — PRD `03` §3 메모 참조).
     6. 폴링(최대 8초): 워커 B가 동일 작업을 처리해 BullMQ `completed` 상태에 도달.
     7. 수신자가 최종적으로 페이로드를 받았음.
   - **주의:** 본 테스트는 wall-clock 의존 불가피. `stalledInterval`을 짧게 두는 것 외에는 fake timer 적용 어려움.
   - 격리: 큐 이름 + 워커 인스턴스 ID(BullMQ Worker name) 모두 테스트별 고유.

### 3.2 회귀 단언
- `IT-S1~S5`, `IT-R1`, 모든 UT 그린 유지.

## 4. 구현 단계 (커밋 단위)

### 단계 1 — 실패 테스트 작성

1. **`test: add IT-S6 stalled recovery (failing)`**
   - 테스트 픽스처에 두 워커 부팅 헬퍼 필요(`test/helpers/app-fixture.ts` 확장).
   - 처음에는 실패: 단일 프로세스에서 두 워커를 BullMQ의 stalled 메커니즘이 활성화된 상태로 부팅하지 않으면 회수가 일어나지 않는다.

### 단계 2 — `core` 옵션 노출

2. **`feat(core): expose stalledInterval and maxStalledCount worker options`**
   - `core/src/worker.ts`:
     - `WorkerOptions` 인자에 `stalledInterval?`, `maxStalledCount?` 추가(BullMQ가 받는 옵션을 그대로 위임).
     - 자체 stalled 매니저 구현 금지(F2.5).

### 단계 3 — `demo` 환경변수 연결

3. **`feat(demo): wire STALLED_INTERVAL_MS and MAX_STALLED_COUNT to worker`**
   - `demo/src/config.ts`: 두 환경변수 파싱(이미 스키마 정의됨).
   - `demo/src/server.ts`: Worker 옵션 전달.

### 단계 4 — 테스트 인프라

4. **`test: app-fixture spawns two workers with shared queue`**
   - `packages/demo/test/helpers/app-fixture.ts` 확장:
     - `startWorker(label: string, opts): Promise<{ worker, close }>` 헬퍼.
     - 두 워커가 동일 Redis + 큐를 공유하도록 설정.
     - Worker A의 강제 종료를 위해 `close({ force: true })` 호출 헬퍼 노출.

### 단계 5 — 테스트 통과 + 회귀

5. **`test: ensure IT-S6 is green`**
6. **회귀 점검:** `IT-S1~S5`, `IT-R1`, 모든 UT 그린.

## 5. 생성/수정할 파일 목록 (절대경로)

### 새 파일
- `/Users/connor/biz/webhook-relay/packages/demo/test/it-s6-stalled-recovery.integration.test.ts` (IT-S6)

### 수정 파일
- `/Users/connor/biz/webhook-relay/packages/core/src/worker.ts` — `stalledInterval`, `maxStalledCount` 옵션 위임
- `/Users/connor/biz/webhook-relay/packages/demo/src/server.ts` — 환경변수에서 두 값 전달
- `/Users/connor/biz/webhook-relay/packages/demo/test/helpers/app-fixture.ts` — 다중 워커 부팅 헬퍼

### 본 마일스톤에서 절대 만들지 않는 것
- 자체 stalled-job 매니저(F2.5)
- 분산 락 등 외부 메커니즘
- 그레이스풀 셧다운 시퀀스(M7)

## 6. 수용 기준 / Done 정의

- **AC-M6-1** `IT-S6` 그린: 워커 A 강제 종료 후 워커 B가 같은 작업을 처리. 최종 `completed`. 수신자 1건 수신.
- **AC-M6-2** `STALLED_INTERVAL_MS`, `MAX_STALLED_COUNT`가 환경변수로 노출됨.
- **AC-M6-3** `core/worker.ts`에 BullMQ가 아닌 자체 stalled 로직이 없음(코드 리뷰).
- **AC-M6-4** `IT-S1~S5`, `IT-R1`, 모든 UT 회귀 없음.

## 7. PRD 역참조

- PRD `02-resilience.md` §F2.5 — Stalled-job 정책.
- PRD `02-resilience.md` §I2.5 — 회수 보장 불변식.
- PRD `03-test-strategy.md` §3 IT-S6.
- PRD `05-api-and-contracts.md` §8 — `STALLED_INTERVAL_MS`, `MAX_STALLED_COUNT`.

## 8. 오픈 퀘스천 의존

- Q-STALL-1 — 권장 (a). (b)로 결정되면 환경변수 단축 대신 옵션 주입 채널을 추가. 본 PLAN의 §3.1 테스트가 환경변수 경로를 가정하므로, (b) 결정 시 IT-S6 픽스처를 옵션 주입으로 재작성.

## 9. PRD 변경 제안

- (없음) — PRD가 stalled 메커니즘 의존과 환경변수 노출을 충분히 정의함.

## 10. 회귀 점검 (Done 직전)

- `pnpm test:unit && pnpm test:integration` 그린.
- `IT-S1~S6`, `IT-R1` 그린.
- 사람이 5xx 무한 스텁 + 워커 강제 종료를 1회 수동 검증.

## 11. 본 마일스톤 후 데모 상태

- 데모는 해피패스 + 멱등성 + 재시도 + DLQ + Stalled 회수 동작.
- 마지막 남은 보장은 그레이스풀 셧다운(M7).
