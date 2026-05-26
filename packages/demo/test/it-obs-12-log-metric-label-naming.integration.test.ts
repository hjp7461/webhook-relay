import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// IT-OBS-12 — 구조화 로그 ↔ 메트릭 라벨 명명 정합 (정적 검사)
//
// PLAN `docs/plan-phase3/07-m-obs-6-refinement.md` §3 IT-OBS-12.
// PRD `prd-phase3/00-overview.md` §8 — 메트릭 라벨과 로그 컨텍스트가 같은
// 이름을 쓰도록 권장 (계승 원칙).
//
// 본 테스트는 Redis 불필요한 정적 검사. demo/src 의 코드와 매핑 표를 비교해
// 로그/메트릭 라벨 명명 규칙의 회귀를 보호한다.
//
// 매핑 규칙(PRD §8 정합, 본 PRD §4.3 라벨 금지 목록 정합):
// - 로그 컨텍스트는 camelCase, 메트릭 라벨은 snake_case 를 사용한다.
// - 동일 식별자가 로그/메트릭 양쪽에 등장하면(예: `errorClass` ↔ `error_class`)
//   snake_case ↔ camelCase 일관 변환 규칙을 따른다.
// - 자유 문자열(예: `jobId`, `idempotencyKey`, `httpStatus`(raw), `attempt`(raw))
//   은 로그에만 두고 메트릭 라벨로는 두지 않는다(카디널리티 보호 — PRD §4.3).
//
// 본 IT-OBS-12 는 위 매핑 표를 단언하며, 위반 시 빌드 실패하는 회귀 가드다
// (PLAN §3 단서 — 위반 시 경고 로그가 아닌 fail 로 잠근다).

// 매핑 표 — 본 PRD 가 잠그는 단일 출처.
//
// metricLabel:
//   - 문자열  → 해당 로그 키에 대응하는 메트릭 라벨 이름이 코드에 등장해야 한다.
//   - null    → 본 로그 키는 의도적으로 메트릭 라벨에 두지 않는다(PRD §4.3 금지).
const LOG_TO_METRIC_LABEL_MAPPING: ReadonlyArray<{
  readonly logKey: string;
  readonly metricLabel: string | null;
  readonly rationale: string;
}> = [
  // 도메인 로그 키 — webhook-delivery 핸들러 컨텍스트.
  {
    logKey: "jobId",
    metricLabel: null,
    rationale: "PRD §4.3 — 자유 문자열, 무한 카디널리티 라벨 금지",
  },
  {
    logKey: "idempotencyKey",
    metricLabel: null,
    rationale: "PRD §4.3 — 자유 문자열, 무한 카디널리티 라벨 금지",
  },
  {
    logKey: "attempt",
    metricLabel: null,
    rationale: "PRD §4.3 — raw 시도 번호는 W3 Histogram bucket 으로 분포 분해",
  },
  {
    logKey: "queueName",
    metricLabel: "queue",
    rationale: "라벨 이름 단순화 — camelCase → snake_case 변환 + 'Name' 접미 제거",
  },
  {
    logKey: "errorClass",
    metricLabel: "error_class",
    rationale: "camelCase ↔ snake_case 일관 변환 (PRD §3.3 W1)",
  },
  {
    logKey: "httpStatus",
    metricLabel: null,
    rationale: "PRD §4.3 — raw status code 라벨 금지, `http_status_class` 로 묶음",
  },
  {
    logKey: "errorMessage",
    metricLabel: null,
    rationale: "운영 로그 전용 — 자유 문자열, 라벨 금지",
  },
  {
    logKey: "durationMs",
    metricLabel: null,
    rationale: "ms 단위 raw 값 — W2 / D2 Histogram seconds 로 대응(라벨 아님)",
  },
  // 운영/부트스트랩 로그 키 — server.ts.
  {
    logKey: "mode",
    metricLabel: null,
    rationale: "SERVICE_MODE 라벨링은 본 PRD 범위 밖 — 운영 로그 전용",
  },
  {
    logKey: "address",
    metricLabel: null,
    rationale: "운영 로그 전용 — Fastify listen 결과",
  },
  {
    logKey: "signal",
    metricLabel: null,
    rationale: "운영 로그 전용 — SIGTERM / SIGINT 식별",
  },
  {
    logKey: "err",
    metricLabel: null,
    rationale: "운영 로그 전용 — pino 표준 err 직렬화 키",
  },
  {
    logKey: "remainingJobIds",
    metricLabel: null,
    rationale: "C10 `shutdown_remaining_jobs` 의 카운트 Gauge 로 메트릭 대응",
  },
];

// 본 테스트가 검사할 demo/src 파일 경로(로그 키 스캔).
const SRC_FILES_TO_SCAN_LOG_KEYS: ReadonlyArray<string> = [
  "handlers/webhook-delivery.ts",
  "api/webhooks.ts",
  "server.ts",
];

// 메트릭 라벨은 core/src/metrics.ts 와 demo/src/metrics.ts 양쪽에 분산되어
// 있다(PRD §6 의 도메인 격리 — core 가 C-series, demo 가 D/W-series).
// 본 정합 단언은 양쪽을 합쳐 검사한다.
const METRICS_MODULE_RELS: ReadonlyArray<{
  readonly base: "demo" | "core";
  readonly rel: string;
}> = [
  { base: "demo", rel: "metrics.ts" },
  { base: "core", rel: "metrics.ts" },
];

const HERE_DIR = fileURLToPath(new URL(".", import.meta.url));
const DEMO_SRC_DIR = join(HERE_DIR, "..", "src");
const CORE_SRC_DIR = join(HERE_DIR, "..", "..", "core", "src");

function readSrc(rel: string): string {
  return readFileSync(join(DEMO_SRC_DIR, rel), "utf8");
}

function readMetricsModule(entry: { base: "demo" | "core"; rel: string }): string {
  const root = entry.base === "demo" ? DEMO_SRC_DIR : CORE_SRC_DIR;
  return readFileSync(join(root, entry.rel), "utf8");
}

// metrics.ts 의 `labelNames: [...]` 정의를 정규식으로 추출. 라벨 이름은
// 문자열 리터럴(`"queue"`) 또는 상수 식별자(`LABEL_QUEUE`) 둘 다 등장한다.
// 상수 식별자는 core/constants.ts 의 매핑(`LABEL_QUEUE = "queue"`) 으로 풀어낸다.
function extractMetricLabelNames(metricsModuleSrc: string): Set<string> {
  const labels = new Set<string>();
  // 1) `labelNames: [...]` 블록 안의 문자열 리터럴.
  const blockRe = /labelNames\s*:\s*\[([^\]]*)\]/g;
  for (const m of metricsModuleSrc.matchAll(blockRe)) {
    const inner = m[1] ?? "";
    for (const literal of inner.matchAll(/"([^"]+)"/g)) {
      const name = literal[1] ?? "";
      if (name.length > 0) labels.add(name);
    }
    // 본 블록 안에서 식별자(LABEL_*) 가 등장하면 후속 단계에서 풀어낸다.
  }
  return labels;
}

// core/constants.ts 의 `LABEL_xxx = "..."` 매핑을 추출해서 상수 → 라벨 이름 맵
// 으로 반환.
function extractLabelConstantMap(constantsSrc: string): Map<string, string> {
  const out = new Map<string, string>();
  const declRe = /\bLABEL_([A-Z_]+)\s*=\s*"([^"]+)"/g;
  for (const m of constantsSrc.matchAll(declRe)) {
    const id = `LABEL_${m[1] ?? ""}`;
    const value = m[2] ?? "";
    if (value.length > 0) out.set(id, value);
  }
  return out;
}

// core/metrics.ts 처럼 식별자(`LABEL_QUEUE`) 를 labelNames 에 사용하는 경우
// 본 함수가 식별자 → 문자열 매핑으로 풀어낸다.
function extractMetricLabelNamesWithConstants(
  metricsModuleSrc: string,
  constantMap: Map<string, string>,
): Set<string> {
  const labels = extractMetricLabelNames(metricsModuleSrc);
  const blockRe = /labelNames\s*:\s*\[([^\]]*)\]/g;
  for (const m of metricsModuleSrc.matchAll(blockRe)) {
    const inner = m[1] ?? "";
    for (const idMatch of inner.matchAll(/\b(LABEL_[A-Z_]+)\b/g)) {
      const id = idMatch[1] ?? "";
      const resolved = constantMap.get(id);
      if (resolved !== undefined) labels.add(resolved);
    }
  }
  return labels;
}

// 식별자가 소스에 키로 등장하는지 확인. 키 등장 패턴은 다음 중 하나:
//   - 객체 리터럴 키: `xxx:`
//   - 객체 단축 키:   `, xxx,` 또는 `{ xxx,` 또는 `{ xxx }`
// 본 검사는 false positive 를 피하기 위해 `\b<key>\b` 와
// 인접 콜론(`:`) 또는 코드 컨텍스트(콜론 / 쉼표 / 닫는 중괄호) 를 확인한다.
function logKeyIsPresent(src: string, key: string): boolean {
  const colonForm = new RegExp(`\\b${key}\\s*:`);
  if (colonForm.test(src)) return true;
  // 단축 키 — `{ key }` / `{ key,` / `, key,` / `, key }`.
  const shorthandForms = [
    new RegExp(`\\{\\s*${key}\\s*[,}]`),
    new RegExp(`,\\s*${key}\\s*[,}]`),
  ];
  for (const re of shorthandForms) {
    if (re.test(src)) return true;
  }
  return false;
}

function collectAllMetricLabels(): Set<string> {
  // core/constants.ts 의 LABEL_xxx 상수를 모두 풀어내기 위해 우선 로드.
  const coreConstantsSrc = readFileSync(join(CORE_SRC_DIR, "constants.ts"), "utf8");
  const labelConstantMap = extractLabelConstantMap(coreConstantsSrc);

  const all = new Set<string>();
  for (const entry of METRICS_MODULE_RELS) {
    const src = readMetricsModule(entry);
    for (const label of extractMetricLabelNamesWithConstants(src, labelConstantMap)) {
      all.add(label);
    }
  }
  return all;
}

describe("IT-OBS-12 log/metric label naming consistency (PRD §8)", () => {
  it("core/demo metrics 모듈이 매핑 표가 요구하는 라벨을 노출한다", () => {
    const allMetricLabels = collectAllMetricLabels();

    // 매핑 표가 명시한 메트릭 라벨(=non-null) 은 core 또는 demo metrics.ts 에
    // 적어도 한 군데 등장해야 한다.
    for (const entry of LOG_TO_METRIC_LABEL_MAPPING) {
      if (entry.metricLabel === null) continue;
      expect(
        allMetricLabels.has(entry.metricLabel),
        `mapping 표가 메트릭 라벨 "${entry.metricLabel}" 을 요구하지만 ` +
          `core 또는 demo metrics.ts 에 등장하지 않습니다 ` +
          `(logKey="${entry.logKey}", rationale="${entry.rationale}")`,
      ).toBe(true);
    }
  });

  it("demo/src log call sites use the expected camelCase log keys (mapping closure)", () => {
    // 각 로그 키가 demo/src 의 어딘가에 등장해야 매핑 표가 의미를 갖는다.
    // 등장하지 않는 매핑 행은 죽은 표 — 매핑이 코드와 어긋났음을 의미한다.
    const allSrc = SRC_FILES_TO_SCAN_LOG_KEYS.map((p) => readSrc(p)).join("\n");

    for (const entry of LOG_TO_METRIC_LABEL_MAPPING) {
      expect(
        logKeyIsPresent(allSrc, entry.logKey),
        `mapping 표가 로그 키 "${entry.logKey}" 을 요구하지만 ` +
          `demo/src 의 스캔 파일들(${SRC_FILES_TO_SCAN_LOG_KEYS.join(", ")})에 등장하지 않습니다 — ` +
          `로그 컨텍스트에서 사라졌다면 매핑 표도 갱신해야 합니다`,
      ).toBe(true);
    }
  });

  it("camelCase ↔ snake_case 변환 규칙이 매핑 표와 일치", () => {
    // 매핑 표의 (logKey, metricLabel) 쌍이 모두 PRD §8 의 변환 규칙을 따르는지
    // 본 단언으로 잠근다. 본 PRD 범위에서 두 라벨이 모두 존재하는 케이스는
    // `queueName` ↔ `queue` (이름 단순화) 와 `errorClass` ↔ `error_class`
    // (camelCase → snake_case) 두 건이다. 순서는 매핑 표 정의 순서와 일치.
    const expectedPairs: ReadonlyArray<{ logKey: string; metricLabel: string }> = [
      { logKey: "queueName", metricLabel: "queue" },
      { logKey: "errorClass", metricLabel: "error_class" },
    ];
    const actualPairs = LOG_TO_METRIC_LABEL_MAPPING.filter(
      (e): e is { logKey: string; metricLabel: string; rationale: string } =>
        e.metricLabel !== null,
    ).map((e) => ({ logKey: e.logKey, metricLabel: e.metricLabel }));

    expect(actualPairs).toEqual(expectedPairs);
  });

  it("core/demo metrics 의 모든 라벨이 PRD §3 카탈로그가 인지하는 집합 안에 있다", () => {
    // PRD §3.1 (C-series) + §3.2/§3.3 (D/W-series) 가 정의한 메트릭 라벨 전건.
    //
    // 본 단언은 새 라벨이 메트릭에 도입될 때 PRD 카탈로그 + 본 매핑 표 갱신을
    // 강제한다(회귀 가드).
    const allMetricLabels = collectAllMetricLabels();

    const KNOWN_METRIC_LABELS: ReadonlySet<string> = new Set<string>([
      // C-series (core/metrics.ts).
      "queue",
      "job_state",
      "outcome",
      "reason",
      "state",
      "version",
      "commit",
      "node_version",
      // D/W-series (demo/metrics.ts).
      "route",
      "method",
      "status_class",
      "result",
      "http_status_class",
      "error_class",
    ]);

    for (const label of allMetricLabels) {
      expect(
        KNOWN_METRIC_LABELS.has(label),
        `core/demo metrics.ts 의 라벨 "${label}" 이 IT-OBS-12 의 KNOWN 집합에 ` +
          `없습니다 — PRD §3 카탈로그 갱신 + 본 매핑 표 갱신을 선행하세요`,
      ).toBe(true);
    }
  });
});

