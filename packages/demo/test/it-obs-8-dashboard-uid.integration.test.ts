import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// IT-OBS-8 — 대시보드 JSON UID 안정성 (I5.2)
//
// PLAN `docs/plan-phase3/05-m-obs-4-grafana.md` §3 IT-OBS-8.
//
// 단언:
//   - 4개 JSON 파일을 `JSON.parse` 로 파싱.
//   - 각 파일의 `uid` 필드가 PRD §4 의 잠금값과 정확히 일치.
//   - 각 파일의 `tags` 배열에 "webhook-relay" 포함.
//   - 각 파일의 `title` 이 PRD §4 의 명칭과 정확히 일치.

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..", "..");

interface DashboardSpec {
  readonly file: string;
  readonly uid: string;
  readonly title: string;
}

// PRD `prd-phase3/03` §4.1~§4.4 표의 패널 헤더 + UID 잠금값.
const SPECS: readonly DashboardSpec[] = [
  {
    file: "docker/grafana/dashboards/01-overview.json",
    uid: "webhook-relay-overview",
    title: "Webhook Relay — Overview",
  },
  {
    file: "docker/grafana/dashboards/02-reliability.json",
    uid: "webhook-relay-reliability",
    title: "Webhook Relay — Reliability",
  },
  {
    file: "docker/grafana/dashboards/03-dlq.json",
    uid: "webhook-relay-dlq",
    title: "Webhook Relay — DLQ",
  },
  {
    file: "docker/grafana/dashboards/04-shutdown.json",
    uid: "webhook-relay-shutdown",
    title: "Webhook Relay — Shutdown",
  },
];

function readJson(relative: string): Record<string, unknown> {
  const raw = readFileSync(resolve(REPO_ROOT, relative), "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`expected object in ${relative}`);
  }
  return parsed as Record<string, unknown>;
}

describe("IT-OBS-8 dashboard UID/title/tags stability", () => {
  for (const spec of SPECS) {
    it(`${spec.file} has uid=${spec.uid}, title=${spec.title}, tag "webhook-relay"`, () => {
      const json = readJson(spec.file);
      expect(json["uid"]).toBe(spec.uid);
      expect(json["title"]).toBe(spec.title);
      const tags = json["tags"];
      expect(Array.isArray(tags)).toBe(true);
      expect((tags as unknown[]).includes("webhook-relay")).toBe(true);
    });
  }
});
