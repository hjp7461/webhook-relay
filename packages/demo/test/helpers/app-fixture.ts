import { randomUUID } from "node:crypto";
import { buildServer, type BuiltServer } from "../../src/server.js";
import type { AppConfig } from "../../src/config.js";

// in-process Fastify + Worker 부팅 헬퍼.
//
// PLAN `03` §3.2 — 통합 테스트마다 고유한 큐 prefix(`randomUUID()`) 로
// 격리한다(CLAUDE.md §5).

export interface AppFixture {
  readonly server: BuiltServer;
  readonly baseUrl: string;
  readonly queueName: string;
  readonly bearerToken: string;
  stop(): Promise<void>;
}

export interface FixtureOptions {
  readonly redisUrl: string;
  readonly bearerToken?: string;
  readonly hmacSecret?: string;
  readonly allowPrivateTargets?: boolean;
}

export async function startApp(opts: FixtureOptions): Promise<AppFixture> {
  const queueName = `webhook-it-${randomUUID()}`;
  const bearerToken = opts.bearerToken ?? "t".repeat(32);
  const hmacSecret = opts.hmacSecret ?? "h".repeat(32);
  const config: AppConfig = {
    REDIS_URL: opts.redisUrl,
    PORT: 0, // OS 가 임의 포트 할당.
    LOG_LEVEL: "warn",
    WEBHOOK_MAX_PAYLOAD_BYTES: 65536,
    WEBHOOK_DELIVERY_TIMEOUT_MS: 5_000,
    WEBHOOK_MAX_ATTEMPTS: 1,
    WEBHOOK_BACKOFF_BASE_MS: 1000,
    WEBHOOK_HMAC_SECRET: hmacSecret,
    WEBHOOK_HMAC_HEADER: "X-Webhook-Signature",
    QUEUE_NAME: queueName,
    DLQ_NAME: `${queueName}-dlq`,
    STALLED_INTERVAL_MS: 30000,
    MAX_STALLED_COUNT: 1,
    SHUTDOWN_TIMEOUT_MS: 30000,
    REDIS_RECONNECT_BASE_MS: 200,
    REDIS_RECONNECT_MAX_MS: 10000,
    WORKER_CONCURRENCY: 1,
    API_BEARER_TOKEN: bearerToken,
    ALLOW_PRIVATE_TARGETS: opts.allowPrivateTargets ?? true,
  };

  const server = await buildServer(config);
  const address = await server.fastify.listen({ port: 0, host: "127.0.0.1" });

  return {
    server,
    baseUrl: address,
    queueName,
    bearerToken,
    async stop(): Promise<void> {
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
