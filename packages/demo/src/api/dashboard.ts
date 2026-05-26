import type { FastifyInstance } from "fastify";
import { ROUTE_DASHBOARD, ROUTE_QUEUE_STATS } from "../constants.js";

// demo/api/dashboard.ts — GET /dashboard (HTML), GET /api/queue/stats (JSON)
//
// PRD `01` F1.4 / `05` §6. 별도 프론트엔드 의존성 도입 금지 — HTML 인라인.
// M5: dlq 카운터 추가(PRD `05` §6) — DLQ 큐의 총 작업 수.

// 큐의 generic 파라미터에 대해 invariant 한 의존을 피하기 위해 구조적 인터페이스로 선언.
export interface JobCountsProvider {
  getJobCounts(
    ...types: Array<"waiting" | "active" | "completed" | "failed" | "delayed">
  ): Promise<Record<string, number>>;
}

export interface DashboardRouteDeps {
  readonly queue: JobCountsProvider;
  /** M5: DLQ 큐. PRD `05` §6 — `dlq` 카운터. */
  readonly dlqQueue: JobCountsProvider;
}

export async function registerDashboardRoutes(
  app: FastifyInstance,
  deps: DashboardRouteDeps,
): Promise<void> {
  app.get(ROUTE_QUEUE_STATS, async (_req, reply) => {
    const [counts, dlqCounts] = await Promise.all([
      deps.queue.getJobCounts(
        "waiting",
        "active",
        "completed",
        "failed",
        "delayed",
      ),
      deps.dlqQueue.getJobCounts(
        "waiting",
        "active",
        "completed",
        "failed",
        "delayed",
      ),
    ]);
    // DLQ 는 적재만 되고 처리되지 않는다(I2.4). 운영상 정확성 위해 모든
    // 상태를 합산(미래에 stalled/회수가 도입되어도 안전).
    const dlqTotal =
      (dlqCounts.waiting ?? 0) +
      (dlqCounts.active ?? 0) +
      (dlqCounts.completed ?? 0) +
      (dlqCounts.failed ?? 0) +
      (dlqCounts.delayed ?? 0);
    return reply.code(200).send({
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
      delayed: counts.delayed ?? 0,
      dlq: dlqTotal,
    });
  });

  app.get(ROUTE_DASHBOARD, async (_req, reply) => {
    await reply
      .code(200)
      .header("content-type", "text/html; charset=utf-8")
      .send(renderDashboardHtml());
  });
}

function renderDashboardHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>webhook-relay dashboard</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 2rem; color: #111; }
  h1 { margin-top: 0; }
  .grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 1rem; }
  .card { background: #f4f4f5; border-radius: .5rem; padding: 1rem; }
  .card.dlq { background: #fee2e2; }
  .label { font-size: .8rem; text-transform: uppercase; color: #6b7280; }
  .val { font-size: 1.6rem; font-weight: 600; margin-top: .25rem; }
  footer { margin-top: 2rem; font-size: .8rem; color: #6b7280; }
</style>
</head>
<body>
<h1>webhook-relay</h1>
<p>Polls <code>${ROUTE_QUEUE_STATS}</code> every 2s.</p>
<div class="grid">
  <div class="card"><div class="label">waiting</div><div class="val" id="waiting">-</div></div>
  <div class="card"><div class="label">active</div><div class="val" id="active">-</div></div>
  <div class="card"><div class="label">completed</div><div class="val" id="completed">-</div></div>
  <div class="card"><div class="label">failed</div><div class="val" id="failed">-</div></div>
  <div class="card"><div class="label">delayed</div><div class="val" id="delayed">-</div></div>
  <div class="card dlq"><div class="label">dlq</div><div class="val" id="dlq">-</div></div>
</div>
<footer>demo/local only. Do not expose to the internet without auth.</footer>
<script>
  async function tick() {
    try {
      const r = await fetch('${ROUTE_QUEUE_STATS}');
      if (!r.ok) return;
      const s = await r.json();
      for (const k of ['waiting','active','completed','failed','delayed','dlq']) {
        document.getElementById(k).textContent = s[k] ?? '-';
      }
    } catch (_e) { /* ignore transient errors */ }
  }
  tick();
  setInterval(tick, 2000);
</script>
</body>
</html>`;
}
