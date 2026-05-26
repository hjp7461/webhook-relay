import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import process from "node:process";
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

// 워커가 idle 상태(아무 job 도 처리하지 않은 채 blocking 명령 대기 중)에서
// 셧다운될 때 BullMQ 내부 duplicated ioredis 연결이 "Connection is closed"
// 를 unhandled 로 emit 한다. 본 테스트는 도메인 핸들러를 호출하지 않으므로
// idle 상태 그대로 종료된다. 운영에서는 동일 시나리오에서 프로세스가
// exit 하므로 영향 없음. 본 unhandled 는 테스트 결정성에 영향이 없으니
// 명시적으로 swallow 한다(원인/조건은 본 주석 참조).
function isBenignConnectionClosed(err: unknown): boolean {
  return (
    err instanceof Error && err.message === "Connection is closed."
  );
}

const benignHandler = (err: unknown): void => {
  if (!isBenignConnectionClosed(err)) {
    // 다른 unhandled 는 그대로 throw → Vitest 가 실패로 표기.
    throw err;
  }
};

beforeAll(async () => {
  process.on("unhandledRejection", benignHandler);
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
  process.removeListener("unhandledRejection", benignHandler);
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
