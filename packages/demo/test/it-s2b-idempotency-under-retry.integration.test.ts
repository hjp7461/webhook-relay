import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { startRedisContainer, type StartedRedis } from "./helpers/redis-container.js";
import { pollUntil, startApp, type AppFixture } from "./helpers/app-fixture.js";

// IT-S2b — 멱등성 × 재시도 상호작용 회귀
//
// M3 PLAN `04-m3-idempotency.md` §3.3 의 미이행 약속을 이행한다:
//   "재시도 가능 에러가 발생해도 동일 키는 한 번만 적재되어야 한다."
//
// IT-S2 (M3) 는 "동시 N회 등록 → 1회 실행" 만 검증했다. 본 테스트는 추가로
// "재시도가 진행되는 동안 동일 키로 추가 등록이 와도 새 작업이 생성되지 않는다"
// 를 검증한다. BullMQ jobId 시맨틱이 작업 상태(waiting/active/delayed/failed/
// completed) 와 무관하게 중복을 흡수해야 한다.
//
// 흐름:
//  1) Testcontainers Redis + 고유 큐(app-fixture).
//  2) Stub 수신자: 처음 K=2 회 503, K+1 번째 200 — IT-S3 패턴과 동일하나 K 가 작음.
//  3) WEBHOOK_MAX_ATTEMPTS=5, WEBHOOK_BACKOFF_BASE_MS=200.
//  4) 동일 idempotencyKey 로 3회 병렬 POST.
//  5) 폴링: completed 까지 대기.
//  6) 단언:
//     - 3개 응답 모두 202 + 동일 jobId(= idempotencyKey)
//     - 수신자 호출 횟수 == K + 1 == 3 (extra POST 가 새 호출을 만들지 않음)
//     - BullMQ attemptsMade == K + 1 == 3 (단일 작업의 재시도 시퀀스)
//
// 본 테스트가 회귀를 막는 시나리오: 누군가가 webhooks.ts 의 jobId 사용을
// 우회하고 randomUUID 를 다시 도입한다면, 3회 병렬 POST 가 3개 작업을 만들어
// 수신자 호출이 폭증한다. 본 단언이 즉시 실패.

const K = 2; // 503 후 200
const BASE_MS = 200;
const MAX_ATTEMPTS = 5;

interface StubReceiver {
  readonly server: Server;
  readonly url: string;
  readonly hits: ReadonlyArray<number>;
  stop(): Promise<void>;
}

async function startFlakyReceiver(failFirst: number): Promise<StubReceiver> {
  const hits: number[] = [];
  const server = createServer((req, res) => {
    hits.push(Date.now());
    req.on("data", () => {});
    req.on("end", () => {
      if (hits.length <= failFirst) {
        res.statusCode = 503;
        res.end("retry me");
      } else {
        res.statusCode = 200;
        res.end("ok");
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${addr.port}/`;
  return {
    server,
    url,
    get hits(): ReadonlyArray<number> {
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
    maxAttempts: MAX_ATTEMPTS,
    backoffBaseMs: BASE_MS,
  });
  receiver = await startFlakyReceiver(K);
}, 120_000);

afterAll(async () => {
  if (receiver) await receiver.stop();
  if (app) await app.stop();
  if (redis) await redis.stop();
}, 60_000);

describe("IT-S2b idempotency under retriable failure", () => {
  it("parallel duplicate POSTs do not multiply receiver calls or job attempts", async () => {
    const idempotencyKey = `it-s2b-${randomUUID()}`;
    const payload = { event: "retry-idempotency.test", id: 1 };
    const body = JSON.stringify({ url: receiver.url, payload, idempotencyKey });

    // 3회 병렬 POST — 같은 키. 첫 번째가 BullMQ 에 작업을 만들고, 나머지 둘은
    // 동일 jobId 가 이미 존재하므로 BullMQ 가 흡수해야 한다.
    const responses = await Promise.all(
      [1, 2, 3].map(() =>
        fetch(`${app.baseUrl}/webhooks`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${app.bearerToken}`,
          },
          body,
        }),
      ),
    );

    // 3개 응답 모두 202 + 동일 jobId.
    for (const res of responses) {
      expect(res.status).toBe(202);
    }
    const bodies = (await Promise.all(responses.map((r) => r.json()))) as Array<{ jobId: string }>;
    const jobIds = new Set(bodies.map((b) => b.jobId));
    expect(jobIds.size).toBe(1);
    expect([...jobIds][0]).toBe(idempotencyKey);

    // 재시도 시퀀스 끝까지 대기 — 최대 시도 4 회 사이 지연 합 ≤ 200+400+800
    // = 1400ms + 처리 시간. 안전 마진 10s.
    await pollUntil(
      async () => {
        const state = await app.server.queue.getJobState(idempotencyKey);
        return state === "completed" ? state : undefined;
      },
      { intervalMs: 50, timeoutMs: 10_000 },
    );

    // 단일 작업의 재시도 시퀀스만 발생했어야 함.
    const job = await app.server.queue.raw.getJob(idempotencyKey);
    expect(job).toBeDefined();
    expect(job?.attemptsMade).toBe(K + 1);

    // 수신자 호출 횟수: K + 1 = 3. 만약 BullMQ 가 중복을 흡수하지 않아 3개
    // 작업이 만들어졌다면 (K + 1) * 3 = 9 회가 됐을 것.
    expect(receiver.hits.length).toBe(K + 1);
  }, 30_000);
});
