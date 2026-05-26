import type { FastifyInstance } from "fastify";
import { ROUTE_DEMO_RECEIVER } from "../constants.js";
import type { ReceiverStore } from "../receiver/store.js";

// demo/api/receiver.ts — POST /_demo/receiver
//
// 데모용 수신 엔드포인트. PRD `01` F1.3. 본문을 메모리(최근 50건)에 보관하고 200.
// 인증 없음(데모 정책).

export interface ReceiverRouteDeps {
  readonly store: ReceiverStore;
}

export async function registerReceiverRoute(
  app: FastifyInstance,
  deps: ReceiverRouteDeps,
): Promise<void> {
  app.post(ROUTE_DEMO_RECEIVER, async (req, reply) => {
    // 헤더는 단순 문자열 매핑으로 보존(시크릿 마스킹은 정책상 본 PRD 범위 외).
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === "string") headers[k] = v;
      else if (Array.isArray(v)) headers[k] = v.join(",");
    }
    deps.store.add({
      receivedAt: Date.now(),
      headers,
      body: req.body,
    });
    return reply.code(200).send({ ok: true });
  });
}
