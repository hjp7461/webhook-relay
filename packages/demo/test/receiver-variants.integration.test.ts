import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startRedisContainer, type StartedRedis } from "./helpers/redis-container.js";
import { startApp, type AppFixture } from "./helpers/app-fixture.js";

// receiver-variants — POST /_demo/receiver 의 stub 응답 변형 모드 단위 검증
//
// PLAN docs/plan-phase4/04-m-load-3-lp2-nominal.md §4 단계 7.
//
// 본 테스트는 단계 2 (commit df2ae52) 의 variant-aware stub 응답 모드의
// 정확성을 검증한다. Q-LOAD-13 (a) 정합 — 본 테스트는 stub 자체의 단위
// 검증이며 부하 측정의 회귀 가드가 아니다.
//
// 단언:
//   1) variant 미지정 → 200 + { ok: true }            (1~2단계 IT-S1 회귀 가드)
//   2) variant=normal → 200 + { ok: true }            (명시 normal)
//   3) variant=s4    → 항상 503                       (IT-S4 부하 변형)
//   4) variant=s5    → 항상 400                       (IT-S5 부하 변형)
//   5) variant=s3    → HMAC fallback 으로 K=2 회 503 후 200 (IT-S3 부하 변형)
//   6) variant=s3 + 다른 HMAC → 새 카운터 슬롯, 1차 503  (HMAC fallback 격리)
//   7) variant=s3 + 식별자 부재 → 503 reason='no_idempotency_key' (방어적 가드)
//   8) variant=s3 + body.idempotencyKey 우선 사용      (k6 시나리오 정합)
//   9) variant=s3 + 같은 HMAC + 다른 body.idempotencyKey → 격리
//      (2026-05-27 LP-2 측정 결정성 패딩 충돌 회귀 가드)

let redis: StartedRedis;
let app: AppFixture;

beforeAll(async () => {
  redis = await startRedisContainer();
  app = await startApp({ redisUrl: redis.url });
}, 120_000);

afterAll(async () => {
  if (app) await app.stop();
  if (redis) await redis.stop();
}, 60_000);

describe("/_demo/receiver variant-aware stub responses", () => {
  it("variant 미지정 → 200 + { ok: true } (1~2단계 IT-S1 회귀 가드)", async () => {
    const res = await fetch(`${app.baseUrl}/_demo/receiver`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hello: "world" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ ok: true });
  });

  it("variant=normal → 200 + { ok: true }", async () => {
    const res = await fetch(`${app.baseUrl}/_demo/receiver?variant=normal`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hello: "world" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ ok: true });
  });

  it("variant=s4 → 항상 503 (3 회 연속)", async () => {
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`${app.baseUrl}/_demo/receiver?variant=s4`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ attempt: i }),
      });
      expect(res.status).toBe(503);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toMatchObject({ ok: false, variant: "s4" });
    }
  });

  it("variant=s5 → 항상 400 (3 회 연속)", async () => {
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`${app.baseUrl}/_demo/receiver?variant=s5`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ attempt: i }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toMatchObject({ ok: false, variant: "s5" });
    }
  });

  it("variant=s3 → HMAC 헤더 값별 K=2 회 503 후 200", async () => {
    // 같은 HMAC 헤더로 3회 POST → 1차 503, 2차 503, 3차 200.
    const hmacHeader = "sha256=s3-counter-key-1";

    const r1 = await postWithHmac("variant=s3", hmacHeader);
    expect(r1.status).toBe(503);
    expect(r1.body).toMatchObject({ ok: false, variant: "s3", attempt: 1 });

    const r2 = await postWithHmac("variant=s3", hmacHeader);
    expect(r2.status).toBe(503);
    expect(r2.body).toMatchObject({ ok: false, variant: "s3", attempt: 2 });

    const r3 = await postWithHmac("variant=s3", hmacHeader);
    expect(r3.status).toBe(200);
    expect(r3.body).toMatchObject({ ok: true, variant: "s3", attempt: 3 });
  });

  it("variant=s3 + 다른 HMAC → 새 카운터 슬롯, 1차 503", async () => {
    // 직전 테스트에서 사용한 HMAC 와 다른 값 → 카운터가 독립.
    const otherHmac = "sha256=s3-counter-key-2";

    const r = await postWithHmac("variant=s3", otherHmac);
    expect(r.status).toBe(503);
    expect(r.body).toMatchObject({ ok: false, variant: "s3", attempt: 1 });
  });

  it("variant=s3 + 식별자 부재 → 503 + reason='no_idempotency_key'", async () => {
    // body 에 idempotencyKey 없고 HMAC 헤더도 없음 → 카운터 키 없음.
    const res = await fetch(`${app.baseUrl}/_demo/receiver?variant=s3`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ no: "identifier" }),
    });
    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      ok: false,
      variant: "s3",
      reason: "no_idempotency_key",
    });
  });

  it("variant=s3 + body.idempotencyKey 우선 → K=2 회 503 후 200 (HMAC 무관)", async () => {
    const idem = "body-idem-prio-test";
    const r1 = await postJson("variant=s3", { idempotencyKey: idem });
    expect(r1.status).toBe(503);
    expect(r1.body).toMatchObject({ ok: false, variant: "s3", attempt: 1 });

    const r2 = await postJson("variant=s3", { idempotencyKey: idem });
    expect(r2.status).toBe(503);
    expect(r2.body).toMatchObject({ ok: false, variant: "s3", attempt: 2 });

    const r3 = await postJson("variant=s3", { idempotencyKey: idem });
    expect(r3.status).toBe(200);
    expect(r3.body).toMatchObject({ ok: true, variant: "s3", attempt: 3 });
  });

  it("variant=s3 + 같은 HMAC + 다른 body.idempotencyKey → 격리 (결정성 패딩 충돌 회귀 가드)", async () => {
    // 2026-05-27 LP-2 측정 root cause — 결정성 패딩 + idempotencyKey 가 외부
    // 본문에 없는 조합으로 multiple unique 작업이 동일 HMAC 를 만드는 충돌.
    // body.idempotencyKey 우선 사용으로 격리 보장 회귀 가드.
    const sameHmac = "sha256=padding-collision-test";
    const idemA = "job-padding-A";
    const idemB = "job-padding-B";

    // job-A 의 첫 시도 → 1차 503 (attempt=1).
    const rA = await postWithHmacAndBody("variant=s3", sameHmac, {
      idempotencyKey: idemA,
    });
    expect(rA.status).toBe(503);
    expect(rA.body).toMatchObject({ variant: "s3", attempt: 1 });

    // job-B 가 같은 HMAC 로 도착 → 다른 idempotencyKey 라 별도 슬롯.
    // 만약 HMAC 단일 키 (이전 버그) 면 attempt=2 를 반환했을 것.
    const rB = await postWithHmacAndBody("variant=s3", sameHmac, {
      idempotencyKey: idemB,
    });
    expect(rB.status).toBe(503);
    expect(rB.body).toMatchObject({ variant: "s3", attempt: 1 });
  });
});

interface PostResult {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

async function postWithHmac(
  query: string,
  hmacHeader: string,
): Promise<PostResult> {
  const res = await fetch(`${app.baseUrl}/_demo/receiver?${query}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-webhook-signature": hmacHeader,
    },
    body: JSON.stringify({ payload: "test" }),
  });
  const body = (await res.json()) as Record<string, unknown>;
  return { status: res.status, body };
}

async function postJson(
  query: string,
  bodyObj: Record<string, unknown>,
): Promise<PostResult> {
  const res = await fetch(`${app.baseUrl}/_demo/receiver?${query}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(bodyObj),
  });
  const body = (await res.json()) as Record<string, unknown>;
  return { status: res.status, body };
}

async function postWithHmacAndBody(
  query: string,
  hmacHeader: string,
  bodyObj: Record<string, unknown>,
): Promise<PostResult> {
  const res = await fetch(`${app.baseUrl}/_demo/receiver?${query}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-webhook-signature": hmacHeader,
    },
    body: JSON.stringify(bodyObj),
  });
  const body = (await res.json()) as Record<string, unknown>;
  return { status: res.status, body };
}
