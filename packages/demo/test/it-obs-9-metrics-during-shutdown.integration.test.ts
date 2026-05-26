import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { createServer as createNetServer, type AddressInfo } from "node:net";
import { startRedisContainer, type StartedRedis } from "./helpers/redis-container.js";
import { spawnServer, type SpawnedServer } from "./helpers/spawn-server.js";

// IT-OBS-9 — 셧다운 진행 중 `/metrics` 200 유지 (Q-OBS-2 (a))
//
// PLAN `docs/plan-phase3/05-m-obs-4-grafana.md` §3 IT-OBS-9.
// PRD `prd-phase3/02-metrics-endpoint.md` §6 / AC4.4.
//
// 단언:
//   1) api + worker (in-process all-mode) 부트스트랩.
//   2) 핸들러를 의도적으로 느린 stub 수신자(300ms 대기)로 고정 → 워커 처리 중.
//   3) SIGTERM 전송 → draining 진입.
//   4) draining 상태에서:
//        - GET /metrics → 200 (PRD I4.4, AC4.4) + 본문에
//          `webhook_relay_shutdown_state{state="draining"} 1` 등장.
//        - POST /webhooks → 503 (1~2단계 PRD `06` §6.2 정합 — 회귀 보호).
//        - GET /healthz → 503 (Q-SEC-5 (a) 정합 — 회귀 보호).
//   5) 자식 정상 종료 — exit 0 (잔여 작업 없음).

const SHUTDOWN_TIMEOUT_MS = 5_000;
const HANDLER_DELAY_MS = 300;

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
          res.setHeader("content-type", "text/plain");
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

describe("IT-OBS-9 /metrics during graceful shutdown (Q-OBS-2 (a))", () => {
  it("returns 200 with shutdown_state=draining while /webhooks and /healthz return 503, exit 0", async () => {
    receiver.setDelay(HANDLER_DELAY_MS);

    const queueName = `webhook-it-obs-9-${randomUUID()}`;
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

      // 1) 송신 1건 → 워커 픽업 확인.
      const initialHits = receiver.hits.length;
      const idempotencyKey = `it-obs-9-${randomUUID()}`;
      const postRes = await fetch(`${server.baseUrl}/webhooks`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({
          url: receiver.url,
          payload: { event: "it-obs-9", id: 1 },
          idempotencyKey,
        }),
      });
      expect(postRes.status).toBe(202);

      await waitFor(() => receiver.hits.length >= initialHits + 1, {
        intervalMs: 25,
        timeoutMs: 5_000,
      });

      // 2) SIGTERM → draining 진입.
      server.kill("SIGTERM");

      // 3) draining 503 안정화 — /webhooks 폴링으로 draining 진입 시점 동기화.
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
                idempotencyKey: `it-obs-9-blocked-${randomUUID()}`,
              }),
            });
            return r.status === 503;
          } catch {
            return false;
          }
        },
        { intervalMs: 25, timeoutMs: 3_000 },
      );

      // 4-a) draining 중 /metrics → 200 + 본문에 shutdown_state=draining 1 등장.
      const metricsRes = await fetch(`${server.baseUrl}/metrics`);
      expect(metricsRes.status).toBe(200);
      const body = await metricsRes.text();
      // draining 또는 terminated(close 직전 짧은 순간) 둘 다 허용.
      // IT-OBS-6.S7 동일 패턴.
      const drainingLine =
        /^webhook_relay_shutdown_state\{[^}]*state="draining"[^}]*\}\s+1\b/m.test(body);
      const terminatedLine =
        /^webhook_relay_shutdown_state\{[^}]*state="terminated"[^}]*\}\s+1\b/m.test(body);
      expect(drainingLine || terminatedLine).toBe(true);
      // running 은 0 으로 전이.
      const runningZero =
        /^webhook_relay_shutdown_state\{[^}]*state="running"[^}]*\}\s+0\b/m.test(body);
      expect(runningZero).toBe(true);

      // 4-b) draining 중 /healthz → 503.
      const healthzRes = await fetch(`${server.baseUrl}/healthz`);
      expect(healthzRes.status).toBe(503);

      // 4-c) draining 중 추가 /webhooks → 503 (회귀 보호).
      const webhooksRes = await fetch(`${server.baseUrl}/webhooks`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({
          url: receiver.url,
          payload: { event: "blocked-final", id: 3 },
          idempotencyKey: `it-obs-9-blocked-final-${randomUUID()}`,
        }),
      });
      expect(webhooksRes.status).toBe(503);

      // 5) 자식 종료 → exit 0 (잔여 작업 없음).
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
