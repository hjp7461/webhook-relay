import { describe, expect, it } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// IT-OBS-7 — Grafana provisioning 유효성
//
// PLAN `docs/plan-phase3/05-m-obs-4-grafana.md` §3 IT-OBS-7.
//
// 단언(파일시스템 + 단순 substring/줄 단위 grep — 새 의존성 금지):
//   1) 4개 대시보드 JSON 파일 존재.
//   2) provisioning datasource/dashboards YAML 파일 존재.
//   3) datasource YAML: `apiVersion: 1`, name `Prometheus`, type `prometheus`,
//      url `http://prometheus:9090`, isDefault true, editable false.
//   4) dashboards YAML: `apiVersion: 1`, providers[0].name `webhook-relay`,
//      `allowUiUpdates: false`, `options.path /var/lib/grafana/dashboards`.
//   5) docker-compose.yml 에 GIT_COMMIT build.args 가 api/worker 양쪽에 등장
//      (§1.2 추가 변경 회귀 가드).
//   6) packages/demo/Dockerfile 에 `ARG GIT_COMMIT` + `ENV GIT_COMMIT=$GIT_COMMIT`
//      등장 (§1.2 추가 변경 회귀 가드).
//
// 본 테스트는 Testcontainers/Redis 의존 없음. 파일시스템만 읽어 빠르게 검증한다.

const HERE = dirname(fileURLToPath(import.meta.url));
// packages/demo/test → 저장소 루트.
const REPO_ROOT = resolve(HERE, "..", "..", "..");

function repoPath(relative: string): string {
  return resolve(REPO_ROOT, relative);
}

function readText(relative: string): string {
  return readFileSync(repoPath(relative), "utf8");
}

function fileExists(relative: string): boolean {
  try {
    return statSync(repoPath(relative)).isFile();
  } catch {
    return false;
  }
}

const DASHBOARD_FILES = [
  "docker/grafana/dashboards/01-overview.json",
  "docker/grafana/dashboards/02-reliability.json",
  "docker/grafana/dashboards/03-dlq.json",
  "docker/grafana/dashboards/04-shutdown.json",
] as const;

const PROVISIONING_FILES = [
  "docker/grafana/provisioning/datasources/prometheus.yaml",
  "docker/grafana/provisioning/dashboards/webhook-relay.yaml",
] as const;

/**
 * `key: value` 형태의 단순 YAML 줄 등장 여부. 들여쓰기 임의 폭 허용. 값의
 * 따옴표 유무 모두 허용. 본 단언은 표준 YAML 파서 도입 없이 줄 단위 정규식으로만
 * 처리한다(PLAN §3 의 "단순 substring + 라인 단위 grep" 제약 정합).
 */
function yamlHasKeyValue(text: string, key: string, value: string): boolean {
  // 따옴표 / 값 앞뒤 공백 / dash(- ) 등 흔한 형태 모두 매치.
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // `key: value` | `key: "value"` | `- key: value` (dash 인덴트 허용).
  const re = new RegExp(
    String.raw`^\s*-?\s*${escapedKey}\s*:\s*["']?${escapedValue}["']?\s*$`,
    "m",
  );
  return re.test(text);
}

describe("IT-OBS-7 grafana provisioning validity", () => {
  it("all 4 dashboard JSON files exist under docker/grafana/dashboards/", () => {
    for (const path of DASHBOARD_FILES) {
      expect(fileExists(path), `missing dashboard file: ${path}`).toBe(true);
    }
  });

  it("provisioning YAML files exist under docker/grafana/provisioning/", () => {
    for (const path of PROVISIONING_FILES) {
      expect(fileExists(path), `missing provisioning file: ${path}`).toBe(true);
    }
  });

  it("datasource YAML pins apiVersion/name/type/url/isDefault/editable", () => {
    const text = readText("docker/grafana/provisioning/datasources/prometheus.yaml");
    expect(yamlHasKeyValue(text, "apiVersion", "1")).toBe(true);
    expect(yamlHasKeyValue(text, "name", "Prometheus")).toBe(true);
    expect(yamlHasKeyValue(text, "type", "prometheus")).toBe(true);
    expect(yamlHasKeyValue(text, "url", "http://prometheus:9090")).toBe(true);
    expect(yamlHasKeyValue(text, "isDefault", "true")).toBe(true);
    expect(yamlHasKeyValue(text, "editable", "false")).toBe(true);
  });

  it("dashboards provider YAML pins apiVersion/name/allowUiUpdates/options.path", () => {
    const text = readText("docker/grafana/provisioning/dashboards/webhook-relay.yaml");
    expect(yamlHasKeyValue(text, "apiVersion", "1")).toBe(true);
    expect(yamlHasKeyValue(text, "name", "webhook-relay")).toBe(true);
    expect(yamlHasKeyValue(text, "allowUiUpdates", "false")).toBe(true);
    expect(yamlHasKeyValue(text, "path", "/var/lib/grafana/dashboards")).toBe(true);
  });

  it("docker-compose.yml injects GIT_COMMIT via build.args for api and worker", () => {
    const text = readText("docker-compose.yml");
    // 단일 출현 횟수 단언 — api/worker 두 서비스에 각각 등장해야 한다.
    const occurrences = text.match(/GIT_COMMIT\s*:\s*\$\{GIT_COMMIT:-unknown\}/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });

  it("Dockerfile declares ARG GIT_COMMIT and ENV GIT_COMMIT", () => {
    const text = readText("packages/demo/Dockerfile");
    expect(/^ARG\s+GIT_COMMIT(\s|=|$)/m.test(text)).toBe(true);
    expect(/^ENV\s+GIT_COMMIT=/m.test(text)).toBe(true);
  });
});
