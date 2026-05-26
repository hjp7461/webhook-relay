import { describe, expect, it } from "vitest";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// IT-OBS-3 — Core 도메인 격리 (IT-R1 보강 + `help:` 텍스트 추가 검사)
//
// PLAN `docs/plan-phase3/03-m-obs-2-core-metrics.md` §3.3.
//
// 검증 대상:
//   - `packages/core/src/**/*.ts` 모든 파일.
//   - prom-client `new Counter|Gauge|Histogram({ name: ..., help: ... })`
//     선언에서 `name` 과 `help` 필드를 정규식으로 추출.
//   - 모든 name 이 정규식 `^webhook_relay_(queue|jobs|job|worker|dlq|redis|shutdown|build)_[a-z_]*$`
//     에 매치. (PRD `prd-phase3/01` §6.2 정합)
//   - 모든 help 텍스트에 도메인 식별자(`webhook`(단어 단위), `delivery`,
//     `fastify`, `receiver`, `_demo`) 0건. (IT-R1 보강과 동일한 BANNED 토큰
//     집합 — 단, `help: "..."` 문자열만 추가 검사.)

const HERE = dirname(fileURLToPath(import.meta.url));
const CORE_SRC = resolve(HERE, "..", "src");

const NAME_REGEX =
  /^webhook_relay_(queue|jobs|job|worker|dlq|redis|shutdown|build)_[a-z_]*$/;

// IT-R1 와 동일한 banned 토큰 집합(`http` 는 본 PLAN 범위 deviation 과 동일).
const BANNED_TOKENS: ReadonlyArray<string> = [
  "webhook",
  "delivery",
  "fastify",
  "receiver",
  "_demo",
];

async function* walkTsFiles(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkTsFiles(full);
    } else if (entry.isFile() && full.endsWith(".ts")) {
      yield full;
    }
  }
}

// 메트릭 선언 블록을 라인 단위 정규식 + lookahead 로 추출한다.
//
// 본 PLAN 범위의 core/metrics.ts 는 한 메트릭당 객체 리터럴 형태로 작성된다.
// 정확한 AST 파싱은 도입하지 않는다(PLAN §3.3 — "단순 정규식 + 라인 매칭으로
// 충분").
interface MetricDecl {
  readonly file: string;
  readonly typeCtor: string; // Counter / Gauge / Histogram
  readonly name?: string;
  readonly help?: string;
}

function extractMetricDeclarations(file: string, content: string): MetricDecl[] {
  const decls: MetricDecl[] = [];
  const ctorRegex = /new\s+(Counter|Gauge|Histogram)\s*(?:<[^>]*>)?\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = ctorRegex.exec(content)) !== null) {
    const typeCtor = m[1] ?? "";
    const start = m.index;
    // 본 ctor 호출의 닫는 ')' 를 단순 paren-depth 카운터로 찾는다.
    let depth = 0;
    let end = -1;
    let i = start;
    // 시작 '(' 까지 진행.
    while (i < content.length && content[i] !== "(") i++;
    for (; i < content.length; i++) {
      const ch = content[i];
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end < 0) continue;
    const block = content.slice(start, end + 1);

    const nameMatch = block.match(/\bname:\s*"([^"]+)"/);
    const helpMatch = block.match(/\bhelp:\s*"([^"]+)"/);
    decls.push({
      file,
      typeCtor,
      ...(nameMatch !== null ? { name: nameMatch[1] } : {}),
      ...(helpMatch !== null ? { help: helpMatch[1] } : {}),
    });
  }
  return decls;
}

interface Violation {
  readonly file: string;
  readonly kind: "name" | "help";
  readonly value: string;
  readonly matched?: string;
}

describe("IT-OBS-3 core domain isolation (prom-client metric declarations)", () => {
  it("core/src/** does not declare metrics with domain tokens in name or help", async () => {
    // 사전 조건: core/src 디렉터리 존재.
    const dirStat = await stat(CORE_SRC);
    expect(dirStat.isDirectory()).toBe(true);

    const allDecls: MetricDecl[] = [];
    for await (const file of walkTsFiles(CORE_SRC)) {
      const content = await readFile(file, "utf8");
      allDecls.push(...extractMetricDeclarations(file, content));
    }

    // 본 PLAN 범위에서는 metrics.ts 가 C1~C11 = 11개를 정의한다.
    // 본 IT는 카운트를 검사하지 않는다(UT 가 라벨/타입까지 단언).
    // 단, 최소 11건은 존재해야 의미가 있다(M-OBS-2 구현 후).
    expect(allDecls.length).toBeGreaterThanOrEqual(11);

    const offenders: Violation[] = [];
    for (const decl of allDecls) {
      if (decl.name !== undefined && !NAME_REGEX.test(decl.name)) {
        offenders.push({ file: decl.file, kind: "name", value: decl.name });
      }
      if (decl.help !== undefined) {
        // help 텍스트를 case-insensitive 토큰 매칭으로 검사. underscore-prefix
        // 토큰(`_demo`)은 그대로 substring 검사, 그 외는 단어 경계(\b).
        const lower = decl.help.toLowerCase();
        for (const banned of BANNED_TOKENS) {
          if (banned.startsWith("_")) {
            if (lower.includes(banned)) {
              offenders.push({
                file: decl.file,
                kind: "help",
                value: decl.help,
                matched: banned,
              });
            }
            continue;
          }
          const re = new RegExp(`\\b${banned}\\b`, "i");
          if (re.test(lower)) {
            offenders.push({
              file: decl.file,
              kind: "help",
              value: decl.help,
              matched: banned,
            });
          }
        }
      }
    }

    if (offenders.length > 0) {
      const msg = offenders
        .map(
          (o) =>
            `- [${o.kind}${o.matched !== undefined ? `<-${o.matched}` : ""}] ${o.file}: ${o.value}`,
        )
        .join("\n");
      throw new Error(
        `IT-OBS-3 violation: domain tokens leaked into core metric declarations.\n${msg}`,
      );
    }
    expect(offenders).toEqual([]);
  });
});
