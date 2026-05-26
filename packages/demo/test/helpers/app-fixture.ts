import { randomUUID } from "node:crypto";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { buildServer, type BuiltServer } from "../../src/server.js";
import type { AppConfig } from "../../src/config.js";

// in-process Fastify + Worker 부팅 헬퍼.
//
// PLAN `03` §3.2 — 통합 테스트마다 고유한 큐 prefix(`randomUUID()`) 로
// 격리한다(CLAUDE.md §5).
//
// M5: 테스트가 DLQ 큐를 단언할 수 있도록 별도의 BullMQ Queue 핸들을
// 노출한다(PRD `02` §F2.4, PLAN `06` §3.1). 워커가 적재한 동일 dlqName
// 의 Redis 자료구조를 가리키므로 read 전용 단언에 사용.

export interface DlqJobEntry {
  readonly id: string;
  readonly name: string;
  readonly data: unknown;
}

export interface DlqQueueFacade {
  readonly name: string;
  countJobs(): Promise<number>;
  listJobs(): Promise<ReadonlyArray<DlqJobEntry>>;
  close(): Promise<void>;
}

export interface AppFixture {
  readonly server: BuiltServer;
  readonly baseUrl: string;
  readonly queueName: string;
  readonly dlqName: string;
  readonly dlqQueue: DlqQueueFacade;
  readonly bearerToken: string;
  stop(): Promise<void>;
}

export interface FixtureOptions {
  readonly redisUrl: string;
  readonly bearerToken?: string;
  readonly hmacSecret?: string;
  readonly allowPrivateTargets?: boolean;
  /** 워커 재시도 정책. 기본 1(M2 호환 — 재시도 없음). */
  readonly maxAttempts?: number;
  /** 백오프 base ms. M4 의 IT-S3 는 짧은 base 로 wall-clock 안정화. */
  readonly backoffBaseMs?: number;
  /**
   * BullMQ stalled 체크 주기(ms). M6 의 IT-S6 는 운영 기본(30s)을 테스트용
   * 으로 단축(예: 500ms). 본 옵션은 AppConfig 의 STALLED_INTERVAL_MS 로
   * 전달되며, server.ts 가 core.createWorker 의 BullMQ Worker 옵션에 주입한다.
   */
  readonly stalledIntervalMs?: number;
  /**
   * stalled 로 마킹되는 최대 횟수. M6 의 IT-S6 는 1 회만 stall 되는 시나리오
   * 이므로 기본 1.
   */
  readonly maxStalledCount?: number;
}

export async function startApp(opts: FixtureOptions): Promise<AppFixture> {
  const queueName = `webhook-it-${randomUUID()}`;
  const dlqName = `${queueName}-dlq`;
  const bearerToken = opts.bearerToken ?? "t".repeat(32);
  const hmacSecret = opts.hmacSecret ?? "h".repeat(32);
  const config: AppConfig = {
    REDIS_URL: opts.redisUrl,
    PORT: 0, // OS 가 임의 포트 할당.
    LOG_LEVEL: "warn",
    WEBHOOK_MAX_PAYLOAD_BYTES: 65536,
    WEBHOOK_DELIVERY_TIMEOUT_MS: 5_000,
    WEBHOOK_MAX_ATTEMPTS: opts.maxAttempts ?? 1,
    WEBHOOK_BACKOFF_BASE_MS: opts.backoffBaseMs ?? 1000,
    WEBHOOK_HMAC_SECRET: hmacSecret,
    WEBHOOK_HMAC_HEADER: "X-Webhook-Signature",
    QUEUE_NAME: queueName,
    DLQ_NAME: dlqName,
    STALLED_INTERVAL_MS: opts.stalledIntervalMs ?? 30000,
    MAX_STALLED_COUNT: opts.maxStalledCount ?? 1,
    SHUTDOWN_TIMEOUT_MS: 30000,
    REDIS_RECONNECT_BASE_MS: 200,
    REDIS_RECONNECT_MAX_MS: 10000,
    WORKER_CONCURRENCY: 1,
    API_BEARER_TOKEN: bearerToken,
    ALLOW_PRIVATE_TARGETS: opts.allowPrivateTargets ?? true,
  };

  const server = await buildServer(config);
  const address = await server.fastify.listen({ port: 0, host: "127.0.0.1" });

  // DLQ 큐를 read-only 단언용으로 별도의 ioredis 연결로 구성한다. 워커가
  // 적재한 같은 Redis 키를 가리킨다(같은 dlqName + 같은 Redis).
  const dlqConnection = new Redis(opts.redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  const dlqRawQueue = new Queue<unknown, unknown, string>(dlqName, {
    connection: dlqConnection,
  });

  const dlqQueue: DlqQueueFacade = {
    name: dlqName,
    async countJobs(): Promise<number> {
      // DLQ 는 추가만 되고 처리되지 않는다(I2.4). 그래도 보수적으로 모든
      // 상태를 합산.
      const counts = await dlqRawQueue.getJobCounts(
        "waiting",
        "active",
        "completed",
        "failed",
        "delayed",
      );
      return (
        (counts.waiting ?? 0) +
        (counts.active ?? 0) +
        (counts.completed ?? 0) +
        (counts.failed ?? 0) +
        (counts.delayed ?? 0)
      );
    },
    async listJobs(): Promise<ReadonlyArray<DlqJobEntry>> {
      const jobs = await dlqRawQueue.getJobs([
        "waiting",
        "active",
        "completed",
        "failed",
        "delayed",
      ]);
      return jobs.map((j) => ({
        id: j.id ?? "",
        name: j.name,
        data: j.data,
      }));
    },
    async close(): Promise<void> {
      try {
        await dlqRawQueue.close();
      } catch {
        // best-effort
      }
      try {
        await dlqConnection.quit();
      } catch {
        // best-effort
      }
    },
  };

  return {
    server,
    baseUrl: address,
    queueName,
    dlqName,
    dlqQueue,
    bearerToken,
    async stop(): Promise<void> {
      await dlqQueue.close();
      await server.close();
    },
  };
}

// 짧은 polling 헬퍼. 50ms 간격, 기본 5초 한도.
export async function pollUntil<T>(
  fn: () => Promise<T | undefined>,
  options: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<T> {
  const interval = options.intervalMs ?? 50;
  const timeout = options.timeoutMs ?? 5_000;
  const start = Date.now();
  while (true) {
    const v = await fn();
    if (v !== undefined) return v;
    if (Date.now() - start > timeout) {
      throw new Error(`pollUntil timed out after ${timeout}ms`);
    }
    await new Promise((r) => setTimeout(r, interval));
  }
}
