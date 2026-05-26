import { describe, expect, it } from "vitest";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// IT-R1-domain-boundary
//
// `packages/core/src/**` 안에 도메인 식별자가 등장하지 않는지 검증하는 회귀
// 가드(CLAUDE.md §3, PRD `prd-phase3/01` §6, PRD `prd-phase3/02` §8).
//
// 'core' 패키지는 도메인(웹훅)에 의존하지 않아야 한다.
//
// M-OBS-1 (Q-OBS-14 (a)) 보강:
//   - `webhook_relay_` 접두 토큰은 **애플리케이션 식별자**이므로 예외 처리.
//   - 도메인 식별자는 단어 토큰 + PascalCase 분리 후 case-insensitive 비교.
//
// 알고리즘:
//   for each .ts file in packages/core/src/**:
//     for each line:
//       tokens = `\b[A-Za-z_][A-Za-z0-9_]*\b` 추출
//       for each token:
//         token.startsWith("webhook_relay_") → 통과(예외)
//         else: token 을 PascalCase 분리 후 각 sub-word 를 case-insensitive 로
//               BANNED_TOKENS_SET 과 비교 → hit 면 실패
//
// 본 PLAN(M-OBS-1) 실행 시점 기준 core/src/{shutdown,errors,worker}.ts 에
// `httpServer`·`httpStatus` 식별자와 주석 안의 bare `http`/`HTTP` 가 이미
// 존재한다. PRD `prd-phase3/01` §6.1 의 도메인 식별자 정의에는 `http` 가
// 포함되지만, 본 시점에 `http` 를 banned 로 추가하면 기존 코드(architecture.md
// §2 표 및 §F 다이어그램에서 명시적으로 사용된 `httpServer`/`httpStatus`)를
// 깨뜨린다. CLAUDE.md §7-5 ("이 문서를 위반하는 기존 코드를 발견하면 조용히
// 고치지 말고 먼저 보고한다")에 따라 본 PLAN 범위에서는 `http` 를 banned 에서
// 제외하고, 후속 별도 PR(C-MET-2 후속)로 사람 결정에 위임한다.

const BANNED_TOKENS_SET: ReadonlySet<string> = new Set(
  ["webhook", "delivery", "fastify", "receiver", "Payload", "_demo"].map((t) =>
    t.toLowerCase(),
  ),
);

// 단어 토큰 추출 정규식. JavaScript 식별자 형식(영문/숫자/언더스코어).
const TOKEN_REGEX = /\b[A-Za-z_][A-Za-z0-9_]*\b/g;

/**
 * PascalCase / camelCase 토큰을 부분 단어 배열로 분리한다.
 *
 * 예:
 *   "WebhookDelivery" → ["Webhook", "Delivery"]
 *   "processWebhook"  → ["process", "Webhook"]
 *   "httpStatus"      → ["http", "Status"]
 *   "httpsAgent"      → ["https", "Agent"]
 *   "_demo"           → ["_demo"]               (underscore prefix 보존)
 *   "queue_depth"     → ["queue", "depth"]
 */
function splitCamelCase(token: string): string[] {
  // 언더스코어 prefix("_demo" 같은) 보존.
  const underscorePrefix = token.match(/^(_+)/);
  if (underscorePrefix !== null) {
    const prefix = underscorePrefix[1];
    const rest = token.slice(prefix.length);
    if (rest.length === 0) return [token];
    const firstWordMatch = rest.match(/^([A-Za-z0-9]+)/);
    if (firstWordMatch !== null) {
      const firstWord = firstWordMatch[1];
      const remainder = rest.slice(firstWord.length);
      const head = prefix + firstWord;
      const tailParts =
        remainder.length > 0 ? splitCamelCase(remainder.replace(/^_+/, "")) : [];
      return [head, ...tailParts];
    }
  }
  // 일반 camelCase / PascalCase 분리 + 언더스코어 분리.
  const parts: string[] = [];
  for (const seg of token.split("_")) {
    if (seg.length === 0) continue;
    for (const sub of seg.split(/(?=[A-Z])/)) {
      if (sub.length > 0) parts.push(sub);
    }
  }
  return parts;
}

interface Violation {
  readonly file: string;
  readonly line: number;
  readonly snippet: string;
  readonly matchedSubword: string;
  readonly originalToken: string;
}

function scanLine(file: string, lineNumber: number, line: string): Violation[] {
  const violations: Violation[] = [];
  const matches = line.matchAll(TOKEN_REGEX);
  for (const m of matches) {
    const token = m[0];
    // Q-OBS-14 (a): `webhook_relay_` 접두 토큰은 애플리케이션 식별자(예외).
    if (token.startsWith("webhook_relay_")) continue;

    // PascalCase / underscore 분리 후 각 sub-word 검사.
    const subwords = splitCamelCase(token);
    for (const sub of subwords) {
      const lower = sub.toLowerCase();
      if (BANNED_TOKENS_SET.has(lower)) {
        violations.push({
          file,
          line: lineNumber,
          snippet: line.trim(),
          matchedSubword: sub,
          originalToken: token,
        });
      }
    }
  }
  return violations;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const CORE_SRC = resolve(HERE, "..", "src");

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

describe("IT-R1 domain boundary", () => {
  it("packages/core/src/** does not contain domain tokens", async () => {
    // 사전 조건: core/src 디렉터리는 존재한다.
    const dirStat = await stat(CORE_SRC);
    expect(dirStat.isDirectory()).toBe(true);

    const offenders: Violation[] = [];

    for await (const file of walkTsFiles(CORE_SRC)) {
      const content = await readFile(file, "utf8");
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? "";
        offenders.push(...scanLine(file, i + 1, line));
      }
    }

    if (offenders.length > 0) {
      const message = offenders
        .map(
          (o) =>
            `- [${o.matchedSubword}<-${o.originalToken}] ${o.file}\n  L${o.line}: ${o.snippet}`,
        )
        .join("\n");
      throw new Error(
        `IT-R1 violation: domain tokens leaked into packages/core/src.\n${message}`,
      );
    }

    expect(offenders).toEqual([]);
  });

  // M-OBS-1 (Q-OBS-14 (a)) 보강 룰의 단위 거동을 가짜 데이터로 단언한다.
  it("grep rule honors the webhook_relay_ exception and PascalCase split", () => {
    // 통과 1: `webhook_relay_` 접두 토큰은 예외(애플리케이션 식별자).
    expect(scanLine("<inline>", 1, "webhook_relay_queue_depth")).toEqual([]);

    // 통과 2: `httpsAgent` — "https"·"Agent" 모두 banned 가 아니다.
    expect(scanLine("<inline>", 1, "const a = httpsAgent;")).toEqual([]);

    // 실패 1: `processWebhook` → "process"+"Webhook" → "Webhook" 검출.
    {
      const v = scanLine("<inline>", 1, "function processWebhook() {}");
      expect(v.length).toBeGreaterThan(0);
      expect(v.some((x) => x.matchedSubword.toLowerCase() === "webhook")).toBe(true);
    }

    // 실패 2: 주석 안 `WebhookDelivery` → "Webhook"+"Delivery" 각각 검출.
    {
      const v = scanLine("<inline>", 1, "// WebhookDelivery: TODO");
      const matchedLower = v.map((x) => x.matchedSubword.toLowerCase());
      expect(matchedLower).toContain("webhook");
      expect(matchedLower).toContain("delivery");
    }

    // 통과 3 (deviation 문서화): `httpStatus`/`httpServer` 는 본 PLAN 범위에서
    // 의도적으로 통과시킨다(상단 주석 + 보고서 참조). PRD §6.1 의 `http` 도메인
    // 식별자 정의는 후속 별도 PR 에서 적용 검토.
    expect(scanLine("<inline>", 1, "let httpStatus = 200;")).toEqual([]);
    expect(scanLine("<inline>", 1, "interface X { httpServer: unknown }")).toEqual(
      [],
    );
  });
});
