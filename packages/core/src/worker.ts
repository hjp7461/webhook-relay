import { Worker, type Job, type WorkerOptions } from "bullmq";
import type { Redis } from "ioredis";

// core/worker.ts
//
// 도메인 비의존 워커 팩토리. 핸들러는 외부 주입(Q-ARCH-4 (a) — `<TData>` 1개 제네릭).
//
// CLAUDE.md §3, PRD `04` §7 — 도메인 매핑은 demo 측 책임. core 는 BullMQ
// Worker 옵션을 제공하고 핸들러를 invoke 한다.

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
 * BullMQ Worker 를 생성한다. M2 시점에는 안정성 우선 — 재시도 옵션은
 * 표면에만 노출하고 `attempts` 기본은 호출 측이 1로 지정(PLAN `03` §8).
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
      await handler(coreJob);
    },
    {
      ...workerOptions,
      connection,
    },
  );
  return worker;
}
