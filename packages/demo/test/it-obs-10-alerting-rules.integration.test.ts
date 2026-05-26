import { describe, expect, it } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DLQ_REASON_MAX_ATTEMPTS_EXCEEDED,
  DLQ_REASON_NON_RETRIABLE,
  DLQ_REASON_STALLED_LOSS_RECOVERED,
  JOB_STATE_ACTIVE,
  JOB_STATE_COMPLETED,
  JOB_STATE_DELAYED,
  JOB_STATE_FAILED,
  JOB_STATE_WAITING,
  METRIC_BUILD_INFO,
  METRIC_DLQ_JOBS_TOTAL,
  METRIC_JOB_ATTEMPTS_TOTAL,
  METRIC_JOBS_PROCESSED_TOTAL,
  METRIC_QUEUE_DEPTH,
  METRIC_REDIS_RECONNECTS_TOTAL,
  METRIC_REDIS_UP,
  METRIC_SHUTDOWN_REMAINING_JOBS,
  METRIC_SHUTDOWN_STATE,
  METRIC_WORKER_ACTIVE_JOBS,
  METRIC_WORKER_PROCESSING_DURATION_SECONDS,
  OUTCOME_NON_RETRIABLE_ERROR,
  OUTCOME_RETRIABLE_ERROR,
  OUTCOME_SUCCESS,
  SHUTDOWN_STATE_DRAINING,
  SHUTDOWN_STATE_RUNNING,
  SHUTDOWN_STATE_TERMINATED,
} from "@webhook-relay/core/constants";
import {
  DELIVERY_RESULT_HTTP_ERROR,
  DELIVERY_RESULT_NETWORK_ERROR,
  DELIVERY_RESULT_SSRF_BLOCKED,
  DELIVERY_RESULT_SUCCESS,
  DELIVERY_RESULT_TIMEOUT,
  ERROR_CLASS_NONE,
  ERROR_CLASS_NON_RETRIABLE,
  ERROR_CLASS_RETRIABLE,
  HTTP_STATUS_CLASS_NONE,
  ROUTE_DASHBOARD,
  ROUTE_DEMO_RECEIVER,
  ROUTE_HEALTHZ,
  ROUTE_METRICS,
  ROUTE_QUEUE_STATS,
  ROUTE_WEBHOOKS,
  STATUS_CLASS_2XX,
  STATUS_CLASS_3XX,
  STATUS_CLASS_4XX,
  STATUS_CLASS_5XX,
  W3_OUTCOME_COMPLETED,
  W3_OUTCOME_DLQ_MAX_ATTEMPTS,
  W3_OUTCOME_DLQ_NON_RETRIABLE,
  W3_OUTCOME_DLQ_STALLED_LOSS,
} from "../src/constants.js";

// IT-OBS-10 — Prometheus alerting rule YAML 유효성 + 카탈로그/enum 정합
//
// PLAN `docs/plan-phase3/06-m-obs-5-slo-alerts.md` §3 IT-OBS-10.
//
// 본 테스트는 두 검증을 한다(새 의존성 도입 금지 — 파일시스템 + 정규식만 사용,
// IT-OBS-7 패턴 정합).
//
// (a) 4개 rule YAML 파일 존재 + 구조 단언
//     - 파일명 ↔ group name 일치
//     - 각 alert 룰에 `alert:` / `expr:` / `labels:` / `annotations:` 존재
//     - SLO 알람(availability/latency/dlq)은 `slo:` 라벨 존재
//     - 모든 알람은 `severity:` 라벨 존재
//     - `runbook_url:` 가 등장하면 빈 문자열(PRD §5.2.1, 운영 PRD 책임)
//
// (b) PromQL 카탈로그 + 라벨 enum 정합
//     - 추출된 `webhook_relay_*` 메트릭 이름이 PRD `prd-phase3/01` §3 카탈로그
//       (M-OBS-2/3 코드에 잠긴 METRIC_* 상수)의 부분집합
//     - 추출된 라벨 값(route/status_class/outcome/reason/result/error_class/
//       state/http_status_class)이 `core` + `demo` constants 의 enum 에 닫혀 있음
//     - 알람 이름 10종 전건 등장
//
// Testcontainers Redis 불필요(정적 파일 검증).

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

// ---------------------------------------------------------------------------
// 파일/그룹 매트릭스
// ---------------------------------------------------------------------------

interface RuleFileSpec {
  /** 저장소 루트 기준 경로. */
  readonly path: string;
  /** YAML `groups[0].name` 값. 파일명(`.yaml` 제거)과 동일해야 한다. */
  readonly groupName: string;
  /** 본 파일에 등장해야 할 alert 이름 목록. */
  readonly alerts: ReadonlyArray<string>;
  /** SLO 카테고리 파일이면 모든 알람이 `slo:` 라벨을 가져야 한다. */
  readonly requiresSloLabel: boolean;
}

const RULE_FILES: ReadonlyArray<RuleFileSpec> = [
  {
    path: "docker/prometheus/rules/webhook-relay-availability.yaml",
    groupName: "webhook-relay-availability",
    alerts: [
      "WebhookRelayAvailabilityBurnRateFast",
      "WebhookRelayAvailabilityBurnRateSlow",
    ],
    requiresSloLabel: true,
  },
  {
    path: "docker/prometheus/rules/webhook-relay-latency.yaml",
    groupName: "webhook-relay-latency",
    alerts: [
      "WebhookRelayRegisterLatencyP99High",
      "WebhookRelayDeliveryLatencyP99High",
    ],
    requiresSloLabel: true,
  },
  {
    path: "docker/prometheus/rules/webhook-relay-dlq.yaml",
    groupName: "webhook-relay-dlq",
    alerts: ["WebhookRelayDlqRateHigh", "WebhookRelayDlqStalledLoss"],
    // DLQ 파일: RateHigh 는 SLO-4, StalledLoss 는 플랫폼 신호(SLO 외).
    // 본 단언은 SLO 알람 존재 여부에 한정 — 파일 전체 일괄 단언은 아님.
    requiresSloLabel: false,
  },
  {
    path: "docker/prometheus/rules/webhook-relay-platform.yaml",
    groupName: "webhook-relay-platform",
    alerts: [
      "WebhookRelayRedisDown",
      "WebhookRelayRedisReconnectStorm",
      "WebhookRelayInstanceDown",
      "WebhookRelayShutdownTimedOut",
    ],
    requiresSloLabel: false,
  },
];

// 메트릭 카탈로그 — `core` + `demo` 의 METRIC_* 상수가 단일 출처.
// `demo` 의 D1~D3 / W1~W4 는 별도 상수가 존재하지 않으나 본 테스트는 PromQL 에
// 등장하는 메트릭 이름을 정규식으로 추출 후 본 집합에 닫혀 있는지만 단언한다
// (PRD `prd-phase3/01` §3 카탈로그 — bucket 접미 `_bucket` 포함 형태도 허용).
const CORE_METRIC_NAMES: ReadonlySet<string> = new Set([
  METRIC_QUEUE_DEPTH,
  METRIC_JOBS_PROCESSED_TOTAL,
  METRIC_JOB_ATTEMPTS_TOTAL,
  METRIC_WORKER_PROCESSING_DURATION_SECONDS,
  METRIC_DLQ_JOBS_TOTAL,
  METRIC_WORKER_ACTIVE_JOBS,
  METRIC_REDIS_RECONNECTS_TOTAL,
  METRIC_REDIS_UP,
  METRIC_SHUTDOWN_STATE,
  METRIC_SHUTDOWN_REMAINING_JOBS,
  METRIC_BUILD_INFO,
]);

const DEMO_METRIC_NAMES: ReadonlySet<string> = new Set([
  "webhook_relay_api_requests_total",
  "webhook_relay_api_request_duration_seconds",
  "webhook_relay_api_request_body_bytes",
  "webhook_relay_deliveries_total",
  "webhook_relay_delivery_duration_seconds",
  "webhook_relay_delivery_attempts_per_job",
  "webhook_relay_receiver_received_total",
]);

const ALL_METRIC_BASE_NAMES: ReadonlySet<string> = new Set([
  ...CORE_METRIC_NAMES,
  ...DEMO_METRIC_NAMES,
]);

// 카탈로그 정합 검증 시 허용되는 PromQL 메트릭 이름 — 위 base 이름 + histogram
// 의 `_bucket` 접미. histogram 의 `_sum`/`_count` 는 본 마일스톤 PromQL 에 등장
// 하지 않으므로 추가하지 않는다(미래 추가 시 본 집합도 갱신).
function isCatalogedMetric(name: string): boolean {
  if (ALL_METRIC_BASE_NAMES.has(name)) return true;
  if (name.endsWith("_bucket")) {
    return ALL_METRIC_BASE_NAMES.has(name.slice(0, -"_bucket".length));
  }
  return false;
}

// 라벨 enum — PRD `prd-phase3/01` §4.2 + `core`/`demo` constants.ts 단일 출처.
const ROUTE_VALUES: ReadonlySet<string> = new Set([
  ROUTE_WEBHOOKS,
  ROUTE_DEMO_RECEIVER,
  ROUTE_DASHBOARD,
  "/dashboard/...",
  ROUTE_QUEUE_STATS,
  ROUTE_HEALTHZ,
  ROUTE_METRICS,
]);

const STATUS_CLASS_VALUES: ReadonlySet<string> = new Set([
  STATUS_CLASS_2XX,
  STATUS_CLASS_3XX,
  STATUS_CLASS_4XX,
  STATUS_CLASS_5XX,
]);

const HTTP_STATUS_CLASS_VALUES: ReadonlySet<string> = new Set([
  STATUS_CLASS_2XX,
  STATUS_CLASS_3XX,
  STATUS_CLASS_4XX,
  STATUS_CLASS_5XX,
  HTTP_STATUS_CLASS_NONE,
]);

// `outcome` 는 core 의 시도 단위 enum 과 demo 의 W3 종단 enum 두 가지가 공존.
// PromQL 에 등장하는 값이 둘 중 어느 한 쪽에 속하면 enum 폐쇄성 만족.
const OUTCOME_VALUES: ReadonlySet<string> = new Set([
  OUTCOME_SUCCESS,
  OUTCOME_RETRIABLE_ERROR,
  OUTCOME_NON_RETRIABLE_ERROR,
  W3_OUTCOME_COMPLETED,
  W3_OUTCOME_DLQ_MAX_ATTEMPTS,
  W3_OUTCOME_DLQ_NON_RETRIABLE,
  W3_OUTCOME_DLQ_STALLED_LOSS,
]);

const REASON_VALUES: ReadonlySet<string> = new Set([
  DLQ_REASON_MAX_ATTEMPTS_EXCEEDED,
  DLQ_REASON_NON_RETRIABLE,
  DLQ_REASON_STALLED_LOSS_RECOVERED,
]);

const RESULT_VALUES: ReadonlySet<string> = new Set([
  DELIVERY_RESULT_SUCCESS,
  DELIVERY_RESULT_HTTP_ERROR,
  DELIVERY_RESULT_NETWORK_ERROR,
  DELIVERY_RESULT_TIMEOUT,
  DELIVERY_RESULT_SSRF_BLOCKED,
]);

const ERROR_CLASS_VALUES: ReadonlySet<string> = new Set([
  ERROR_CLASS_NONE,
  ERROR_CLASS_RETRIABLE,
  ERROR_CLASS_NON_RETRIABLE,
]);

const STATE_VALUES: ReadonlySet<string> = new Set([
  SHUTDOWN_STATE_RUNNING,
  SHUTDOWN_STATE_DRAINING,
  SHUTDOWN_STATE_TERMINATED,
]);

// `job_state` (C1/C2) — BullMQ 상태 모델. 현재 본 마일스톤 PromQL 에는 등장하지
// 않으나, 미래 확장에 대비해 폐쇄성 단언 대상에 포함.
const JOB_STATE_VALUES: ReadonlySet<string> = new Set([
  JOB_STATE_WAITING,
  JOB_STATE_ACTIVE,
  JOB_STATE_DELAYED,
  JOB_STATE_COMPLETED,
  JOB_STATE_FAILED,
]);

interface LabelEnumSpec {
  readonly name: string;
  readonly values: ReadonlySet<string>;
}

const LABEL_ENUMS: ReadonlyArray<LabelEnumSpec> = [
  { name: "route", values: ROUTE_VALUES },
  { name: "status_class", values: STATUS_CLASS_VALUES },
  { name: "http_status_class", values: HTTP_STATUS_CLASS_VALUES },
  { name: "outcome", values: OUTCOME_VALUES },
  { name: "reason", values: REASON_VALUES },
  { name: "result", values: RESULT_VALUES },
  { name: "error_class", values: ERROR_CLASS_VALUES },
  { name: "state", values: STATE_VALUES },
  { name: "job_state", values: JOB_STATE_VALUES },
];

// ---------------------------------------------------------------------------
// 정규식 헬퍼
// ---------------------------------------------------------------------------

// `webhook_relay_<something>` 또는 그 `_bucket` 접미 형태.
const METRIC_NAME_RE = /\bwebhook_relay_[a-z_]+(?:_bucket)?\b/g;

// `label="value"` 형태(따옴표 안 값은 backslash 무시 — 본 PRD 단순값만 사용).
const LABEL_VALUE_RE = /([a-z_]+)\s*=\s*"([^"]+)"/g;

// `alert: <Name>` 라인.
const ALERT_NAME_RE = /^\s*-?\s*alert\s*:\s*([A-Za-z][A-Za-z0-9_]*)\s*$/gm;

// `groups:` 시작.
const GROUPS_HEADER_RE = /^groups\s*:\s*$/m;

// `name: <group>` 라인(들여쓰기 임의).
function groupNameRe(name: string): RegExp {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(String.raw`^\s*-?\s*name\s*:\s*${escaped}\s*$`, "m");
}

// ---------------------------------------------------------------------------
// 단언
// ---------------------------------------------------------------------------

describe("IT-OBS-10 alerting rule YAML validity + catalog alignment", () => {
  describe("(a) file existence + structural assertions", () => {
    it("all 4 rule YAML files exist under docker/prometheus/rules/", () => {
      for (const spec of RULE_FILES) {
        expect(fileExists(spec.path), `missing rule file: ${spec.path}`).toBe(true);
      }
    });

    it("each file starts with `groups:` and declares the expected group name", () => {
      for (const spec of RULE_FILES) {
        const text = readText(spec.path);
        expect(GROUPS_HEADER_RE.test(text), `groups: missing in ${spec.path}`).toBe(true);
        expect(
          groupNameRe(spec.groupName).test(text),
          `group name "${spec.groupName}" missing in ${spec.path}`,
        ).toBe(true);
      }
    });

    it("each file declares the expected alert names", () => {
      for (const spec of RULE_FILES) {
        const text = readText(spec.path);
        const matched = new Set<string>();
        for (const m of text.matchAll(ALERT_NAME_RE)) {
          matched.add(m[1]!);
        }
        for (const alertName of spec.alerts) {
          expect(matched.has(alertName), `alert "${alertName}" missing in ${spec.path}`).toBe(
            true,
          );
        }
      }
    });

    it("every alert rule has required fields (expr, labels, annotations, summary, severity)", () => {
      for (const spec of RULE_FILES) {
        const text = readText(spec.path);
        // 각 알람 블록을 다음 `- alert:` 또는 파일 끝까지 잘라 단언한다.
        const alertBlocks = splitAlertBlocks(text);
        expect(
          alertBlocks.length,
          `no alert blocks found in ${spec.path}`,
        ).toBeGreaterThanOrEqual(spec.alerts.length);
        for (const block of alertBlocks) {
          // expr / for / labels / annotations / summary / severity 등장 확인.
          expect(/^\s*expr\s*:/m.test(block), `expr missing in alert block:\n${block}`).toBe(
            true,
          );
          expect(/^\s*labels\s*:/m.test(block), `labels missing in alert block:\n${block}`).toBe(
            true,
          );
          expect(
            /^\s*annotations\s*:/m.test(block),
            `annotations missing in alert block:\n${block}`,
          ).toBe(true);
          expect(
            /^\s*severity\s*:\s*(page|ticket)\s*$/m.test(block),
            `severity (page|ticket) missing in alert block:\n${block}`,
          ).toBe(true);
          expect(
            /^\s*summary\s*:/m.test(block),
            `annotations.summary missing in alert block:\n${block}`,
          ).toBe(true);
          // runbook_url 가 있다면 빈 문자열이어야 한다(PRD `04` §5.2.1).
          // 정규식이 quoted 값 또는 빈 RHS 만 캡쳐하고, 라인 끝의 YAML 인라인
          // 주석(`# ...`)은 비-캡쳐 그룹으로 허용한다 — PRD 본문이
          // `runbook_url: ""  # 본 PRD 범위 밖 — 운영 PRD에서 작성` 형태이기
          // 때문(글자 단위 정합 보존).
          const runbookMatch = block.match(
            /^\s*runbook_url\s*:\s*(""|''|)\s*(?:#.*)?$/m,
          );
          if (runbookMatch) {
            const rhs = runbookMatch[1]!;
            expect(
              rhs === '""' || rhs === "''" || rhs === "",
              `runbook_url must be empty string, got: ${JSON.stringify(rhs)}`,
            ).toBe(true);
          }
        }
      }
    });

    it("SLO category files (availability, latency) declare `slo:` label on every alert", () => {
      for (const spec of RULE_FILES) {
        if (!spec.requiresSloLabel) continue;
        const text = readText(spec.path);
        const blocks = splitAlertBlocks(text);
        for (const block of blocks) {
          expect(
            /^\s*slo\s*:\s*SLO-[0-9]+-[a-z\-]+\s*$/m.test(block),
            `slo: label missing in alert block of ${spec.path}:\n${block}`,
          ).toBe(true);
        }
      }
    });

    it("SLO-4 DLQ rate alert (WebhookRelayDlqRateHigh) carries `slo: SLO-4-dlq-rate`", () => {
      const text = readText("docker/prometheus/rules/webhook-relay-dlq.yaml");
      const block = extractAlertBlock(text, "WebhookRelayDlqRateHigh");
      expect(block).not.toBeNull();
      expect(/^\s*slo\s*:\s*SLO-4-dlq-rate\s*$/m.test(block!)).toBe(true);
    });
  });

  describe("(b) PromQL catalog + label enum closure", () => {
    it("all `webhook_relay_*` metric names referenced in rules are in the catalog", () => {
      for (const spec of RULE_FILES) {
        const text = readText(spec.path);
        const referenced = new Set<string>();
        for (const m of text.matchAll(METRIC_NAME_RE)) {
          referenced.add(m[0]);
        }
        for (const metric of referenced) {
          expect(
            isCatalogedMetric(metric),
            `unknown metric in ${spec.path}: ${metric}`,
          ).toBe(true);
        }
      }
    });

    it("PromQL label values are closed under the enum tables (route/status_class/outcome/reason/result/error_class/state/http_status_class/job_state)", () => {
      const labelByName = new Map(LABEL_ENUMS.map((e) => [e.name, e.values]));
      for (const spec of RULE_FILES) {
        const text = readText(spec.path);
        // `expr:` 본문만 추출해 검사한다 — annotations 안의 라벨 형태 문구는
        // 영문 설명일 뿐 enum 검증 대상이 아니다.
        const exprBodies = extractExprBodies(text);
        for (const expr of exprBodies) {
          for (const m of expr.matchAll(LABEL_VALUE_RE)) {
            const key = m[1]!;
            const value = m[2]!;
            const enumSet = labelByName.get(key);
            if (!enumSet) continue; // 본 8종 라벨 외(예: 메타 라벨)는 검증 대상 외.
            expect(
              enumSet.has(value),
              `label "${key}" value "${value}" not in enum (file: ${spec.path})`,
            ).toBe(true);
          }
        }
      }
    });

    it("every expected alert name (10 total) appears exactly once across the 4 files", () => {
      const expected: ReadonlyArray<string> = RULE_FILES.flatMap((s) => s.alerts);
      expect(expected.length).toBe(10);
      const counts = new Map<string, number>();
      for (const spec of RULE_FILES) {
        const text = readText(spec.path);
        for (const m of text.matchAll(ALERT_NAME_RE)) {
          const name = m[1]!;
          counts.set(name, (counts.get(name) ?? 0) + 1);
        }
      }
      for (const name of expected) {
        expect(counts.get(name), `alert "${name}" must appear exactly once`).toBe(1);
      }
    });
  });

  describe("rule_files glob coverage (sanity)", () => {
    it("docker/prometheus.yml rule_files glob `/etc/prometheus/rules/*.yaml` matches the 4 new files", () => {
      const promCfg = readText("docker/prometheus.yml");
      // 글롭 라인 존재.
      expect(/\/etc\/prometheus\/rules\/\*\.yaml/.test(promCfg)).toBe(true);
      // 실제 4 파일이 모두 `.yaml` 확장자.
      for (const spec of RULE_FILES) {
        expect(spec.path.endsWith(".yaml"), `must use .yaml extension: ${spec.path}`).toBe(
          true,
        );
      }
    });
  });
});

// ---------------------------------------------------------------------------
// 보조: YAML 텍스트에서 alert 블록 단위로 분리
// ---------------------------------------------------------------------------

/**
 * `- alert:` 줄을 경계로 텍스트를 잘라 각 알람의 본문 블록을 반환한다.
 * 첫 블록 이전(파일 헤더 부분)은 버린다.
 */
function splitAlertBlocks(text: string): ReadonlyArray<string> {
  const lines = text.split(/\r?\n/);
  const blocks: string[] = [];
  let current: string[] | null = null;
  const startRe = /^\s*-\s*alert\s*:/;
  for (const line of lines) {
    if (startRe.test(line)) {
      if (current !== null) blocks.push(current.join("\n"));
      current = [line];
    } else if (current !== null) {
      current.push(line);
    }
  }
  if (current !== null) blocks.push(current.join("\n"));
  return blocks;
}

/**
 * 특정 알람 이름에 해당하는 블록 1개를 추출한다. 없으면 null.
 */
function extractAlertBlock(text: string, alertName: string): string | null {
  for (const block of splitAlertBlocks(text)) {
    const m = block.match(/^\s*-\s*alert\s*:\s*([A-Za-z][A-Za-z0-9_]*)\s*$/m);
    if (m && m[1] === alertName) return block;
  }
  return null;
}

/**
 * `expr: |` 의 본문(들여쓰기로 이어지는 후속 라인) 또는 `expr: <inline>` 의 inline
 * 값을 모두 추출한다. annotations.description 등 다른 multiline 블록은 제외.
 */
function extractExprBodies(text: string): ReadonlyArray<string> {
  const lines = text.split(/\r?\n/);
  const bodies: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const inlineMatch = line.match(/^(\s*)expr\s*:\s*(.+?)\s*$/);
    if (inlineMatch) {
      const indent = inlineMatch[1]!;
      const rhs = inlineMatch[2]!;
      if (rhs === "|" || rhs === ">" || rhs === "|-" || rhs === ">-") {
        // 블록 스칼라: 들여쓰기가 더 깊은 줄을 모두 수집.
        const body: string[] = [];
        i += 1;
        while (i < lines.length) {
          const next = lines[i]!;
          if (next.length === 0) {
            body.push("");
            i += 1;
            continue;
          }
          const nextIndent = (next.match(/^(\s*)/) ?? ["", ""])[1]!.length;
          if (nextIndent <= indent.length) break;
          body.push(next);
          i += 1;
        }
        bodies.push(body.join("\n"));
        continue;
      }
      // inline 값.
      bodies.push(rhs);
    }
    i += 1;
  }
  return bodies;
}
