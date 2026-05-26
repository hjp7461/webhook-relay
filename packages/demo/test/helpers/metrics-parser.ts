// helpers/metrics-parser.ts
//
// 통합 테스트 전용 — `/metrics` 응답 본문(prom-client text exposition format) 을
// 줄 단위 파싱하여 `Map<seriesKey, value>` 로 변환한다. 의존성 도입 금지
// (PLAN `04-m-obs-3-demo-metrics.md` §3 IT-OBS-6 구현 노트).
//
// seriesKey 형식:
//   - 라벨 없음: `<name>`
//   - 라벨 있음: `<name>{k1="v1",k2="v2",...}` — 라벨 키 알파벳 정렬.
//
// prom-client 가 출력하는 라벨 순서는 정의 순서이나, 본 파서는 normalize 를 위해
// 알파벳 정렬한 키로 재구성한다(테스트가 라벨 순서에 의존하지 않도록).

export type MetricSamples = ReadonlyMap<string, number>;

const SAMPLE_LINE_RE = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*\})?\s+(-?[0-9eE+.\-]+|NaN|\+Inf|-Inf)/;
const LABEL_KV_RE = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g;

/**
 * prom-client text exposition format 한 응답 본문을 파싱해 sample map 으로 반환.
 *
 * 동일 series 가 여러 번 등장하면 마지막 값을 채택한다(prom-client 는 동일
 * series 를 한 번만 출력하므로 사실상 충돌하지 않음).
 */
export function parseMetrics(body: string): MetricSamples {
  const out = new Map<string, number>();
  const lines = body.split("\n");
  for (const raw of lines) {
    if (raw.length === 0) continue;
    if (raw.startsWith("#")) continue;
    const m = raw.match(SAMPLE_LINE_RE);
    if (m === null) continue;
    const name = m[1] ?? "";
    const labelBlock = m[2] ?? "";
    const valueStr = m[3] ?? "";
    let value: number;
    if (valueStr === "+Inf") value = Number.POSITIVE_INFINITY;
    else if (valueStr === "-Inf") value = Number.NEGATIVE_INFINITY;
    else if (valueStr === "NaN") value = Number.NaN;
    else value = Number.parseFloat(valueStr);

    const key = buildSeriesKey(name, labelBlock);
    out.set(key, value);
  }
  return out;
}

function buildSeriesKey(name: string, labelBlock: string): string {
  if (labelBlock.length === 0) return name;
  const entries: Array<[string, string]> = [];
  for (const kv of labelBlock.matchAll(LABEL_KV_RE)) {
    const k = kv[1] ?? "";
    const v = kv[2] ?? "";
    entries.push([k, v]);
  }
  entries.sort((a, b) => a[0].localeCompare(b[0]));
  const labelStr = entries.map(([k, v]) => `${k}="${v}"`).join(",");
  return `${name}{${labelStr}}`;
}

/**
 * 정해진 라벨 부분집합을 가진 첫 시리즈의 값. 없으면 0.
 *
 * `name` + `labels` (부분집합, 키 정렬 무관) 으로 series 를 찾는다.
 */
export function getSeries(
  samples: MetricSamples,
  name: string,
  labels: Readonly<Record<string, string>> = {},
): number {
  const keys = Object.keys(labels).sort();
  // 라벨 없으면 정확 매치.
  if (keys.length === 0) {
    const v = samples.get(name);
    if (v !== undefined) return v;
  }
  // 부분 매치 — 라벨 부분집합 검색.
  for (const [seriesKey, value] of samples.entries()) {
    if (!seriesKey.startsWith(`${name}{`) && seriesKey !== name) continue;
    // 라벨 블록 추출.
    const open = seriesKey.indexOf("{");
    if (open === -1) {
      if (keys.length === 0) return value;
      continue;
    }
    const inner = seriesKey.slice(open + 1, seriesKey.length - 1);
    const presentLabels: Record<string, string> = {};
    for (const kv of inner.matchAll(LABEL_KV_RE)) {
      const k = kv[1] ?? "";
      const v = kv[2] ?? "";
      presentLabels[k] = v;
    }
    let ok = true;
    for (const k of keys) {
      const want = labels[k];
      if (presentLabels[k] !== want) {
        ok = false;
        break;
      }
    }
    if (ok) return value;
  }
  return 0;
}

/**
 * delta = after - before. 0 인 경우도 그대로 반환(테스트가 단언).
 */
export function delta(
  before: MetricSamples,
  after: MetricSamples,
  name: string,
  labels: Readonly<Record<string, string>> = {},
): number {
  const a = getSeries(after, name, labels);
  const b = getSeries(before, name, labels);
  return a - b;
}

/**
 * Histogram bucket 의 누적 카운트. `le` 라벨이 정확히 일치하는 bucket series 값.
 */
export function bucketAt(
  samples: MetricSamples,
  histogramName: string,
  le: number | "+Inf",
  extraLabels: Readonly<Record<string, string>> = {},
): number {
  const leStr = le === "+Inf" ? "+Inf" : String(le);
  return getSeries(samples, `${histogramName}_bucket`, {
    ...extraLabels,
    le: leStr,
  });
}
