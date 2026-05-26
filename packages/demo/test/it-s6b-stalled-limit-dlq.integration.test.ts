import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { startRedisContainer, type StartedRedis } from "./helpers/redis-container.js";
import { pollUntil, startApp, type AppFixture } from "./helpers/app-fixture.js";

// IT-S6b — stalled-loss recovery (BullMQ 가 'failed(undefined)' 로 발화하는 케이스)
//
// 배경:
//   `packages/core/src/worker.ts` 의 'failed' 핸들러는 `job === undefined` 케이스에서
//   기존엔 silent early-return 하여 페이로드를 잃을 수 있었다. M-followup 에서
//   in-memory `activeJobs` 추적 + 보수적 DLQ 적재(`stalled-loss-recovered`) 경로를
//   도입했다.
//
// 본 테스트의 검증 대상:
//   1) 핸들러 진입 시 activeJobs 에 등록된다.
//   2) 'failed(undefined, err)' 이벤트가 발화되면, 등록된 후보(들)이 DLQ 에
//      `stalled-loss-recovered` 메시지로 적재된다.
//   3) 분류는 보수적으로 'Retriable'.
//   4) 페이로드(url/payload/idempotencyKey)는 그대로 보존된다.
//
// 트리거 전략:
//   BullMQ 5.77.3 의 stalled-limit 초과 경로는 보통 `defa`(deferredFailure)를 통해
//   `failed(jobDefined, UnrecoverableError)` 로 떨어진다(다음 워커 픽업 시점). 즉
//   "BullMQ 가 실제로 `failed(undefined)` 를 발화" 시키는 결정론적 경로는 버전
//   의존적이라 통합 테스트의 안정성을 해친다. 본 테스트는 worker.emit('failed',
//   undefined, err) 를 직접 호출해 unit-of-recovery 시맨틱을 검증한다.
//
//   대상 코드 경로 — `worker.on('failed', (job, err) => job === undefined ? recover : normal)`
//   는 이벤트 페이로드 형태에만 의존하므로, 본 테스트가 검증하는 것은 실제 버그
//   회귀(silent early-return) 와 그 픽스(`stalled-loss-recovered` DLQ 적재)다.

const HANG_MS = 5_000;

interface StubReceiver {
  readonly server: Server;
  readonly url: string;
  readonly hits: ReadonlyArray<{ at: number; body: unknown }>;
  stop(): Promise<void>;
}

/**
 * 모든 요청을 의도적으로 HANG_MS 만큼 지연한 뒤 200 으로 응답. 핸들러가 송신
 * 단계에서 매달리는 동안 'failed(undefined, err)' 를 직접 발화시켜 stalled-loss
 * recovery 경로를 검증한다. 실제 응답이 도착하면 핸들러 finally 가 activeJobs
 * 에서 엔트리를 제거하지만, 이미 recovery 가 처리된 후이므로 중복 적재는 없다.
 */
async function startHangingReceiver(): Promise<StubReceiver> {
  const hits: { at: number; body: unknown }[] = [];
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
      setTimeout(() => {
        if (!res.writableEnded) {
          res.statusCode = 200;
          res.end("ok-after-hang");
        }
      }, HANG_MS);
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
    async stop(): Promise<void> {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

let redis: StartedRedis;
let app: AppFixture;
let receiver: StubReceiver;

beforeAll(async () => {
  redis = await startRedisContainer();
  app = await startApp({
    redisUrl: redis.url,
    // 재시도 정책은 본 테스트의 단언과 무관(우리는 'failed(undefined)' 를 직접 발화).
    maxAttempts: 3,
    backoffBaseMs: 100,
  });
  receiver = await startHangingReceiver();
}, 120_000);

afterAll(async () => {
  if (receiver) await receiver.stop();
  if (app) await app.stop();
  if (redis) await redis.stop();
}, 60_000);

describe("IT-S6b stalled-loss recovery", () => {
  it(
    "failed(undefined) → in-memory active job adopted to DLQ with stalled-loss-recovered tag",
    async () => {
      const idempotencyKey = `it-s6b-${randomUUID()}`;
      const payload = { event: "stalled.loss.recovery", id: 42 };

      // 작업 등록 → 워커 픽업 → 핸들러가 stub 수신자에게 송신을 시작하면 stub 이
      // HANG_MS 동안 응답을 보류한다. 이 시점에 activeJobs 에 jobId 가 등록된 상태.
      const initialHits = receiver.hits.length;
      const res = await fetch(`${app.baseUrl}/webhooks`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${app.bearerToken}`,
        },
        body: JSON.stringify({
          url: receiver.url,
          payload,
          idempotencyKey,
        }),
      });
      expect(res.status).toBe(202);

      // 핸들러가 외부 송신을 시작했음을 stub 의 첫 hit 로 감지.
      await pollUntil(
        async () => (receiver.hits.length > initialHits ? true : undefined),
        { intervalMs: 25, timeoutMs: 5_000 },
      );

      // 'failed' 이벤트를 job=undefined 로 직접 발화 — BullMQ 가 메타데이터 복구를
      // 못 한 케이스(stalled-limit 초과 후 lock 손실 등)를 시뮬레이션.
      const syntheticErr = new Error("simulated: job stalled more than allowable limit");
      // BullMQ EventEmitter 타입은 (job, err, prev) 시그니처. job=undefined 는 TS 상
      // 허용되지 않으므로 unknown 캐스트로 우회(런타임에 BullMQ 가 발화하는 형태와
      // 동일).
      const emitter = app.server.worker as unknown as {
        emit(name: string, ...args: unknown[]): boolean;
      };
      emitter.emit("failed", undefined, syntheticErr);

      // DLQ 에 'stalled-loss-recovered' 메시지로 1건 적재될 때까지 폴링(최대 15초).
      // 주의: 핸들러는 deliver timeout(기본 5s) 후 RetriableError 로 떨어지고, 그 후
      // 재시도가 소진되면 또 다른 DLQ 엔트리(메시지: 'Delivery aborted (timeout)')가
      // 생성될 수 있다. 본 테스트의 검증 대상은 stalled-loss 경로이므로 message 에
      // 'stalled' 키워드가 포함된 엔트리만 매칭.
      const dlqEntry = await pollUntil(
        async () => {
          const items = await app.dlqQueue.listJobs();
          if (items.length === 0) return undefined;
          for (const item of items) {
            const data = item.data as
              | {
                  data?: { idempotencyKey?: unknown };
                  lastError?: { class?: unknown; message?: unknown };
                }
              | undefined;
            if (data === undefined) continue;
            const idem = data.data?.idempotencyKey;
            if (idem !== idempotencyKey) continue;
            const msg = typeof data.lastError?.message === "string" ? data.lastError.message : "";
            if (!msg.toLowerCase().includes("stalled")) continue;
            return data;
          }
          return undefined;
        },
        { intervalMs: 50, timeoutMs: 15_000 },
      );

      // 단언:
      // 1) 페이로드 보존(원본 url/payload/idempotencyKey).
      expect(dlqEntry).toBeDefined();
      const inner = (dlqEntry as { data: { url: string; payload: unknown; idempotencyKey: string } })
        .data;
      expect(inner.url).toBe(receiver.url);
      expect(inner.idempotencyKey).toBe(idempotencyKey);
      expect(inner.payload).toEqual(payload);

      // 2) lastError.class === 'Retriable' (보수적).
      const lastError = (dlqEntry as { lastError: { class: string; message: string; attemptsMade: number } })
        .lastError;
      expect(lastError.class).toBe("Retriable");

      // 3) message 에 'stalled' 또는 'lost' 키워드 포함.
      const lowered = lastError.message.toLowerCase();
      expect(lowered.includes("stalled") || lowered.includes("lost")).toBe(true);

      // 4) attemptsMade 는 핸들러 진입 시점의 시도 횟수(보통 0).
      expect(lastError.attemptsMade).toBeGreaterThanOrEqual(0);
    },
    30_000,
  );
});
