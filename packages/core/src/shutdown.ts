import type { Queue, Worker } from "bullmq";
import type { Redis } from "ioredis";

// core/shutdown.ts
//
// 그레이스풀 셧다운 시퀀서(PRD `06` §6.2, `02` §F2.6, I2.6/I6.3).
//
// 결정 잠금:
// - Q-SEC-4 (b) — 정상 완료 → exit 0, 타임아웃 강제 종료 → exit 1.
//   exit 의 책임은 호출 측(demo/server.ts). 본 모듈은 `timedOut` 만 반환한다.
// - Q-OPS-2 (b) — 자식 프로세스 + 실제 SIGTERM. 본 모듈은 시그널을 직접
//   다루지 않는다(호출 측 책임). 시그널 핸들러가 본 함수를 invoke 한다.
//
// 본 모듈의 책임:
// 1) httpServer.setDraining(true) — 새 요청 차단 토글.
// 2) worker.close({ force: false }) 를 timeoutMs 와 race.
//    - BullMQ 의 Worker.close(false) 는 active 작업이 완료될 때까지 대기.
//    - 타임아웃 도달 시 worker.getJobs(['active']) 로 잔여 작업 ID 수집,
//      onTimeout(ids) 호출, 이후 worker.close(true) 로 강제 종료.
// 3) httpServer.close().
// 4) queue.close(), dlqQueue?.close(), redis.quit().
// 5) 반환: { timedOut: boolean }.
//
// 도메인 식별자 금지(CLAUDE.md §3, IT-R1, AC-M7-3). HTTP 서버 프레임워크
// import 금지 — httpServer 는 추상 인터페이스(setDraining/close)만 받는다.
//
// 본 함수는 자체적으로 재진입을 방어하지 않는다. 호출 측(시그널 핸들러)에서
// boolean guard 로 중복 호출을 차단해야 한다.

/**
 * HTTP 서버의 추상 인터페이스. 어떤 HTTP 프레임워크 구현이어도 본 두
 * 메서드만 만족하면 된다(I2.7 — core 는 외부 HTTP 프레임워크를 import 하지 않는다).
 */
export interface ShutdownHttpServer {
  /** draining 상태 토글. true 인 동안 신규 요청은 503 응답해야 한다. */
  setDraining(value: boolean): void;
  /** 서버 close. 진행 중 응답은 마치고 listening socket 닫음. */
  close(): Promise<void>;
}

export interface GracefulShutdownInput {
  /**
   * BullMQ Worker. API 전용(HTTP 만) 셧다운에서는 워커가 없으므로 optional.
   * 'worker' 모드와 'all' 모드는 본 필드를 주입한다.
   */
  readonly worker?: Worker;
  /** 메인 큐. 부재 시 close 단계가 skip 된다. */
  readonly queue?: Queue;
  /** DLQ 큐. 없을 수도 있다(다른 데모 트랙 호환). */
  readonly dlqQueue?: Queue;
  readonly redis: Redis;
  readonly httpServer: ShutdownHttpServer;
  /** 진행 중 작업 완료를 기다리는 상한(ms). 초과 시 강제 종료. */
  readonly timeoutMs: number;
  /**
   * 타임아웃 도달 시 호출. ids 는 워커가 active 상태로 보유 중인 작업 ID 목록.
   * 호출 측은 본 콜백에서 구조화 로그를 남긴다(PRD `06` §6.2.5).
   * 워커가 없으면 호출되지 않는다(타임아웃 race 가 의미 없음).
   */
  readonly onTimeout?: (remainingIds: string[]) => void;
}

export interface GracefulShutdownResult {
  /** 타임아웃에 도달해 강제 종료가 발생했는가. */
  readonly timedOut: boolean;
}

/**
 * 그레이스풀 셧다운 시퀀스를 실행한다.
 *
 * 호출 순서(PRD `06` §6.2):
 *   1. httpServer.setDraining(true) — 새 요청은 라우트 레벨에서 503.
 *   2. worker.close(false) 를 timeoutMs 와 race.
 *      timeout 시 active job IDs 수집 → onTimeout → worker.close(true).
 *   3. httpServer.close().
 *   4. queue/dlqQueue close, redis quit.
 *
 * 각 단계는 best-effort 로 시도하며, 한 단계의 실패가 다음 단계를 막지 않는다.
 * 단, worker.close 의 타임아웃 여부는 반환값에 보존된다.
 */
export async function gracefulShutdown(
  input: GracefulShutdownInput,
): Promise<GracefulShutdownResult> {
  const { worker, queue, dlqQueue, redis, httpServer, timeoutMs, onTimeout } = input;

  // (1) draining 토글. 본 호출은 동기. 실패해도 다음 단계 진행.
  try {
    httpServer.setDraining(true);
  } catch {
    // best-effort — http 서버가 이미 닫혔거나 ill-state 인 경우.
  }

  // (2) worker.close(false) 와 timeout race.
  //     BullMQ Worker.close(force=false) 는 active 작업을 기다린다.
  //     worker 가 없는 모드(API 전용)에서는 race 자체가 의미 없으므로 skip.
  let timedOut = false;
  if (worker !== undefined) {
    const closePromise = worker.close(false).catch(() => {
      // close 자체 실패는 무시(best-effort). timeout 분기로 떨어지지 않게 swallow.
    });
    const timeoutPromise = new Promise<"__timeout__">((resolve) => {
      setTimeout(() => resolve("__timeout__"), timeoutMs);
    });
    const raceResult = await Promise.race([
      closePromise.then(() => "__closed__" as const),
      timeoutPromise,
    ]);

    if (raceResult === "__timeout__") {
      timedOut = true;
      // 잔여 active 작업 ID 수집. BullMQ 의 Queue.getJobs(['active']) 로
      // 큐 단위로 조회한다(Worker 에는 getJobs 가 없다).
      let remainingIds: string[] = [];
      if (queue !== undefined) {
        try {
          const activeJobs = await queue.getJobs(["active"]);
          remainingIds = activeJobs
            .map((j) => j.id)
            .filter((id): id is string => typeof id === "string" && id.length > 0);
        } catch {
          // 조회 실패 시 빈 배열로 둔다(타임아웃 시점에 Redis 가 불안정할 수 있음).
          remainingIds = [];
        }
      }
      if (onTimeout !== undefined) {
        try {
          onTimeout(remainingIds);
        } catch {
          // 콜백 자체의 에러는 셧다운 흐름을 막지 않는다.
        }
      }
      // 강제 close. 진행 중 작업은 BullMQ 가 stalled 로 회수 대상이 된다(M6).
      try {
        await worker.close(true);
      } catch {
        // best-effort
      }
    }
  }

  // (3) HTTP 서버 close. 진행 중 응답이 있으면 마치고 listening 소켓 종료.
  try {
    await httpServer.close();
  } catch {
    // best-effort
  }

  // (4) 큐/DLQ/Redis 정리. 있는 것만 close.
  if (queue !== undefined) {
    try {
      await queue.close();
    } catch {
      // best-effort
    }
  }
  if (dlqQueue !== undefined) {
    try {
      await dlqQueue.close();
    } catch {
      // best-effort
    }
  }
  try {
    await redis.quit();
  } catch {
    // best-effort
  }

  return { timedOut };
}
