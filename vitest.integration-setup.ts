// 통합 테스트 전용 vitest setup.
//
// 본 파일이 다루는 단 하나의 문제:
//   BullMQ 의 in-process Worker 가 idle 상태에서 close 되면 내부 duplicated
//   ioredis blocking client 가 "Connection is closed." 를 unhandledRejection
//   으로 emit 한다. 운영 환경에서는 프로세스가 곧바로 exit 하므로 영향이
//   없지만, vitest 는 본 rejection 을 잡아 종료 코드를 1 로 만든다 → CI 실패.
//
// 본 setup 은 정확히 본 메시지만 swallow 하고, 다른 unhandled 는 그대로
// throw 되어 vitest 가 실패로 표기하게 둔다. 운영 코드는 손대지 않는다.
//
// 참고:
// - M-OBS-1 PLAN `docs/plan-phase3/02-m-obs-1-bootstrap.md` 의 "부수 발견"
//   섹션에서 BullMQ idle close 의 unhandled rejection 을 명시.
// - 본 setup 은 vitest.config.ts 의 integration project 에만 적용됨.

const BENIGN_MESSAGES = new Set<string>(["Connection is closed."]);

function isBenignBullMqIoredisClose(err: unknown): boolean {
  return err instanceof Error && BENIGN_MESSAGES.has(err.message);
}

process.on("unhandledRejection", (err: unknown): void => {
  if (isBenignBullMqIoredisClose(err)) return;
  // 의도되지 않은 unhandledRejection 은 그대로 throw 해 vitest 가 잡게 한다.
  throw err;
});
