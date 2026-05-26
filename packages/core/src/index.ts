// Public surface of the core package.
//
// 도메인 비의존 모듈만 노출한다. 본 파일 자체에도 도메인 식별자가
// 등장해선 안 된다(CLAUDE.md §3, IT-R1).

export { createConnection, createQueue } from "./queue.js";
export type { ConnectionOptions, CreateQueueOptions } from "./queue.js";

export { createWorker } from "./worker.js";
export type { CoreJob, CoreJobHandler, CreateWorkerOptions } from "./worker.js";

export { addJob } from "./producer.js";
export type {
  AddJobOptions,
  AddJobResult,
  QueueAddCapable,
} from "./producer.js";

export { RetriableError, NonRetriableError } from "./errors.js";
export type { ClassifiedErrorContext } from "./errors.js";

export { delayForAttempt, buildWorkerRetryOptions } from "./retry.js";
export type { RetryPolicy, WorkerRetryOptions } from "./retry.js";
