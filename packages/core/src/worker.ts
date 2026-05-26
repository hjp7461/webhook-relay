import { UnrecoverableError, Worker, type Job, type WorkerOptions } from "bullmq";
import type { Redis } from "ioredis";
import { NonRetriableError } from "./errors.js";

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
// 본 변환은 core 가 분류 시맨틱을 알지 못한 채 단순 매핑만 수행한다.
// 도메인(어떤 응답이 NonRetriable 인가)은 demo 가 결정한다.

export interface CoreJob<TData> {
  readonly id: string;
  readonly data: TData;
  readonly attemptsMade: number;
}

export type CoreJobHandler<TData> = (job: CoreJob<TData>) => Promise<void>;

export interface CreateWorkerOptions {
  readonly connection: Redis;
  /** BullMQ Worker 옵션. attempts 등 도메인 정책은 호출 측 결정. */
  readonly workerOptions?: Omit<WorkerOptions, "connection">;
}

/**
 * BullMQ Worker 를 생성한다.
 *
 * 핸들러가 `NonRetriableError` 를 throw 하면 BullMQ 의
 * `UnrecoverableError` 로 변환해 즉시 격리(재시도 없이 failed).
 * 그 외 에러는 그대로 propagate → BullMQ 가 backoff 에 따라 재시도.
 */
export function createWorker<TData>(
  name: string,
  handler: CoreJobHandler<TData>,
  opts: CreateWorkerOptions,
): Worker<TData, void, string> {
  const { connection, workerOptions } = opts;
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
  return worker;
}
