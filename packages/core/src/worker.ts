import { UnrecoverableError, Worker, type Job, type Queue, type WorkerOptions } from "bullmq";
import type { Redis } from "ioredis";
import { NonRetriableError, RetriableError } from "./errors.js";
import { buildDlqEntry, type DlqJobData, type DlqLastError } from "./dlq.js";

// core/worker.ts
//
// 도메인 비의존 워커 팩토리. 핸들러는 외부 주입(Q-ARCH-4 (a) — `<TData>` 1개 제네릭).
//
// CLAUDE.md §3, PRD `04` §7 — 도메인 매핑은 demo 측 책임. core 는 BullMQ
// Worker 옵션을 제공하고 핸들러를 invoke 한다.
//
// M4 분류 인지:
// - 핸들러가 `NonRetriableError` 를 throw 하면 BullMQ 의
//   `UnrecoverableError` 로 thin-wrap 하여 즉시 격리(F2.2, AC-M4-3).
// - 그 외 에러(RetriableError 포함)는 그대로 throw → BullMQ 가 attempts +
//   backoff 정책에 따라 재시도(F2.3).
//
// M5 DLQ 이동:
// - `dlqQueue` 옵션이 주입되면, BullMQ 의 'failed' 이벤트를 듣고
//   다음 조건일 때 별도의 DLQ.add 호출로 새 항목을 적재한다:
//     1) 원본 에러가 NonRetriableError (UnrecoverableError 로 wrap된 경우
//        포함 — wrapped.cause 로 식별).
//     2) 또는 마지막 시도에서 실패 (attemptsMade >= opts.attempts).
// - DLQ 적재는 원본 작업을 옮기는 게 아니라 새 항목을 새로 add 한다
//   (PRD `02` §F2.4). 원 큐의 원본 작업은 BullMQ 의 removeOnFail 옵션
//   (호출 측이 설정) 으로 즉시 제거되거나 failed 로 남는다.
//
// 본 변환은 core 가 분류 시맨틱을 알지 못한 채 단순 매핑만 수행한다.
// 도메인(어떤 응답이 NonRetriable 인가)은 demo 가 결정한다.

export interface CoreJob<TData> {
  readonly id: string;
  readonly data: TData;
  readonly attemptsMade: number;
}

export type CoreJobHandler<TData> = (job: CoreJob<TData>) => Promise<void>;

export interface CreateWorkerOptions<TData> {
  readonly connection: Redis;
  /** BullMQ Worker 옵션. attempts 등 도메인 정책은 호출 측 결정. */
  readonly workerOptions?: Omit<WorkerOptions, "connection">;
  /**
   * 주입식 DLQ 큐. 주어지면 워커는 'failed' 이벤트에서
   * NonRetriable 또는 attempts 소진 케이스를 식별해 DLQ.add 로 새 항목을
   * 적재한다. 도메인 식별자는 받지 않으며, 큐 이름과 모양만 의존한다.
   */
  readonly dlqQueue?: Queue<DlqJobData<TData>, void, string>;
}

/**
 * BullMQ Worker 를 생성한다.
 *
 * 핸들러가 `NonRetriableError` 를 throw 하면 BullMQ 의
 * `UnrecoverableError` 로 변환해 즉시 격리(재시도 없이 failed).
 * 그 외 에러는 그대로 propagate → BullMQ 가 backoff 에 따라 재시도.
 *
 * `dlqQueue` 가 주입되면, 종단(terminal) 실패 시 DLQ 에 새 항목을
 * 적재한다(원본 페이로드 + lastError 컨텍스트 보존).
 */
export function createWorker<TData>(
  name: string,
  handler: CoreJobHandler<TData>,
  opts: CreateWorkerOptions<TData>,
): Worker<TData, void, string> {
  const { connection, workerOptions, dlqQueue } = opts;
  const worker = new Worker<TData, void, string>(
    name,
    async (job: Job<TData, void, string>) => {
      const coreJob: CoreJob<TData> = {
        id: job.id ?? "",
        data: job.data,
        attemptsMade: job.attemptsMade,
      };
      try {
        await handler(coreJob);
      } catch (err) {
        if (err instanceof NonRetriableError) {
          // BullMQ 는 UnrecoverableError(또는 name=='UnrecoverableError') 를
          // 보면 attempts 를 무시하고 즉시 failed 로 처리한다.
          // 메시지/cause 는 보존하여 상위 로깅이 활용할 수 있게 한다.
          const wrapped = new UnrecoverableError(err.message);
          // 원본 분류 결과 보존(로깅에서 errorClass 를 NonRetriableError 로 식별).
          (wrapped as Error & { cause?: unknown }).cause = err;
          throw wrapped;
        }
        throw err;
      }
    },
    {
      ...workerOptions,
      connection,
    },
  );

  if (dlqQueue !== undefined) {
    // 'failed' 이벤트 핸들러: 종단 실패만 DLQ 로 이동.
    // 본 핸들러는 promise 를 반환하지 않으며, 내부 await 결과는 의도적 처리
    // (실패 시 'error' 이벤트로 propagate — floating promise 금지 정책).
    worker.on("failed", (job, err) => {
      if (job === undefined) return; // stalled 등에 의해 job 객체가 없는 경우 — M5 범위 외.
      void handleFailedForDlq(dlqQueue, name, job, err).catch((dlqErr: unknown) => {
        // DLQ 적재 자체가 실패한 경우는 워커의 'error' 채널로 전파.
        const wrapped =
          dlqErr instanceof Error ? dlqErr : new Error(String(dlqErr));
        worker.emit("error", wrapped);
      });
    });
  }

  return worker;
}

/**
 * 종단 실패 판정 + DLQ.add. 본 함수는 도메인 식별자를 모른다.
 */
async function handleFailedForDlq<TData>(
  dlqQueue: Queue<DlqJobData<TData>, void, string>,
  jobName: string,
  job: Job<TData, void, string>,
  err: Error,
): Promise<void> {
  // 원본 분류 에러 식별. UnrecoverableError 로 wrap 된 경우 cause 가 원본.
  const original = unwrapClassifiedError(err);
  const isNonRetriable =
    original instanceof NonRetriableError ||
    err instanceof UnrecoverableError ||
    err.name === "UnrecoverableError";

  // BullMQ 시맨틱: 종단 실패 시 job.attemptsMade 는 이미 증분되어 최종값.
  // attemptsMade >= attempts 인 경우만 종단(중간 재시도에서는 이 이벤트
  // 후 다음 시도가 스케줄링되므로 attemptsMade < attempts).
  const attempts = job.opts.attempts ?? 1;
  const isTerminalByAttempts = job.attemptsMade >= attempts;

  if (!isNonRetriable && !isTerminalByAttempts) {
    return; // 중간 실패 — 재시도 예정.
  }

  const lastError: DlqLastError = buildLastErrorContext(original ?? err, job.attemptsMade);

  const entry = buildDlqEntry<TData>({
    data: job.data,
    lastError,
  });

  // 새 항목으로 적재. dlqQueue.add 의 첫 인자는 BullMQ job 이름.
  // 본 모듈은 도메인 식별자를 모르므로 원본 worker name 을 그대로 사용.
  await dlqQueue.add(jobName, entry);
}

function unwrapClassifiedError(err: Error): RetriableError | NonRetriableError | undefined {
  if (err instanceof RetriableError) return err;
  if (err instanceof NonRetriableError) return err;
  // BullMQ UnrecoverableError 로 wrap 된 경우: cause 보존(worker.ts wrap).
  const cause = (err as Error & { cause?: unknown }).cause;
  if (cause instanceof RetriableError) return cause;
  if (cause instanceof NonRetriableError) return cause;
  return undefined;
}

function buildLastErrorContext(
  err: RetriableError | NonRetriableError | Error,
  attemptsMade: number,
): DlqLastError {
  if (err instanceof NonRetriableError) {
    const ctx: DlqLastError = {
      class: "NonRetriable",
      attemptsMade,
      message: err.message,
      ...(err.httpStatus !== undefined ? { httpStatus: err.httpStatus } : {}),
    };
    return ctx;
  }
  if (err instanceof RetriableError) {
    const ctx: DlqLastError = {
      class: "Retriable",
      attemptsMade,
      message: err.message,
      ...(err.httpStatus !== undefined ? { httpStatus: err.httpStatus } : {}),
    };
    return ctx;
  }
  // 분류 정보 부재 — 보수적으로 Retriable.
  return {
    class: "Retriable",
    attemptsMade,
    message: err.message,
  };
}
