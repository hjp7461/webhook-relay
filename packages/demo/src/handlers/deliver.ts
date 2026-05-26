import { NonRetriableError } from "@webhook-relay/core";
import { OUTGOING_HEADER_BLACKLIST } from "../constants.js";

// demo/handlers/deliver.ts
//
// 외부로의 HTTP 송신 책임 모듈.
//
// - 내장 fetch + AbortController 타임아웃(AC6.1, I6.2).
// - 헤더 블랙리스트(Q-API-3 (a)) 적용.
// - SSRF 가드(Q-SEC-1 (b)): ALLOW_PRIVATE_TARGETS=false 면 private/localhost 거부.
// - 자동 redirect 비활성(보수적; Q-RETRY-1 (a)).
// - HMAC 서명은 본 M2 에서 적용하지 않는다(N1.3 — M4 의 책임).
// - 본 M2 에서는 응답 분류 함수가 없으므로 모든 비-2xx 를 일단 Error 로 throw.

export interface DeliverInput {
  readonly url: string;
  readonly payload: unknown;
  readonly headers?: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
  readonly allowPrivateTargets: boolean;
}

export interface DeliverResult {
  readonly status: number;
  readonly durationMs: number;
}

/**
 * 외부 URL 로 JSON 페이로드를 POST 한다. 비-2xx 면 throw.
 *
 * SSRF 차단은 호스트명 기반의 보수적 검사만 수행한다(localhost / 사설 IPv4 /
 * 링크로컬 / IPv6 ::1 / fc00::/7). DNS 조회를 통한 동적 IP 해석은 본 단계
 * 범위 외이며 보강은 후속 PRD 결정에 따른다.
 */
export async function deliver(input: DeliverInput): Promise<DeliverResult> {
  if (!input.allowPrivateTargets && isPrivateUrl(input.url)) {
    throw new NonRetriableError(
      `Refusing to deliver to private/loopback target (ALLOW_PRIVATE_TARGETS=false)`,
    );
  }

  const sanitizedHeaders = sanitizeOutgoingHeaders(input.headers);
  const body = JSON.stringify(input.payload ?? {});

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  const start = Date.now();
  try {
    const res = await fetch(input.url, {
      method: "POST",
      headers: {
        ...sanitizedHeaders,
        "content-type": "application/json",
      },
      body,
      // 보수적: 자동 리다이렉트 금지(SSRF/체인 우려). 분류는 M4 에서.
      redirect: "manual",
      signal: controller.signal,
    });
    const durationMs = Date.now() - start;
    if (res.status >= 200 && res.status < 300) {
      // 응답 body 는 본 단계에서 소비하지 않는다(데모 수신자는 200 OK + 빈 본문이면 충분).
      // 단, 연결 누수를 피하기 위해 body 를 drain.
      try {
        await res.arrayBuffer();
      } catch {
        // best-effort drain — 실패해도 송신 자체는 성공으로 간주.
      }
      return { status: res.status, durationMs };
    }
    // M2: 응답 분류 함수가 없어 모든 비-2xx 는 일반 Error 로 throw.
    throw new Error(`Outgoing request failed with status ${res.status}`);
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
