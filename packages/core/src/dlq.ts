import { Queue, type QueueOptions } from "bullmq";
import type { Redis } from "ioredis";

import { registerQueueForMetrics } from "./queue.js";

// core/dlq.ts
//
// DLQ(dead-letter queue) 추상: 별도 BullMQ Queue + 적재할 엔트리 빌더.
//
// 본 모듈의 책임:
// 1. createDlqQueue(name, connection, options?) — 별도 BullMQ Queue 인스턴스 생성
//    (PRD `02` §F2.4 — DLQ 는 자체 자료구조가 아닌 별도 Queue).
// 2. buildDlqEntry — 원본 페이로드(data) + lastError 컨텍스트를 한 객체로 묶는
//    데이터 빌더(원본 작업을 옮기는 게 아니라 새 항목을 DLQ.add 로 적재).
// 3. DlqJobData<TData> 타입 — DLQ 큐에 적재되는 항목의 데이터 모양.
//
// 결정 잠금:
// - Q-DLQ-1 (a) — 격리만(자동 재투입 없음). 본 모듈에는 requeue() 같은
//   인터페이스 스텁을 두지 않는다(PLAN `06` §1, CLAUDE.md §7-3).
//
// 본 파일에는 도메인 식별자(특정 도메인 명칭)가 등장해선 안 된다
// (CLAUDE.md §3, IT-R1, AC-M5-4).

/**
 * DLQ 엔트리의 마지막 에러 컨텍스트.
 *
 * - class: 분류 결과("Retriable" 또는 "NonRetriable").
 * - httpStatus: 외부 응답 HTTP 상태(있을 때).
 * - attemptsMade: 마지막 시도 직후의 시도 횟수.
 * - message: 사람 읽을 수 있는 에러 메시지(시크릿 금지).
 */
export interface DlqLastError {
  readonly class: "Retriable" | "NonRetriable";
  readonly httpStatus?: number;
  readonly attemptsMade: number;
  readonly message?: string;
}

/**
 * DLQ 큐의 작업 데이터. 원본 작업 데이터 + lastError 메타.
 */
export interface DlqJobData<TData> {
  readonly data: TData;
  readonly lastError: DlqLastError;
}

export interface CreateDlqQueueOptions {
  readonly connection: Redis;
  readonly queueOptions?: Omit<QueueOptions, "connection">;
}

/**
 * DLQ 전용 BullMQ Queue 를 생성한다. 이름은 호출 측이 결정한다
 * (매직 스트링 단일 출처는 demo/constants.ts — `core` 는 식별자를 모른다).
 *
 * DLQ 큐는 워커가 attach 하지 않는다(자동 재투입 없음, Q-DLQ-1 (a)).
 */
export function createDlqQueue<TData>(
  name: string,
  opts: CreateDlqQueueOptions,
): Queue<DlqJobData<TData>, void, string> {
  const { connection, queueOptions } = opts;
  const queue = new Queue<DlqJobData<TData>, void, string>(name, {
    ...queueOptions,
    connection,
  });
  // M-OBS-2: DLQ 도 C1 queue_depth 풀에 등록(별도 `queue` 라벨 값으로 노출 —
  // PRD `prd-phase3/01` §3.1 C1 정합, §4.2 `queue` enum 정합).
  registerQueueForMetrics(queue);
  return queue;
}

export interface BuildDlqEntryInput<TData> {
  readonly data: TData;
  readonly lastError: DlqLastError;
}

/**
 * DLQ.add 의 두 번째 인자로 넘길 데이터 객체를 만든다. 원본 페이로드
 * 와 분류된 에러 컨텍스트를 보존한다(PRD `02` §F2.4).
 */
export function buildDlqEntry<TData>(input: BuildDlqEntryInput<TData>): DlqJobData<TData> {
  return {
    data: input.data,
    lastError: input.lastError,
  };
}
