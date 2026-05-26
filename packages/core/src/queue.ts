import { Queue, type QueueOptions } from "bullmq";
import { Redis, type RedisOptions } from "ioredis";

// core/queue.ts
//
// 도메인(웹훅) 비의존 큐/연결 팩토리.
// 환경변수를 직접 읽지 않는다(I5.2). 호출 측이 옵션 객체를 주입한다.
//
// 본 모듈은 BullMQ + ioredis 만 인지하며 어떤 도메인 식별자도 포함하지 않는다
// (CLAUDE.md §3, PRD `04` AC4.1, IT-R1 가드).

export interface ConnectionOptions {
  /** 예: redis://localhost:6379 */
  readonly url: string;
  /** Redis 재연결 백오프 base ms. */
  readonly reconnectBaseMs: number;
  /** Redis 재연결 백오프 상한 ms. */
  readonly reconnectMaxMs: number;
}

/**
 * ioredis `retryStrategy` 의 순수 함수 분리(테스트 가능성).
 *
 * 공식: `min(cap, base * 2^(times-1))`. PRD `06` §5 / CLAUDE.md §8 / I6.4 —
 * "Redis 재연결 폭주 방지". times>=1 은 ioredis 가 보장(첫 재연결 시도는 1).
 * times<1 인 호출이 와도 음의 지수가 되지 않도록 `Math.max(0, times-1)` 로 clamp.
 *
 * `reconnectBaseMs`/`reconnectMaxMs` 환경변수(demo 측 `config.ts` 의
 * `REDIS_RECONNECT_BASE_MS` / `REDIS_RECONNECT_MAX_MS`)가 본 함수의 base/cap
 * 으로 단일 채널을 통해 흘러든다.
 */
export function computeReconnectDelay(
  times: number,
  baseMs: number,
  maxMs: number,
): number {
  const base = Math.max(1, baseMs);
  const cap = Math.max(base, maxMs);
  return Math.min(cap, base * 2 ** Math.max(0, times - 1));
}

/**
 * BullMQ 가 사용할 ioredis 인스턴스를 생성한다.
 *
 * 재연결 백오프는 지수형으로 설정하며 상한을 둔다(PRD `06` §5,
 * I6.4 재연결 폭주 방지). BullMQ 권장 옵션(maxRetriesPerRequest=null,
 * enableReadyCheck=false)을 적용한다.
 */
export function createConnection(opts: ConnectionOptions): Redis {
  const ioOpts: RedisOptions = {
    // BullMQ 권장 — blocking 명령(brpoplpush 등) 사용 시 retry-per-request 제거.
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy(times: number): number {
      // 단일 공식(computeReconnectDelay)을 통해 검증된 백오프 공식을 적용.
      return computeReconnectDelay(times, opts.reconnectBaseMs, opts.reconnectMaxMs);
    },
    reconnectOnError(): boolean {
      // 보수적으로 자동 재연결 시도. 폭주는 retryStrategy 가 제어.
      return true;
    },
  };
  return new Redis(opts.url, ioOpts);
}

export interface CreateQueueOptions {
  /** ioredis 연결 인스턴스(반드시 createConnection 으로 만든 것). */
  readonly connection: Redis;
  /** BullMQ Queue 추가 옵션(필요 시). */
  readonly queueOptions?: Omit<QueueOptions, "connection">;
}

/**
 * BullMQ Queue 를 생성한다. 큐 이름은 호출 측이 결정한다(매직 스트링은
 * `demo/constants.ts` 가 단일 출처 — `core` 는 식별자를 모른다).
 */
export function createQueue<TData = unknown, TResult = unknown, TName extends string = string>(
  name: TName,
  opts: CreateQueueOptions,
): Queue<TData, TResult, TName> {
  const { connection, queueOptions } = opts;
  return new Queue<TData, TResult, TName>(name, {
    ...queueOptions,
    connection,
  });
}
