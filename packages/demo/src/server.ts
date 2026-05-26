import Fastify, { type FastifyInstance } from "fastify";
import {
  buildWorkerRetryOptions,
  createConnection,
  createDlqQueue,
  createQueue,
  createWorker,
  gracefulShutdown,
  type CoreJobHandler,
  type DlqJobData,
} from "@webhook-relay/core";
import type { Queue, Worker } from "bullmq";
import type { Redis } from "ioredis";
import { pathToFileURL } from "node:url";
import process from "node:process";

import type { AppConfig } from "./config.js";
import { loadConfigFromProcessEnv } from "./config.js";
import { ReceiverStore } from "./receiver/store.js";
import { registerWebhooksRoute } from "./api/webhooks.js";
import { registerReceiverRoute } from "./api/receiver.js";
import { registerDashboardRoutes } from "./api/dashboard.js";
import { registerHealthzRoute } from "./api/healthz.js";
import { createWebhookDeliveryHandler } from "./handlers/webhook-delivery.js";
import type { WebhookJobData } from "./domain/schemas.js";
import { DLQ_NAME as CONSTANT_DLQ_NAME, QUEUE_NAME as CONSTANT_QUEUE_NAME } from "./constants.js";

// demo/server.ts
//
// 부트스트랩: 환경변수 파싱 → 연결 → 큐/워커 → Fastify 라우트 등록.
// API 와 워커가 같은 프로세스에서 동작(PRD `01` MVP 범위).
// SIGINT/SIGTERM 수신 시 close 호출은 최소한만 — 전체 시퀀스는 M7 의 책임.
//
// M5: 별도 DLQ Queue 를 함께 생성하고 워커에 주입. 원 큐의 작업은
// removeOnFail: { count: 0 } 으로 즉시 제거 — DLQ 단방향(I2.4) 보강.

export interface BuiltServer {
  readonly fastify: FastifyInstance;
  readonly queue: QueueFacade;
  readonly dlqQueue: Queue<DlqJobData<WebhookJobData>, void, string>;
  readonly worker: Worker<WebhookJobData, void, string>;
  readonly receiverStore: ReceiverStore;
  readonly connection: Redis;
  /**
   * 셧다운 진행 중 토글. M7 의 그레이스풀 셧다운 시퀀스가 setDraining(true) 를
   * 호출하면 /webhooks 와 /healthz 가 503 으로 응답한다(PRD `06` §6.2.3).
   * /_demo/receiver 와 /dashboard 는 영향을 받지 않는다(PLAN `08` §4-3 권장).
   */
  setDraining(value: boolean): void;
  isDraining(): boolean;
  close(): Promise<void>;
}

// 통합 테스트가 사용할 작은 facade — getJobState 등 자주 쓰는 메서드를 노출.
export interface QueueFacade {
  readonly raw: Queue<WebhookJobData, void, string>;
  getJobState(jobId: string): Promise<string | undefined>;
}

/**
 * AC5.5 보강: 큐/DLQ 이름이 `constants.ts` 와 환경변수 사이에 어긋나지
 * 않는지 검증한다. 운영 기본(둘 다 constants 와 동일)이거나, 커스터마이즈
 * 시에도 `DLQ_NAME == `${QUEUE_NAME}-dlq`` 컨벤션을 따라야 한다(통합
 * 테스트의 격리 큐도 본 컨벤션으로 작성). 어느 쪽도 아니면 fail-fast.
 */
function assertQueueNameConsistency(config: AppConfig): void {
  const defaultPair =
    config.QUEUE_NAME === CONSTANT_QUEUE_NAME && config.DLQ_NAME === CONSTANT_DLQ_NAME;
  const conventionPair = config.DLQ_NAME === `${config.QUEUE_NAME}-dlq`;
  if (!defaultPair && !conventionPair) {
    throw new Error(
      `[config] DLQ_NAME (${JSON.stringify(config.DLQ_NAME)}) must match either ` +
        `constants.DLQ_NAME (${JSON.stringify(CONSTANT_DLQ_NAME)}) or the ` +
        `\`${config.QUEUE_NAME}-dlq\` convention`,
    );
  }
  if (config.DLQ_NAME === config.QUEUE_NAME) {
    throw new Error(
      `[config] DLQ_NAME must not equal QUEUE_NAME (${JSON.stringify(config.QUEUE_NAME)})`,
    );
  }
}

export async function buildServer(config: AppConfig): Promise<BuiltServer> {
  assertQueueNameConsistency(config);

  const connection = createConnection({
    url: config.REDIS_URL,
    reconnectBaseMs: config.REDIS_RECONNECT_BASE_MS,
    reconnectMaxMs: config.REDIS_RECONNECT_MAX_MS,
  });

  // M4: 모든 add 작업에 동일 재시도 정책을 자동 적용한다.
  // BullMQ 표준 옵션(attempts + backoff: exponential)을 사용(F2.3).
  // 자체 백오프 구현 금지(AC-M4).
  // M5: removeOnFail: { count: 0 } 로 종단 실패 시 원 큐에서 즉시 제거.
  //     DLQ 단방향(I2.4) 보강 — "원 큐에 없음" 단언 안정화.
  const retryDefaults = buildWorkerRetryOptions({
    maxAttempts: config.WEBHOOK_MAX_ATTEMPTS,
    backoffBaseMs: config.WEBHOOK_BACKOFF_BASE_MS,
  });
  const queue = createQueue<WebhookJobData, void, string>(config.QUEUE_NAME, {
    connection,
    queueOptions: {
      defaultJobOptions: {
        attempts: retryDefaults.attempts,
        backoff: { ...retryDefaults.backoff },
        removeOnFail: { count: 0 },
      },
    },
  });

  // M5: 별도의 DLQ 큐. 워커가 종단 실패 시 새 항목을 적재한다.
  const dlqQueue = createDlqQueue<WebhookJobData>(config.DLQ_NAME, {
    connection,
  });

  const receiverStore = new ReceiverStore();

  // draining 플래그(M7). 시그널 핸들러가 토글하면 /webhooks /healthz 가
  // 503 응답. 본 모듈 내 closure 로 둔다(외부 의존성 없음).
  let draining = false;
  const setDraining = (value: boolean): void => {
    draining = value;
  };
  const isDraining = (): boolean => draining;

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
    isDraining,
  });
  await registerReceiverRoute(fastify, { store: receiverStore });
  await registerDashboardRoutes(fastify, { queue, dlqQueue });
  await registerHealthzRoute(fastify, { connection, isDraining });

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
  // M5: dlqQueue 주입 — core 가 종단 실패 시 새 항목을 적재.
  // M6: STALLED_INTERVAL_MS / MAX_STALLED_COUNT 를 BullMQ Worker 옵션으로 위임
  //     (PRD `02` §F2.5, Q-STALL-1 (a) — env 단일 채널).
  const worker = createWorker<WebhookJobData>(config.QUEUE_NAME, handler, {
    connection,
    workerOptions: {
      concurrency: config.WORKER_CONCURRENCY,
    },
    stalledInterval: config.STALLED_INTERVAL_MS,
    maxStalledCount: config.MAX_STALLED_COUNT,
    dlqQueue,
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
      await dlqQueue.close();
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
    dlqQueue,
    worker,
    receiverStore,
    connection,
    setDraining,
    isDraining,
    close,
  };
}

/**
 * 프로세스 진입점. process.env 를 파싱하고 서버를 띄운다.
 *
 * 시그널 처리(M7, Q-SEC-4 (b), Q-OPS-2 (b)):
 *  - SIGTERM/SIGINT 수신 시 core.gracefulShutdown(...) 을 호출한다.
 *  - boolean guard 로 중복 수신 방지(두 번째 이후 시그널은 무시).
 *  - 결과의 timedOut 에 따라 process.exit(0|1).
 *  - 타임아웃 시 잔여 작업 ID 를 구조화 JSON 한 줄로 출력(remainingJobIds 키).
 */
export async function main(): Promise<void> {
  const config = loadConfigFromProcessEnv();
  const built = await buildServer(config);

  const address = await built.fastify.listen({
    port: config.PORT,
    host: "0.0.0.0",
  });
  built.fastify.log.info({ address }, "server listening");

  let shuttingDown = false;
  const handleSignal = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      // 중복 시그널은 무시(두 번째 이후 SIGTERM/SIGINT).
      return;
    }
    shuttingDown = true;
    built.fastify.log.info({ signal }, "shutdown requested");

    // gracefulShutdown 은 본 모듈의 setDraining/close 추상을 받아
    // 시퀀스(setDraining → worker.close(false) race timeout → http close →
    // queue/dlq close → redis.quit)를 수행한다. 도메인 식별자/Fastify 노출 없음.
    void gracefulShutdown({
      worker: built.worker,
      queue: built.queue.raw,
      dlqQueue: built.dlqQueue,
      redis: built.connection,
      httpServer: {
        setDraining: (v: boolean): void => built.setDraining(v),
        close: async (): Promise<void> => {
          await built.fastify.close();
        },
      },
      timeoutMs: config.SHUTDOWN_TIMEOUT_MS,
      onTimeout: (remainingJobIds: string[]): void => {
        // PRD `06` §6.2.5: 강제 종료 직전에 잔여 작업 ID 를 로그로 기록.
        // 테스트(IT-S7 케이스 B) 는 본 라인을 grep 하여 단언한다.
        built.fastify.log.warn(
          { remainingJobIds, signal },
          "shutdown timeout reached; remaining active jobs",
        );
      },
    })
      .then((result) => {
        // Q-SEC-4 (b): 정상 완료 → 0. 타임아웃 강제 종료 → 1.
        process.exit(result.timedOut ? 1 : 0);
      })
      .catch((err: unknown) => {
        // gracefulShutdown 내부는 best-effort 라 거의 reject 하지 않지만,
        // 안전망으로 1 로 종료.
        const msg = err instanceof Error ? err.message : String(err);
        built.fastify.log.error({ err: msg }, "shutdown error");
        process.exit(1);
      });
  };

  process.on("SIGTERM", () => handleSignal("SIGTERM"));
  process.on("SIGINT", () => handleSignal("SIGINT"));
}

// 자식 프로세스(IT-S7) 또는 `tsx packages/demo/src/server.ts` 로 본 파일이
// 직접 실행되면 main() 을 호출한다. main.ts 로부터 import 될 때는 본 분기가
// false 가 되어 중복 실행을 피한다.
const isDirectEntry =
  typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectEntry) {
  main().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[bootstrap] ${msg}\n`);
    process.exit(1);
  });
}
