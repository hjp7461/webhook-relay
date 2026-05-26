import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { createServer as createNetServer, type AddressInfo } from "node:net";
import { startRedisContainer, type StartedRedis } from "./helpers/redis-container.js";
import { spawnServer, type SpawnedServer } from "./helpers/spawn-server.js";
import { delta, getSeries, parseMetrics } from "./helpers/metrics-parser.js";

// IT-OBS-6.S7 — Graceful shutdown 메트릭 단언
//
// PLAN `docs/plan-phase3/04-m-obs-3-demo-metrics.md` §3 IT-OBS-6 표 S7 행.
//
// 단언:
//   1) draining 진행 중 `/webhooks` 503 + `/healthz` 503 응답이 D1 5xx 라벨로
//      계측된다.
//   2) C9 `state="draining"` Gauge 가 1 로 전이된 것을 draining 중 스크레이프로
//      확인. `state="running"` 은 0 으로 전이.
//   3) 자식 종료 후 exit 0 (잔여 작업 없음 → C10 = 0 잠정).
//
// 본 시나리오는 자식 프로세스(spawn-server) 기반이므로 다른 IT-OBS-6 하위
// 케이스와 격리되어 별도 파일.

const SHUTDOWN_TIMEOUT_MS = 5_000;

interface StubReceiver {
  readonly server: Server;
  readonly url: string;
  readonly hits: ReadonlyArray<{ at: number; body: unknown }>;
  setDelay(ms: number): void;
  stop(): Promise<void>;
}

async function startStubReceiver(): Promise<StubReceiver> {
  const hits: { at: number; body: unknown }[] = [];
  let delayMs = 0;
  const server = createServer((req, res) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      raw += chunk;
    });
    req.on("end", () => {
      let body: unknown = undefined;
      try {
        body = raw.length > 0 ? JSON.parse(raw) : undefined;
      } catch {
        body = raw;
      }
      hits.push({ at: Date.now(), body });
      const finish = (): void => {
        if (!res.writableEnded) {
          res.statusCode = 200;
          res.end("ok");
        }
      };
      if (delayMs > 0) {
        setTimeout(finish, delayMs);
      } else {
        finish();
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${addr.port}/`;
  return {
    server,
    url,
    get hits(): ReadonlyArray<{ at: number; body: unknown }> {
      return hits;
    },
    setDelay(ms: number): void {
      delayMs = ms;
    },
    async stop(): Promise<void> {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

async function pickFreePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const srv = createNetServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address() as AddressInfo;
      const port = addr.port;
      srv.close(() => resolve(port));
    });
  });
}

async function waitFor(
  fn: () => Promise<boolean> | boolean,
  options: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<void> {
  const interval = options.intervalMs ?? 50;
  const timeout = options.timeoutMs ?? 5_000;
  const start = Date.now();
  while (true) {
    if (await fn()) return;
    if (Date.now() - start > timeout) {
      throw new Error(`waitFor timed out after ${timeout}ms`);
    }
    await new Promise((r) => setTimeout(r, interval));
  }
}

function buildChildEnv(input: {
  redisUrl: string;
  queueName: string;
  dlqName: string;
  bearerToken: string;
  hmacSecret: string;
  port: number;
}): NodeJS.ProcessEnv {
  return {
    PATH: process.env["PATH"] ?? "",
    NODE_ENV: "test",
    REDIS_URL: input.redisUrl,
    PORT: String(input.port),
    LOG_LEVEL: "info",
    QUEUE_NAME: input.queueName,
    DLQ_NAME: input.dlqName,
    API_BEARER_TOKEN: input.bearerToken,
    WEBHOOK_HMAC_SECRET: input.hmacSecret,
    WEBHOOK_MAX_ATTEMPTS: "1",
    WEBHOOK_BACKOFF_BASE_MS: "1000",
    WEBHOOK_DELIVERY_TIMEOUT_MS: "30000",
    WEBHOOK_MAX_PAYLOAD_BYTES: "65536",
    WORKER_CONCURRENCY: "1",
    ALLOW_PRIVATE_TARGETS: "true",
    SHUTDOWN_TIMEOUT_MS: String(SHUTDOWN_TIMEOUT_MS),
    STALLED_INTERVAL_MS: "30000",
    MAX_STALLED_COUNT: "1",
    REDIS_RECONNECT_BASE_MS: "200",
    REDIS_RECONNECT_MAX_MS: "10000",
  };
}

let redis: StartedRedis;
let receiver: StubReceiver;

beforeAll(async () => {
  redis = await startRedisContainer();
  receiver = await startStubReceiver();
}, 120_000);

afterAll(async () => {
  if (receiver) await receiver.stop();
  if (redis) await redis.stop();
}, 60_000);

describe("IT-OBS-6.S7 graceful shutdown metrics", () => {
  it("draining → /webhooks 503 + /healthz 503 → D1 5xx +, C9 state transitions running→draining, exit 0", async () => {
    receiver.setDelay(1_500);

    const queueName = `webhook-it-obs-6-s7-${randomUUID()}`;
    const dlqName = `${queueName}-dlq`;
    const bearerToken = "a".repeat(32);
    const hmacSecret = "h".repeat(32);
    const port = await pickFreePort();
    const env = buildChildEnv({
      redisUrl: redis.url,
      queueName,
      dlqName,
      bearerToken,
      hmacSecret,
      port,
    });

    let server: SpawnedServer | undefined;
    try {
      server = await spawnServer({ env });

      // baseline 스크레이프 (running 상태).
      const beforeRes = await fetch(`${server.baseUrl}/metrics`);
      expect(beforeRes.status).toBe(200);
      const before = parseMetrics(await beforeRes.text());
      // running=1, draining=0, terminated=0.
      expect(getSeries(before, "webhook_relay_shutdown_state", { state: "running" })).toBe(1);
      expect(getSeries(before, "webhook_relay_shutdown_state", { state: "draining" })).toBe(0);

      // 1) 송신 1건 → 워커 픽업.
      const initialHits = receiver.hits.length;
      const idempotencyKey = `it-obs-6-s7-${randomUUID()}`;
      const postRes = await fetch(`${server.baseUrl}/webhooks`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({
          url: receiver.url,
          payload: { event: "it-obs-6-s7", id: 1 },
          idempotencyKey,
        }),
      });
      expect(postRes.status).toBe(202);

      await waitFor(() => receiver.hits.length >= initialHits + 1, {
        intervalMs: 25,
        timeoutMs: 5_000,
      });

      // 2) SIGTERM.
      server.kill("SIGTERM");

      // 3) draining 503 안정화 — 추가 /webhooks 와 /healthz 가 503 응답.
      await waitFor(
        async () => {
          try {
            const r = await fetch(`${server!.baseUrl}/webhooks`, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                authorization: `Bearer ${bearerToken}`,
              },
              body: JSON.stringify({
                url: receiver.url,
                payload: { event: "blocked", id: 2 },
                idempotencyKey: `it-obs-6-s7-blocked-${randomUUID()}`,
              }),
            });
            return r.status === 503;
          } catch {
            return false;
          }
        },
        { intervalMs: 25, timeoutMs: 3_000 },
      );

      const healthzRes = await fetch(`${server.baseUrl}/healthz`);
      expect(healthzRes.status).toBe(503);

      // 4) draining 중 스크레이프 — D1 503 라벨 + C9 draining=1.
      const drainingMetricsRes = await fetch(`${server.baseUrl}/metrics`);
      expect(drainingMetricsRes.status).toBe(200);
      const draining = parseMetrics(await drainingMetricsRes.text());

      // D1 /webhooks 5xx +1 이상.
      const webhooks5xxDelta = delta(
        before,
        draining,
        "webhook_relay_api_requests_total",
        { route: "/webhooks", method: "POST", status_class: "5xx" },
      );
      expect(webhooks5xxDelta).toBeGreaterThanOrEqual(1);
      // D1 /healthz 5xx +1 이상.
      const healthz5xxDelta = delta(
        before,
        draining,
        "webhook_relay_api_requests_total",
        { route: "/healthz", method: "GET", status_class: "5xx" },
      );
      expect(healthz5xxDelta).toBeGreaterThanOrEqual(1);
      // C9: running=0, draining=1, terminated=0 (또는 terminated 직전 상태).
      // draining 으로 전이됨을 단언(draining 또는 terminated 가 1 — terminated 는
      // close 직전 짧은 순간이라 보통 draining 이 1).
      const drainingVal = getSeries(draining, "webhook_relay_shutdown_state", {
        state: "draining",
      });
      const terminatedVal = getSeries(draining, "webhook_relay_shutdown_state", {
        state: "terminated",
      });
      expect(drainingVal === 1 || terminatedVal === 1).toBe(true);
      // running 은 더 이상 1 이 아님.
      expect(
        getSeries(draining, "webhook_relay_shutdown_state", { state: "running" }),
      ).toBe(0);

      // 5) 자식 종료 → exit 0.
      const { code } = await server.waitForExit(SHUTDOWN_TIMEOUT_MS + 5_000);
      expect(code).toBe(0);
    } finally {
      if (server && server.child.exitCode === null && server.child.signalCode === null) {
        try {
          server.kill("SIGKILL");
        } catch {
          // best-effort
        }
      }
    }
  }, 30_000);
});
