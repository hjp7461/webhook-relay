import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { startRedisContainer, type StartedRedis } from "./helpers/redis-container.js";
import { pollUntil, startApp, type AppFixture } from "./helpers/app-fixture.js";

// IT-OBS-11 — 카디널리티 가드
//
// PLAN `docs/plan-phase3/07-m-obs-6-refinement.md` §3 IT-OBS-11.
// PRD `prd-phase3/01-metrics-and-labels.md` §4.1 / §4.4 / AC3.6.
//
// 목적:
//   - 라벨 enum 의 다양한 조합을 가능한 한 풍부하게 등장시킨 뒤 단일 `/metrics`
//     스크레이프를 떠 **메트릭별 시계열 수**가 PRD §4.4 표 상한 이하인지 단언.
//   - 전체 시계열 총합이 PRD §4.1 의 메트릭당 1000 예산 안에 있는지 단언.
//   - 라벨 enum 폐쇄성이 깨지면(자유 문자열 라벨 등장) 본 테스트가 자연스럽게
//     실패하도록 한다 — 새 라벨/메트릭 도입 시 회귀 가드.
//
// 본 테스트는 라벨 enum 의 모든 값이 100% 등장함을 보장하지 않는다 — 상한
// 위반의 회귀 보호가 목적(PRD AC3.6).

// PRD §4.4 표의 메트릭별 시계열 수 상한.
// - bucket 기반 Histogram 의 시계열 = (buckets + _sum + _count + +Inf bucket).
// - PRD 표의 산식: e.g. C4 = 2 × 3 × (10 buckets + _sum + _count) ≈ 72.
// - +Inf bucket 도 prom-client 가 자동 출력하므로 본 카운터에 포함된다.
//   PRD §4.4 는 +Inf 를 명시적으로 세지 않으나 본 테스트는 보수적으로
//   "PRD 표 + 라벨 조합당 +Inf 1건" 만큼 마진을 부여한다. 마진은 라벨 조합
//   수 = (label_axis_product) 와 같다.
//
// 라벨 조합 산식 메모(분모는 라벨 축의 cartesian product):
//   C1 queue_depth                  : 2 × 5      = 10
//   C2 jobs_processed_total         : 2 × 2      = 4
//   C3 job_attempts_total           : 2 × 3      = 6
//   C4 worker_processing_duration   : 2 × 3 × (10 + 2)            = 72 base + 2×3 +Inf = 78
//   C5 dlq_jobs_total               : 3
//   C6 worker_active_jobs           : 1
//   C7 redis_reconnects_total       : 1
//   C8 redis_up                     : 1
//   C9 shutdown_state               : 3
//   C10 shutdown_remaining_jobs     : 1
//   C11 build_info                  : 1
//   D1 api_requests_total           : 7 × 2 × 4  = 56
//   D2 api_request_duration_seconds : 7 × 2 × 4 × (10 + 2)        = 672 base + 7×2×4 +Inf = 728
//   D3 api_request_body_bytes       : 7 × (6 + 2) = 56 base + 7 +Inf = 63
//   W1 deliveries_total             : 5 × 5 × 3  = 75
//   W2 delivery_duration_seconds    : 5 × (10 + 2)                = 60 base + 5 +Inf = 65
//   W3 delivery_attempts_per_job    : 4 × (7 + 2) = 36 base + 4 +Inf = 40
//
// 본 단언은 PRD §4.4 의 상한 + Histogram 의 +Inf bucket 마진을 합한 값을
// 사용한다. PRD 표가 변경되면 본 상수도 동기 갱신해야 한다.

const SERIES_UPPER_BOUNDS: ReadonlyMap<string, number> = new Map<string, number>([
  // C-series (core). 단일 워커 fixture 에서 큐 라벨은 메인 + DLQ 2종까지 노출
  // 가능하나, 본 테스트의 워커는 메인 큐만 부착하므로 실측은 일부 차원이
  // 채워지지 않는다. 상한은 PRD §4.4 그대로 사용.
  ["webhook_relay_queue_depth", 10],
  ["webhook_relay_jobs_processed_total", 4],
  ["webhook_relay_job_attempts_total", 6],
  ["webhook_relay_worker_processing_duration_seconds", 78],
  ["webhook_relay_dlq_jobs_total", 3],
  ["webhook_relay_worker_active_jobs", 1],
  ["webhook_relay_redis_reconnects_total", 1],
  ["webhook_relay_redis_up", 1],
  ["webhook_relay_shutdown_state", 3],
  ["webhook_relay_shutdown_remaining_jobs", 1],
  ["webhook_relay_build_info", 1],
  // D-series (demo HTTP API).
  ["webhook_relay_api_requests_total", 56],
  ["webhook_relay_api_request_duration_seconds", 728],
  ["webhook_relay_api_request_body_bytes", 63],
  // W-series (demo webhook delivery domain).
  ["webhook_relay_deliveries_total", 75],
  ["webhook_relay_delivery_duration_seconds", 65],
  ["webhook_relay_delivery_attempts_per_job", 40],
  ["webhook_relay_receiver_received_total", 1],
]);

// 메트릭당 카디널리티 예산. PRD §4.1.
const PER_METRIC_BUDGET = 1000;

// Histogram 메트릭의 base 이름 → 파생 series 이름 매핑.
const HISTOGRAM_SUFFIXES = ["_bucket", "_sum", "_count"];

const HISTOGRAM_BASE_NAMES: ReadonlyArray<string> = [
  "webhook_relay_worker_processing_duration_seconds",
  "webhook_relay_api_request_duration_seconds",
  "webhook_relay_api_request_body_bytes",
  "webhook_relay_delivery_duration_seconds",
  "webhook_relay_delivery_attempts_per_job",
];

// `/metrics` 응답 텍스트를 줄 단위 파싱해서 (메트릭 base 이름) → (서로 다른
// label 조합 집합) 으로 카운트한다. Histogram 파생(_bucket / _sum / _count) 은
// base 이름으로 합산한다(예: `..._duration_seconds_bucket{le="0.5"}` 의 라벨
// 조합은 `le="0.5"` + 외부 라벨 모두 포함).
function buildSeriesByMetric(body: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const raw of body.split("\n")) {
    if (raw.length === 0) continue;
    if (raw.startsWith("#")) continue;
    const match = raw.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*\})?\s+/);
    if (match === null) continue;
    const fullName = match[1] ?? "";
    const labelBlock = match[2] ?? "";

    // Histogram 파생 시리즈는 base 이름으로 합산.
    let base = fullName;
    for (const baseName of HISTOGRAM_BASE_NAMES) {
      for (const suffix of HISTOGRAM_SUFFIXES) {
        if (fullName === `${baseName}${suffix}`) {
          base = baseName;
          break;
        }
      }
    }
    // prom-client 기본 메트릭(`process_*`, `nodejs_*`) 은 카운트 대상이 아니다.
    // 본 PRD 의 카탈로그(C/D/W) 만 단언.
    if (!base.startsWith("webhook_relay_")) continue;

    // 시계열 식별자 = (base name 의 파생 suffix + label block) 으로 동일 series
    // 를 한 항목으로 카운트한다(_bucket 의 le="..." 도 차원으로 포함).
    const suffix = fullName.length > base.length ? fullName.slice(base.length) : "";
    const seriesKey = `${suffix}${labelBlock}`;

    const set = out.get(base);
    if (set === undefined) {
      out.set(base, new Set<string>([seriesKey]));
    } else {
      set.add(seriesKey);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 라벨 enum 풍부화 — 다양한 시나리오로 라벨 조합을 등장시킨다.
// ---------------------------------------------------------------------------

interface FlakyReceiver {
  readonly server: Server;
  readonly url: string;
  stop(): Promise<void>;
}

async function startFlakyReceiver(
  failFirst: number,
  failStatus: number,
): Promise<FlakyReceiver> {
  let hits = 0;
  const server = createServer((req, res) => {
    req.on("data", () => {});
    req.on("end", () => {
      hits += 1;
      if (hits <= failFirst) {
        res.statusCode = failStatus;
        res.end("retry");
      } else {
        res.statusCode = 200;
        res.end("ok");
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as AddressInfo;
  return {
    server,
    url: `http://127.0.0.1:${addr.port}/`,
    async stop(): Promise<void> {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

async function startAlwaysStatusReceiver(status: number): Promise<FlakyReceiver> {
  const server = createServer((req, res) => {
    req.on("data", () => {});
    req.on("end", () => {
      res.statusCode = status;
      res.end("static");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as AddressInfo;
  return {
    server,
    url: `http://127.0.0.1:${addr.port}/`,
    async stop(): Promise<void> {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

async function postWebhook(
  app: AppFixture,
  targetUrl: string,
  payload: unknown,
  idempotencyKey: string,
): Promise<Response> {
  return fetch(`${app.baseUrl}/webhooks`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${app.bearerToken}`,
    },
    body: JSON.stringify({ url: targetUrl, payload, idempotencyKey }),
  });
}

let redis: StartedRedis;

beforeAll(async () => {
  redis = await startRedisContainer();
}, 120_000);

afterAll(async () => {
  if (redis) await redis.stop();
}, 60_000);

describe("IT-OBS-11 cardinality guard (PRD §4.1 / §4.4 / AC3.6)", () => {
  it("does not exceed PRD §4.4 series upper bounds nor §4.1 per-metric 1000 budget", async () => {
    // 본 fixture 안에서 모든 시나리오를 연쇄 실행한다. 단일 큐 prefix 로 격리.
    // 라벨 enum 의 모든 값을 100% 채우는 것이 목적이 아니라 PRD 상한 위반의
    // 회귀 가드(AC3.6).
    const app = await startApp({
      redisUrl: redis.url,
      maxAttempts: 2,
      backoffBaseMs: 50,
      // SSRF 시나리오를 위해 사설 대상 거부 활성화 — 다른 시나리오는 127.0.0.1
      // 수신자에 대해 차단되지만, 본 fixture 는 SSRF 단언 1건만 거부 케이스를
      // 사용하고 나머지는 별도 fixture(allowPrivateTargets=true)로 격리한다.
      allowPrivateTargets: true,
    });

    const flaky5xx = await startFlakyReceiver(1, 503);
    const always400 = await startAlwaysStatusReceiver(400);
    const always503 = await startAlwaysStatusReceiver(503);

    try {
      // (1) success / 2xx / completed.
      {
        const idempotencyKey = `it-obs-11-success-${randomUUID()}`;
        const res = await postWebhook(
          app,
          `${app.baseUrl}/_demo/receiver`,
          { event: "ok" },
          idempotencyKey,
        );
        expect(res.status).toBe(202);
        const body = (await res.json()) as { jobId: string };
        await pollUntil(
          async () => {
            const s = await app.server.queue.getJobState(body.jobId);
            return s === "completed" ? s : undefined;
          },
          { intervalMs: 50, timeoutMs: 5_000 },
        );
      }

      // (2) 5xx 재시도 → 성공 (http_error / 5xx / RetriableError + success).
      {
        const idempotencyKey = `it-obs-11-retry-${randomUUID()}`;
        const res = await postWebhook(
          app,
          flaky5xx.url,
          { event: "retry" },
          idempotencyKey,
        );
        expect(res.status).toBe(202);
        const body = (await res.json()) as { jobId: string };
        await pollUntil(
          async () => {
            const s = await app.server.queue.getJobState(body.jobId);
            return s === "completed" ? s : undefined;
          },
          { intervalMs: 50, timeoutMs: 10_000 },
        );
      }

      // (3) 4xx 즉시 DLQ (non_retriable / 4xx / NonRetriableError).
      {
        const idempotencyKey = `it-obs-11-4xx-${randomUUID()}`;
        const res = await postWebhook(
          app,
          always400.url,
          { event: "bad" },
          idempotencyKey,
        );
        expect(res.status).toBe(202);
        await pollUntil(
          async () => {
            const dlqCount = await app.dlqQueue.countJobs();
            return dlqCount >= 1 ? true : undefined;
          },
          { intervalMs: 50, timeoutMs: 5_000 },
        );
      }

      // (4) 5xx 항상 → max attempts 초과 → DLQ (max_attempts_exceeded).
      {
        const before = await app.dlqQueue.countJobs();
        const idempotencyKey = `it-obs-11-max-${randomUUID()}`;
        const res = await postWebhook(
          app,
          always503.url,
          { event: "max" },
          idempotencyKey,
        );
        expect(res.status).toBe(202);
        await pollUntil(
          async () => {
            const dlqCount = await app.dlqQueue.countJobs();
            return dlqCount > before ? true : undefined;
          },
          { intervalMs: 50, timeoutMs: 10_000 },
        );
      }

      // (5) 다양한 route 라벨 호출.
      //
      // 본 IT-OBS-11 의 핵심 단언은 "실측 시계열 수 ≤ PRD §4.4 표 상한" 의
      // 단방향 가드다. 따라서 라벨 enum 의 모든 값을 실측으로 채울 필요가 없고,
      // `result=timeout` / `result=ssrf_blocked` 같은 케이스가 등장하지 않아도
      // 본 단언은 정합한다 — 라벨 axis 의 enum 폐쇄성은 PRD §4.2 표가 잠그며
      // 코드 측 enum 은 `demo/constants.ts` 가 잠근다.
      {
        // /_demo/receiver 는 (1) 에서 워커가 한 번 호출. 외부에서 직접 GET 은
        // 없으므로 별도 호출은 생략(POST 만 D1 카운트 — 이미 시나리오 (1) 에서
        // 1건 등장).
        const healthzRes = await fetch(`${app.baseUrl}/healthz`);
        expect(healthzRes.status).toBe(200);

        const dashboardRes = await fetch(`${app.baseUrl}/dashboard`);
        expect(dashboardRes.status).toBe(200);

        const statsRes = await fetch(`${app.baseUrl}/api/queue/stats`);
        expect(statsRes.status).toBe(200);

        // /metrics 자체 호출도 D1 의 route 라벨로 등록된다.
        const metricsProbeRes = await fetch(`${app.baseUrl}/metrics`);
        expect(metricsProbeRes.status).toBe(200);
      }

      // 모든 시나리오 종료 후 단일 스크레이프.
      const metricsRes = await fetch(`${app.baseUrl}/metrics`);
      expect(metricsRes.status).toBe(200);
      const body = await metricsRes.text();

      const seriesByMetric = buildSeriesByMetric(body);

      // 단언 1 — 메트릭별 시계열 수가 PRD §4.4 표 상한 이하.
      for (const [name, upper] of SERIES_UPPER_BOUNDS) {
        const actual = seriesByMetric.get(name)?.size ?? 0;
        expect(
          actual,
          `metric ${name} series count ${actual} exceeds PRD §4.4 upper bound ${upper}`,
        ).toBeLessThanOrEqual(upper);
      }

      // 단언 2 — PRD §4.1: 메트릭당 라벨 조합 ≤ 1000 예산.
      for (const [name, set] of seriesByMetric) {
        expect(
          set.size,
          `metric ${name} cardinality ${set.size} exceeds per-metric budget ${PER_METRIC_BUDGET}`,
        ).toBeLessThanOrEqual(PER_METRIC_BUDGET);
      }

      // 단언 3 — 카탈로그 폐쇄: 본 PRD 가 정의한 메트릭(C/D/W) 외에
      // `webhook_relay_` 접두를 가진 새 메트릭이 등장하지 않는다.
      // 새 메트릭이 PRD §3 카탈로그 갱신 없이 도입되면 본 단언이 실패해 회귀
      // 가드 역할을 한다.
      const knownNames = new Set<string>(SERIES_UPPER_BOUNDS.keys());
      for (const name of seriesByMetric.keys()) {
        expect(
          knownNames.has(name),
          `unknown webhook_relay_* metric "${name}" — PRD §3 카탈로그를 먼저 갱신하라`,
        ).toBe(true);
      }

    } finally {
      await flaky5xx.stop();
      await always400.stop();
      await always503.stop();
      await app.stop();
    }
  }, 60_000);
});
