import type { JobsOptions } from "bullmq";

// core/producer.ts
//
// 도메인 비의존 작업 등록 헬퍼.
// BullMQ 의 `Queue.add(name, data, { jobId })` 를 얇게 위임한다.
//
// 본 모듈의 책임은 단 하나 — "결정론적 jobId 로 작업을 등록한다" 이다.
// BullMQ 는 동일 jobId 로 add 시 기존 작업을 보존하고 새 추가를 무시하여
// 중복을 흡수한다(PRD `02` §F2.1). 이 동작에 직접 의존하며, 자체 키
// 저장소(Redis SET 등)는 만들지 않는다.
//
// 본 파일에 도메인 식별자가 등장해선 안 된다(CLAUDE.md §3, IT-R1).

export interface AddJobOptions {
  /**
   * 결정론적 작업 식별자. 동일 값으로 다시 호출하면 BullMQ 가 새 작업을
   * 만들지 않고 무시하여 중복 적재가 발생하지 않는다.
   */
  readonly jobId: string;
}

export interface AddJobResult {
  readonly jobId: string;
}

/**
 * BullMQ Queue 의 `add` 메서드만을 구조적으로 요구하는 최소 인터페이스.
 *
 * BullMQ Queue 의 `NameType` 제네릭은 `ExtractNameType<DataTypeOrJob, ...>`
 * 조건부 타입에 의해 함수 내부에서 환원되지 않는다(자유 변수 환경). 본
 * 헬퍼는 호출 측의 도메인 식별자에 결합되지 않아야 하므로(CLAUDE.md §3,
 * IT-R1) Queue 전체 타입을 직접 노출하지 않고 add 시그니처만 추출한다.
 */
export interface QueueAddCapable<TData> {
  add(name: string, data: TData, opts?: JobsOptions): Promise<unknown>;
}

/**
 * 큐에 작업을 등록한다.
 *
 * BullMQ 의 jobId 기반 중복 방지에 의존(F2.1). 호출 측은 jobId 가 동일하면
 * 같은 작업으로 간주된다는 사실을 알고 사용해야 한다.
 *
 * 도메인 시맨틱(예: 멱등성 키 형식, 에러 코드)은 호출 측의 책임이다.
 *
 * 제네릭은 페이로드(`TData`) 한 개만 노출한다(Q-ARCH-4 (a) 와 동일 정책).
 */
export async function addJob<TData>(
  queue: QueueAddCapable<TData>,
  name: string,
  data: TData,
  options: AddJobOptions,
): Promise<AddJobResult> {
  await queue.add(name, data, { jobId: options.jobId });
  return { jobId: options.jobId };
}
