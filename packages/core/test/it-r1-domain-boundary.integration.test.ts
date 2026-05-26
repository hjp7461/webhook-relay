import { describe, expect, it } from "vitest";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// IT-R1-domain-boundary
//
// `packages/core/src/**` 안에 도메인 식별자가 등장하지 않는지 검증하는 회귀
// 가드(PRD `03` §3, PLAN `02` §3 / §4-8 참조).
//
// 'core' 패키지는 도메인(웹훅)에 의존하지 않아야 한다(CLAUDE.md §3).
// 따라서 아래 토큰이 core/src 안에 들어오면 즉시 실패시킨다.
// 토큰 목록은 보수적으로 선정한다 — 'http' 나 'URL' 같이 표준 라이브러리에
// 정당하게 등장하는 토큰은 의도적으로 제외한다(오탐 방지).
const BANNED_TOKENS = ["webhook", "fastify", "_demo"] as const;

// 단어 경계(`\b`) + 대소문자 무시. 토큰이 식별자의 일부로 자연스럽게
// 포함된 경우(예: 변수명 webhookUrl, 클래스 WebhookDeliveryError)도 잡는다.
// `\b` 는 영문자/숫자/언더스코어 경계에서 매칭되므로, '_demo' 처럼 언더스코어
// 로 시작하는 토큰은 left boundary 가 실패할 수 있어 별도 처리한다.
function makePattern(token: string): RegExp {
  if (token.startsWith("_")) {
    // 언더스코어 prefix 토큰은 왼쪽을 단어경계 대신 'non-word + 시작' 으로 매칭
    return new RegExp(`(^|[^A-Za-z0-9_])${token}\\b`, "i");
  }
  return new RegExp(`\\b${token}\\b`, "i");
}

const PATTERNS: ReadonlyArray<{ token: string; regex: RegExp }> = BANNED_TOKENS.map(
  (token) => ({ token, regex: makePattern(token) }),
);

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

    const offenders: Array<{ file: string; token: string; snippet: string }> = [];

    for await (const file of walkTsFiles(CORE_SRC)) {
      const content = await readFile(file, "utf8");
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? "";
        for (const { token, regex } of PATTERNS) {
          if (regex.test(line)) {
            offenders.push({
              file,
              token,
              snippet: `L${i + 1}: ${line.trim()}`,
            });
          }
        }
      }
    }

    if (offenders.length > 0) {
      const message = offenders
        .map((o) => `- [${o.token}] ${o.file}\n  ${o.snippet}`)
        .join("\n");
      throw new Error(
        `IT-R1 violation: domain tokens leaked into packages/core/src.\n${message}`,
      );
    }

    expect(offenders).toEqual([]);
  });
});
