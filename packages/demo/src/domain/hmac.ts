import { createHmac } from "node:crypto";

// demo/domain/hmac.ts
//
// 웹훅 페이로드 HMAC-SHA256 서명 생성(PRD `06` §2).
//
// 결정 잠금:
// - Q-SEC-2 (a) — timestamp/nonce 미적용. 같은 (시크릿, 본문) → 같은 서명.
//   재시도 결정성 보존(IT-S3 fake timer 단언 정합).
// - Q-SEC-3 (a) — 시크릿 32 bytes 최소. (config Zod 에서 1차 강제, 본 함수도
//   방어적으로 거부.)
//
// 알고리즘: HMAC-SHA256. 결과 형식: `sha256=<hex>`. (PRD `06` §2.2.)
// 시크릿은 큐 페이로드에 저장하지 않는다 — 워커가 송신 직전 env 에서 읽어 서명.

const MIN_SECRET_BYTES = 32;
const HMAC_PREFIX = "sha256=";

/**
 * 본문에 대해 HMAC-SHA256 서명을 생성하고 `sha256=<hex>` 형식으로 반환한다.
 *
 * - 같은 (secret, body) → 같은 출력(UT-6 결정성).
 * - secret 의 utf8 바이트 길이가 32 미만이면 throw.
 *
 * @throws TypeError secret 누락/짧음.
 */
export function signHmacSha256(secret: string, body: Buffer | string): string {
  if (typeof secret !== "string" || secret.length === 0) {
    throw new TypeError("signHmacSha256: secret is required");
  }
  if (Buffer.byteLength(secret, "utf8") < MIN_SECRET_BYTES) {
    throw new TypeError(
      `signHmacSha256: secret must be at least ${MIN_SECRET_BYTES} bytes`,
    );
  }
  const h = createHmac("sha256", secret);
  h.update(body);
  return `${HMAC_PREFIX}${h.digest("hex")}`;
}
