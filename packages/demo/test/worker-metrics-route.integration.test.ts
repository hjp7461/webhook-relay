import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { startRedisContainer, type StartedRedis } from "./helpers/redis-container.js";
import { buildWorkerServer, type BuiltWorkerServer } from "../src/server.js";
import type { AppConfig } from "../src/config.js";

// IT — GET /metrics (SERVICE_MODE=worker mode)
//
// PLAN `docs/plan-phase3/02-m-obs-1-bootstrap.md` §3 시퀀스 4번 + §4-7.
//
// 단언:
//   - buildWorkerServer() 가 metricsApp(Fastify) 을 노출하고, `WORKER_METRICS_PORT=0`
//     로 listen 하면 OS 가 임의 포트를 할당한다.
//   - 할당된 포트로 GET /metrics → 200.
//   - Content-Type 본문 prefix `text/plain; version=0.0.4`.
//   - 본문에 prom-client 기본 메트릭(`nodejs_*` 또는 `process_*`) 1건 이상.
//   - 본 PLAN 범위에서는 C1~C11 도메인 메트릭 단언 없음(M-OBS-2 책임).

let redis: StartedRedis;
let built: BuiltWorkerServer;
let metricsBaseUrl: string;

beforeAll(async () => {
  redis = await startRedisContainer();

  const queueName = `webhook-it-worker-${randomUUID()}`;
  const dlqName = `${queueName}-dlq`;
  const config: AppConfig = {
    REDIS_URL: redis.url,
    PORT: 0,
    LOG_LEVEL: "warn",
    WEBHOOK_MAX_PAYLOAD_BYTES: 65536,
    WEBHOOK_DELIVERY_TIMEOUT_MS: 5_000,
    WEBHOOK_MAX_ATTEMPTS: 1,
    WEBHOOK_BACKOFF_BASE_MS: 1000,
    WEBHOOK_HMAC_SECRET: "h".repeat(32),
    WEBHOOK_HMAC_HEADER: "X-Webhook-Signature",
    QUEUE_NAME: queueName,
    DLQ_NAME: dlqName,
    STALLED_INTERVAL_MS: 30000,
    MAX_STALLED_COUNT: 1,
    SHUTDOWN_TIMEOUT_MS: 30000,
    REDIS_RECONNECT_BASE_MS: 200,
    REDIS_RECONNECT_MAX_MS: 10000,
    WORKER_CONCURRENCY: 1,
    API_BEARER_TOKEN: "t".repeat(32),
    ALLOW_PRIVATE_TARGETS: true,
    SERVICE_MODE: "worker",
    // OS 자동 포트 할당. listen() 의 반환 address 로 실제 포트 추출.
    WORKER_METRICS_PORT: 0,
  };

  built = await buildWorkerServer(config);
  metricsBaseUrl = await built.metricsApp.listen({
    port: config.WORKER_METRICS_PORT,
    host: "127.0.0.1",
  });
}, 120_000);

afterAll(async () => {
  if (built) await built.close();
  if (redis) await redis.stop();
}, 60_000);

describe("GET /metrics — SERVICE_MODE=worker mode", () => {
  it("returns 200 with Prometheus exposition Content-Type and default metrics", async () => {
    const res = await fetch(`${metricsBaseUrl}/metrics`);
    expect(res.status).toBe(200);

    const contentType = res.headers.get("content-type") ?? "";
    expect(contentType).toMatch(/^text\/plain; version=0\.0\.4/);

    const body = await res.text();
    const hasDefault = /^(nodejs|process)_/m.test(body);
    expect(hasDefault).toBe(true);
  });
});
