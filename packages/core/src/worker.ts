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
//
// stalled-loss recovery(best-effort):
// - BullMQ 의 'failed' 이벤트가 `job === undefined` 로 발화되는 케이스
//   (stalled job 메타데이터 복구 실패, lock 손실 등)에서 페이로드를 잃지
//   않기 위해, 핸들러 진입 시점에 (jobId → {data, attemptsMade}) 를
//   in-memory 맵에 등록하고 종료 시 제거한다. 'failed(undefined)' 가 오면
//   in-memory 후보(들)를 모두 DLQ 로 best-effort 적재한다.
// - 분류 정보가 없으므로 보수적으로 Retriable 로 적재(원래 재시도 가능했을
//   가능성이 큼). 중복 위험 < 손실 위험.
// - BullMQ 가 향후 jobId 를 error context 로 넘기면 그것을 우선 사용.

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
   * BullMQ stalled 체크 주기(ms). 운영 기본 30000ms(Q-STALL-1 (a)).
   * 본 값은 BullMQ Worker 옵션에 그대로 위임된다 — 자체 stalled 매니저는
   * 구현하지 않는다(PRD `02` §F2.5).
   *
   * `workerOptions.stalledInterval` 과 동시에 설정된 경우 본 옵션이 우선한다
   * (호출 측의 명시적 단일 채널을 보장하기 위함 — demo 의 STALLED_INTERVAL_MS
   * env 가 이 경로로 들어온다).
   */
  readonly stalledInterval?: number;
  /**
   * stalled 로 마킹되는 최대 횟수. 운영 기본 1(Q-STALL-1 (a)).
   * BullMQ Worker 옵션에 그대로 위임된다.
   */
  readonly maxStalledCount?: number;
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
/** stalled-loss recovery 를 위한 in-memory 활성 작업 엔트리. */
interface ActiveJobEntry<TData> {
  readonly data: TData;
  readonly attemptsMade: number;
}

export function createWorker<TData>(
  name: string,
  handler: CoreJobHandler<TData>,
  opts: CreateWorkerOptions<TData>,
): Worker<TData, void, string> {
  const { connection, workerOptions, stalledInterval, maxStalledCount, dlqQueue } = opts;
  // stalledInterval / maxStalledCount 단일 채널: workerOptions 의 동명 키보다
  // 본 모듈의 명시적 옵션이 우선한다(undefined 면 workerOptions 값을 그대로 사용).
  const mergedWorkerOptions: Omit<WorkerOptions, "connection"> = {
    ...workerOptions,
    ...(stalledInterval !== undefined ? { stalledInterval } : {}),
    ...(maxStalledCount !== undefined ? { maxStalledCount } : {}),
  };

  // 워커 프로세스 내부의 활성 작업 추적 맵. 핸들러 진입 시 등록, 종료 시 제거.
  // 'failed(undefined)' 이벤트에서 페이로드를 잃지 않기 위한 best-effort 채널.
  const activeJobs: Map<string, ActiveJobEntry<TData>> = new Map();
  const worker = new Worker<TData, void, string>(
    name,
    async (job: Job<TData, void, string>) => {
      const coreJob: CoreJob<TData> = {
        id: job.id ?? "",
        data: job.data,
        attemptsMade: job.attemptsMade,
      };
      // 활성 작업 등록. jobId 가 빈 문자열이면 추적 불가(BullMQ 는 보통 jobId 를
      // 부여하지만 안전망으로 분기).
      const trackingId = coreJob.id.length > 0 ? coreJob.id : undefined;
      if (trackingId !== undefined) {
        activeJobs.set(trackingId, { data: coreJob.data, attemptsMade: coreJob.attemptsMade });
      }
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
      } finally {
        // 핸들러가 정상/실패 모두 종료된 시점에 추적 제거. lock 손실 등으로
        // finally 자체가 도달하지 않는 경우는 'failed(undefined)' 적재 경로가
        // 책임진다(잔여 엔트리 = stalled-loss 후보).
        if (trackingId !== undefined) {
          activeJobs.delete(trackingId);
        }
      }
    },
    {
      ...mergedWorkerOptions,
      connection,
    },
  );

  if (dlqQueue !== undefined) {
    // 'failed' 이벤트 핸들러: 종단 실패만 DLQ 로 이동.
    // 본 핸들러는 promise 를 반환하지 않으며, 내부 await 결과는 의도적 처리
    // (실패 시 'error' 이벤트로 propagate — floating promise 금지 정책).
    worker.on("failed", (job, err) => {
      if (job === undefined) {
        // stalled-loss recovery: BullMQ 가 job 메타데이터를 복구하지 못한 케이스.
        // in-memory 활성 작업 후보(들)를 보수적으로 DLQ 로 적재.
        const candidates = collectStalledLossCandidates(activeJobs, err);
        if (candidates.length === 0) return;
        const ambiguous = candidates.length > 1;
        for (const [candidateId, entry] of candidates) {
          // 본 분기에서 활성 맵에서 제거(중복 적재 방지).
          activeJobs.delete(candidateId);
          void handleStalledLossForDlq(
            dlqQueue,
            name,
            candidateId,
            entry,
            err,
            ambiguous,
          ).catch((dlqErr: unknown) => {
            const wrapped =
              dlqErr instanceof Error ? dlqErr : new Error(String(dlqErr));
            worker.emit("error", wrapped);
          });
        }
        return;
      }
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
 * 'failed(undefined)' 분기에서 in-memory 활성 작업 중 stalled-loss 후보를 고른다.
 *
 * BullMQ 가 향후 error context 에 jobId 를 포함하는 경우(예: `(err as any).jobId`)
 * 그것을 우선 사용한다. 없으면 모든 활성 엔트리를 후보로 반환(보수적).
 */
function collectStalledLossCandidates<TData>(
  activeJobs: Map<string, ActiveJobEntry<TData>>,
  err: Error,
): Array<[string, ActiveJobEntry<TData>]> {
  // 향후 BullMQ 가 error 에 jobId 를 추가할 가능성에 대비한 best-effort 추출.
  const maybeJobId = (err as Error & { jobId?: unknown }).jobId;
  if (typeof maybeJobId === "string" && maybeJobId.length > 0) {
    const entry = activeJobs.get(maybeJobId);
    if (entry !== undefined) return [[maybeJobId, entry]];
  }
  // jobId 단서가 없으면 활성 맵 전체를 후보로(중복 위험 < 손실 위험).
  return Array.from(activeJobs.entries());
}

/**
 * stalled-loss 후보를 DLQ 로 적재한다. 분류 정보가 없으므로 보수적으로
 * Retriable 로 마킹. message 에 'stalled' 키워드를 포함해 운영자가 식별 가능.
 */
async function handleStalledLossForDlq<TData>(
  dlqQueue: Queue<DlqJobData<TData>, void, string>,
  jobName: string,
  candidateId: string,
  entry: ActiveJobEntry<TData>,
  err: Error,
  ambiguous: boolean,
): Promise<void> {
  const baseMessage = err.message.length > 0 ? err.message : "job metadata lost";
  const message = ambiguous
    ? `stalled-loss-recovered (ambiguous candidate ${candidateId}): ${baseMessage}`
    : `stalled-loss-recovered: ${baseMessage}`;
  const lastError: DlqLastError = {
    class: "Retriable",
    attemptsMade: entry.attemptsMade,
    message,
  };
  const dlqEntry = buildDlqEntry<TData>({
    data: entry.data,
    lastError,
  });
  await dlqQueue.add(jobName, dlqEntry);
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
