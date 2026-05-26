import type { FastifyInstance } from "fastify";
import type { Queue } from "bullmq";
import { ROUTE_DASHBOARD, ROUTE_QUEUE_STATS } from "../constants.js";

// demo/api/dashboard.ts — GET /dashboard (HTML), GET /api/queue/stats (JSON)
//
// PRD `01` F1.4 / `05` §6. 별도 프론트엔드 의존성 도입 금지 — HTML 인라인.
// dlq 카운터는 M5 에서 추가. 본 M2 에서는 메인 큐 카운터만 노출.

export interface DashboardRouteDeps {
  readonly queue: Queue<unknown, unknown, string>;
}

export async function registerDashboardRoutes(
  app: FastifyInstance,
  deps: DashboardRouteDeps,
): Promise<void> {
  app.get(ROUTE_QUEUE_STATS, async (_req, reply) => {
    const counts = await deps.queue.getJobCounts(
      "waiting",
      "active",
      "completed",
      "failed",
      "delayed",
    );
    return reply.code(200).send({
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
      delayed: counts.delayed ?? 0,
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
  .grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 1rem; }
  .card { background: #f4f4f5; border-radius: .5rem; padding: 1rem; }
  .label { font-size: .8rem; text-transform: uppercase; color: #6b7280; }
  .val { font-size: 1.6rem; font-weight: 600; margin-top: .25rem; }
  footer { margin-top: 2rem; font-size: .8rem; color: #6b7280; }
</style>
</head>
<body>
<h1>webhook-relay</h1>
<p>Polls <code>${ROUTE_QUEUE_STATS}</code> every 2s. DLQ counter is added in M5.</p>
<div class="grid">
  <div class="card"><div class="label">waiting</div><div class="val" id="waiting">-</div></div>
  <div class="card"><div class="label">active</div><div class="val" id="active">-</div></div>
  <div class="card"><div class="label">completed</div><div class="val" id="completed">-</div></div>
  <div class="card"><div class="label">failed</div><div class="val" id="failed">-</div></div>
  <div class="card"><div class="label">delayed</div><div class="val" id="delayed">-</div></div>
</div>
<footer>M2 MVP — demo/local only. Do not expose to the internet without auth.</footer>
<script>
  async function tick() {
    try {
      const r = await fetch('${ROUTE_QUEUE_STATS}');
      if (!r.ok) return;
      const s = await r.json();
      for (const k of ['waiting','active','completed','failed','delayed']) {
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
