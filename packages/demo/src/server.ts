import Fastify, { type FastifyInstance } from "fastify";
import {
  createConnection,
  createQueue,
  createWorker,
  type CoreJobHandler,
} from "@webhook-relay/core";
import type { Queue, Worker } from "bullmq";
import type { Redis } from "ioredis";

import type { AppConfig } from "./config.js";
import { loadConfigFromProcessEnv } from "./config.js";
import { ReceiverStore } from "./receiver/store.js";
import { registerWebhooksRoute } from "./api/webhooks.js";
import { registerReceiverRoute } from "./api/receiver.js";
import { registerDashboardRoutes } from "./api/dashboard.js";
import { registerHealthzRoute } from "./api/healthz.js";
import { createWebhookDeliveryHandler } from "./handlers/webhook-delivery.js";
import type { WebhookJobData } from "./domain/schemas.js";

// demo/server.ts
//
// 부트스트랩: 환경변수 파싱 → 연결 → 큐/워커 → Fastify 라우트 등록.
// API 와 워커가 같은 프로세스에서 동작(PRD `01` MVP 범위).
// SIGINT/SIGTERM 수신 시 close 호출은 최소한만 — 전체 시퀀스는 M7 의 책임.

export interface BuiltServer {
  readonly fastify: FastifyInstance;
  readonly queue: QueueFacade;
  readonly worker: Worker<WebhookJobData, void, string>;
  readonly receiverStore: ReceiverStore;
  readonly connection: Redis;
  close(): Promise<void>;
}

// 통합 테스트가 사용할 작은 facade — getJobState 등 자주 쓰는 메서드를 노출.
export interface QueueFacade {
  readonly raw: Queue<WebhookJobData, void, string>;
  getJobState(jobId: string): Promise<string | undefined>;
}

export async function buildServer(config: AppConfig): Promise<BuiltServer> {
  const connection = createConnection({
    url: config.REDIS_URL,
    reconnectBaseMs: config.REDIS_RECONNECT_BASE_MS,
    reconnectMaxMs: config.REDIS_RECONNECT_MAX_MS,
  });

  const queue = createQueue<WebhookJobData, void, string>(config.QUEUE_NAME, {
    connection,
  });

  const receiverStore = new ReceiverStore();

  const fastify = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      // 응답 본문에 시크릿이 등장하지 않도록 자동 마스킹은 도입하지 않는다
      // (Q-SEC-6 (a) — 정책만, 자동화는 후속 PRD).
    },
    // payload 크기 상한.
    bodyLimit: config.WEBHOOK_MAX_PAYLOAD_BYTES,
  });

  // 라우트 등록
  await registerWebhooksRoute(fastify, {
    queue,
    bearerToken: config.API_BEARER_TOKEN,
  });
  await registerReceiverRoute(fastify, { store: receiverStore });
  await registerDashboardRoutes(fastify, { queue });
  await registerHealthzRoute(fastify, { connection });

  // 핸들러 + 워커
  const handler: CoreJobHandler<unknown> = createWebhookDeliveryHandler({
    deliveryTimeoutMs: config.WEBHOOK_DELIVERY_TIMEOUT_MS,
    allowPrivateTargets: config.ALLOW_PRIVATE_TARGETS,
    hmacSecret: config.WEBHOOK_HMAC_SECRET,
    hmacHeaderName: config.WEBHOOK_HMAC_HEADER,
    queueName: config.QUEUE_NAME,
    log: (level, msg, ctx) => {
      // fastify.log 는 pino. 컨텍스트는 첫 인자에 객체로.
      fastify.log[level](ctx, msg);
    },
  });

  // handler 의 generic 은 unknown — 큐 페이로드는 핸들러 내부에서 zod 로 재검증.
  const worker = createWorker<WebhookJobData>(config.QUEUE_NAME, handler, {
    connection,
    workerOptions: {
      concurrency: config.WORKER_CONCURRENCY,
    },
  });

  const facade: QueueFacade = {
    raw: queue,
    async getJobState(jobId: string): Promise<string | undefined> {
      const job = await queue.getJob(jobId);
      if (!job) return undefined;
      return job.getState();
    },
  };

  let closing = false;
  async function close(): Promise<void> {
    if (closing) return;
    closing = true;
    // 최소한의 셧다운(전체 시퀀스는 M7).
    try {
      await worker.close();
    } catch {
      // best-effort
    }
    try {
      await queue.close();
    } catch {
      // best-effort
    }
    try {
      await fastify.close();
    } catch {
      // best-effort
    }
    try {
      await connection.quit();
    } catch {
      // best-effort
    }
  }

  return {
    fastify,
    queue: facade,
    worker,
    receiverStore,
    connection,
    close,
  };
}

/**
 * 프로세스 진입점. process.env 를 파싱하고 서버를 띄운다.
 * SIGINT/SIGTERM 수신 시 최소 셧다운 호출(전체 시퀀스는 M7).
 */
export async function main(): Promise<void> {
  const config = loadConfigFromProcessEnv();
  const built = await buildServer(config);

  const address = await built.fastify.listen({
    port: config.PORT,
    host: "0.0.0.0",
  });
  built.fastify.log.info({ address }, "server listening");

  const shutdown = (signal: string): void => {
    built.fastify.log.info({ signal }, "shutdown requested");
    built
      .close()
      .then(() => {
        // 정상 종료. M7 에서 잔여 작업 여부에 따라 exit code 분기(Q-SEC-4 (b)).
        process.exit(0);
      })
      .catch((err: unknown) => {
        built.fastify.log.error({ err }, "shutdown error");
        process.exit(1);
      });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
