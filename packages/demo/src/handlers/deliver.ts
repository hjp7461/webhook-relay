import { NonRetriableError } from "@webhook-relay/core";
import { OUTGOING_HEADER_BLACKLIST } from "../constants.js";
import { signHmacSha256 } from "../domain/hmac.js";
import { classifyDeliveryFailure } from "./classify-error.js";

// demo/handlers/deliver.ts
//
// 외부로의 HTTP 송신 책임 모듈.
//
// - 내장 fetch + AbortController 타임아웃(AC6.1, I6.2).
// - 헤더 블랙리스트(Q-API-3 (a)) 적용. HMAC 헤더는 블랙리스트와 별개로 항상 부착.
// - SSRF 가드(Q-SEC-1 (b)): ALLOW_PRIVATE_TARGETS=false 면 private/localhost 거부.
// - 자동 redirect 비활성(Q-RETRY-1 (a) — 3xx 는 NonRetriable 로 분류).
// - HMAC 서명(M4): 송신 직전 raw body 에 대해 sha256 서명을 만들어
//   `hmacHeaderName` 헤더로 부착(PRD `06` §2). 시크릿은 큐 페이로드에 저장하지 않음.
// - 분류(M4): 비-2xx 또는 네트워크 에러 → classifyDeliveryFailure 로
//   RetriableError / NonRetriableError 매핑 후 throw(F2.2, I2.3).

export interface DeliverInput {
  readonly url: string;
  readonly payload: unknown;
  readonly headers?: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
  readonly allowPrivateTargets: boolean;
  /** HMAC-SHA256 시크릿(>= 32 bytes). 환경변수에서 워커가 직접 주입. */
  readonly hmacSecret: string;
  /** HMAC 서명 헤더 이름. 환경변수 WEBHOOK_HMAC_HEADER. */
  readonly hmacHeaderName: string;
}

export interface DeliverResult {
  readonly status: number;
  readonly durationMs: number;
}

/**
 * 외부 URL 로 JSON 페이로드를 POST 한다.
 *
 * 성공(2xx) 시 DeliverResult 반환. 비-2xx 또는 네트워크 에러 시
 * classifyDeliveryFailure 결과를 throw 한다(RetriableError 또는
 * NonRetriableError).
 */
export async function deliver(input: DeliverInput): Promise<DeliverResult> {
  if (!input.allowPrivateTargets && isPrivateUrl(input.url)) {
    throw new NonRetriableError(
      `Refusing to deliver to private/loopback target (ALLOW_PRIVATE_TARGETS=false)`,
    );
  }

  const sanitizedHeaders = sanitizeOutgoingHeaders(input.headers);
  const body = JSON.stringify(input.payload ?? {});
  // HMAC 서명 — raw body 에 대해 결정성(Q-SEC-2 (a)). 송신 직전 생성.
  const signature = signHmacSha256(input.hmacSecret, body);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  const start = Date.now();
  try {
    let res: Response;
    try {
      res = await fetch(input.url, {
        method: "POST",
        headers: {
          ...sanitizedHeaders,
          "content-type": "application/json",
          // HMAC 헤더는 블랙리스트와 별개로 항상 부착(서명 무결성 보장).
          [input.hmacHeaderName]: signature,
        },
        body,
        // 보수적: 자동 리다이렉트 금지(SSRF/체인 우려, Q-RETRY-1 (a)).
        redirect: "manual",
        signal: controller.signal,
      });
    } catch (cause) {
      // 네트워크 에러(타임아웃 AbortError / DNS / ECONNREFUSED 등).
      // classifyDeliveryFailure 가 RetriableError(보수적) 로 매핑.
      throw classifyDeliveryFailure({ cause });
    }
    const durationMs = Date.now() - start;
    if (res.status >= 200 && res.status < 300) {
      // 연결 누수를 피하기 위해 body drain.
      try {
        await res.arrayBuffer();
      } catch {
        // best-effort drain — 실패해도 송신 자체는 성공으로 간주.
      }
      return { status: res.status, durationMs };
    }
    // 비-2xx 응답 — 분류 함수로 매핑.
    // 응답 body 는 drain 후 폐기(다음 시도/로깅에 사용하지 않음 — 본 PRD 범위).
    try {
      await res.arrayBuffer();
    } catch {
      // best-effort drain.
    }
    throw classifyDeliveryFailure({ httpStatus: res.status });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 호출 측에서 전달한 헤더에서 블랙리스트 항목을 제거한다(대소문자 무시).
 * Q-API-3 (a) — 블랙리스트: Authorization/Cookie/Host/Content-Length/Transfer-Encoding.
 */
export function sanitizeOutgoingHeaders(
  headers: Readonly<Record<string, string>> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  const banned = new Set(OUTGOING_HEADER_BLACKLIST.map((h) => h.toLowerCase()));
  for (const [k, v] of Object.entries(headers)) {
    if (banned.has(k.toLowerCase())) continue;
    out[k] = v;
  }
  return out;
}

/**
 * URL 의 호스트명만 보고 보수적으로 사설/루프백/링크로컬을 식별한다.
 * 동적 DNS 조회는 본 단계 범위 외(deliver.ts 도입 시점에 PRD 보강 필요).
 */
export function isPrivateUrl(rawUrl: string): boolean {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return false;
  }
  const host = u.hostname.toLowerCase();
  if (host === "localhost") return true;
  // IPv6 ::1 / 링크로컬 fc00::/7 / fe80::/10.
  if (host === "[::1]" || host === "::1") return true;
  if (host.startsWith("[fc") || host.startsWith("[fd") || host.startsWith("[fe8")) return true;

  // IPv4 점-십진 표기.
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;
  const a = Number(ipv4[1]);
  const b = Number(ipv4[2]);
  // 127.0.0.0/8
  if (a === 127) return true;
  // 10.0.0.0/8
  if (a === 10) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 169.254.0.0/16 (link-local)
  if (a === 169 && b === 254) return true;
  return false;
}
