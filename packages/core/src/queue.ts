import { Queue, type QueueOptions } from "bullmq";
import { Redis, type RedisOptions } from "ioredis";

import {
  JOB_STATE_ACTIVE,
  JOB_STATE_COMPLETED,
  JOB_STATE_DELAYED,
  JOB_STATE_FAILED,
  JOB_STATE_WAITING,
  LABEL_JOB_STATE,
  LABEL_QUEUE,
  QUEUE_DEPTH_JOB_STATES,
} from "./constants.js";
import {
  redisReconnectsTotal,
  redisUp,
  registerQueueDepthCollector,
  unregisterQueueDepthCollector,
  type QueueDepthCollector,
} from "./metrics.js";
import type { Gauge } from "prom-client";

// core/queue.ts
//
// 도메인(웹훅) 비의존 큐/연결 팩토리.
// 환경변수를 직접 읽지 않는다(I5.2). 호출 측이 옵션 객체를 주입한다.
//
// 본 모듈은 BullMQ + ioredis 만 인지하며 어떤 도메인 식별자도 포함하지 않는다
// (CLAUDE.md §3, PRD `04` AC4.1, IT-R1 가드).
//
// M-OBS-2 추가:
// - C1 webhook_relay_queue_depth — Gauge.collect() hook 으로 scrape 시점에
//   `queue.getJobCounts()` 호출 후 상태별 라벨 set. 매 작업마다 호출하지 않는다
//   (PRD `prd-phase3/01` §3.1 C1 / I3.5 hot path 무영향).
// - C7 webhook_relay_redis_reconnects_total — ioredis `reconnecting` 이벤트.
// - C8 webhook_relay_redis_up — ioredis `connect`/`ready` → 1, `end`/`error` → 0.

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

// ---------------------------------------------------------------------------
// C8 redis_up 의 초기값.
//
// `redisUp` 은 import 시점에 0(prom-client default). 첫 connect 이벤트에서 1
// 로 전환된다. 본 메트릭은 라벨이 없으므로 `inc()`/`set()` 가 단일 시계열에
// 작용한다.
// ---------------------------------------------------------------------------

// ioredis 인스턴스에 메트릭 리스너가 이미 부착되었는지 추적(idempotent).
// 같은 connection 을 두 번 attach 호출해도 리스너가 중복되지 않도록 보장.
const ATTACHED_CONNECTIONS = new WeakSet<Redis>();

function attachConnectionMetrics(connection: Redis): void {
  if (ATTACHED_CONNECTIONS.has(connection)) return;
  ATTACHED_CONNECTIONS.add(connection);

  // C7 — reconnecting 이벤트마다 카운터 증가.
  connection.on("reconnecting", () => {
    redisReconnectsTotal.inc();
  });
  // C8 — connect/ready 면 1, end/error 면 0.
  connection.on("connect", () => {
    redisUp.set(1);
  });
  connection.on("ready", () => {
    redisUp.set(1);
  });
  connection.on("end", () => {
    redisUp.set(0);
  });
  connection.on("error", () => {
    redisUp.set(0);
  });
}

/**
 * BullMQ 가 사용할 ioredis 인스턴스를 생성한다.
 *
 * 재연결 백오프는 지수형으로 설정하며 상한을 둔다(PRD `06` §5,
 * I6.4 재연결 폭주 방지). BullMQ 권장 옵션(maxRetriesPerRequest=null,
 * enableReadyCheck=false)을 적용한다.
 *
 * M-OBS-2: C7/C8 메트릭 리스너를 부착한다(idempotent).
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
  const connection = new Redis(opts.url, ioOpts);
  attachConnectionMetrics(connection);
  return connection;
}

export interface CreateQueueOptions {
  /** ioredis 연결 인스턴스(반드시 createConnection 으로 만든 것). */
  readonly connection: Redis;
  /** BullMQ Queue 추가 옵션(필요 시). */
  readonly queueOptions?: Omit<QueueOptions, "connection">;
}

// ---------------------------------------------------------------------------
// C1 queue_depth — 큐별 collector 를 metrics 모듈의 collector 풀에 등록한다.
// ---------------------------------------------------------------------------

// 같은 큐를 두 번 등록해도 collector 가 중복 추가되지 않도록 추적.
const QUEUE_COLLECTOR_MAP: WeakMap<Queue, QueueDepthCollector> = new WeakMap();

/**
 * BullMQ Queue 를 C1 queue_depth 메트릭의 scrape-time collector 에 등록한다.
 *
 * collector 는 scrape 시점에 `queue.getJobCounts()` 를 await 한 뒤 상태별
 * 라벨에 `gauge.set()` 한다. 핸들러 hot path 와 무관(I3.5 보호).
 *
 * idempotent: 같은 큐를 두 번 등록해도 collector 는 한 번만 부착된다.
 * 큐가 close 되면 collector 가 자동 unregister 된다.
 */
function registerQueueForMetrics(queue: Queue): void {
  if (QUEUE_COLLECTOR_MAP.has(queue)) return;

  const collector: QueueDepthCollector = async (
    gauge: Gauge<string>,
  ): Promise<void> => {
    const counts = await queue.getJobCounts(
      JOB_STATE_WAITING,
      JOB_STATE_ACTIVE,
      JOB_STATE_DELAYED,
      JOB_STATE_COMPLETED,
      JOB_STATE_FAILED,
    );
    for (const stateName of QUEUE_DEPTH_JOB_STATES) {
      const value = counts[stateName];
      gauge.set(
        { [LABEL_QUEUE]: queue.name, [LABEL_JOB_STATE]: stateName },
        typeof value === "number" ? value : 0,
      );
    }
  };
  QUEUE_COLLECTOR_MAP.set(queue, collector);
  registerQueueDepthCollector(collector);

  // BullMQ Queue 는 'close' 이벤트를 노출하지 않으므로 close 메서드를 wrap 한다.
  // wrap 이 한 번만 일어나도록 marker 를 둔다(idempotent).
  const marker = queue as Queue & { __metricsCloseWrapped?: boolean };
  if (marker.__metricsCloseWrapped === true) return;
  marker.__metricsCloseWrapped = true;
  const originalClose = queue.close.bind(queue);
  queue.close = function (
    ...args: Parameters<typeof originalClose>
  ): ReturnType<typeof originalClose> {
    const c = QUEUE_COLLECTOR_MAP.get(queue);
    if (c !== undefined) {
      unregisterQueueDepthCollector(c);
      QUEUE_COLLECTOR_MAP.delete(queue);
    }
    return originalClose(...args);
  };
}

/**
 * BullMQ Queue 를 생성한다. 큐 이름은 호출 측이 결정한다(매직 스트링은
 * demo 측 단일 출처 — `core` 는 식별자를 모른다).
 *
 * M-OBS-2: 생성된 큐는 C1 queue_depth scrape collector 에 자동 등록된다.
 */
export function createQueue<TData = unknown, TResult = unknown, TName extends string = string>(
  name: TName,
  opts: CreateQueueOptions,
): Queue<TData, TResult, TName> {
  const { connection, queueOptions } = opts;
  const queue = new Queue<TData, TResult, TName>(name, {
    ...queueOptions,
    connection,
  });
  registerQueueForMetrics(queue);
  return queue;
}

// 외부 wiring 노출 — DLQ 큐 등 createQueue 를 거치지 않은 큐도 메트릭 풀에
// 등록할 수 있도록 export 한다(I4.2 — 도메인 식별자 없음).
export { registerQueueForMetrics };
