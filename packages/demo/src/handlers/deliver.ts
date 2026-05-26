import { lookup as dnsLookup } from "node:dns/promises";
import { NonRetriableError } from "@webhook-relay/core";
import { OUTGOING_HEADER_BLACKLIST } from "../constants.js";
import { signHmacSha256 } from "../domain/hmac.js";
import { classifyDeliveryFailure } from "./classify-error.js";

// DNS 조회 자체의 짧은 timeout. 2초 안에 결과가 안 오면 보수적으로 거부.
const DNS_LOOKUP_TIMEOUT_MS = 2_000;

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
  if (!input.allowPrivateTargets) {
    // 1차 가드: hostname 문자열만으로 빠른 거부(localhost / 점-십진 사설 / IPv6).
    if (isPrivateUrl(input.url)) {
      throw new NonRetriableError(
        `Refusing to deliver to private/loopback target (ALLOW_PRIVATE_TARGETS=false)`,
      );
    }
    // 2차 가드: DNS 조회 결과 IP 가 사설 CIDR 에 속하면 거부. 동적 DNS 우회
    // (`evil.example.com` → `10.0.0.1`) 차단. DNS 조회 자체가 시간을 소모하므로
    // 짧은 timeout(보수적으로 거부) 적용.
    const hostname = extractHostname(input.url);
    if (hostname !== undefined) {
      const addrs = await resolveHostAddresses(hostname);
      if (addrs === "timeout") {
        throw new NonRetriableError(
          `Refusing to deliver: DNS lookup timed out (>${DNS_LOOKUP_TIMEOUT_MS}ms)`,
        );
      }
      for (const ip of addrs) {
        if (isPrivateIp(ip)) {
          throw new NonRetriableError(
            `Refusing to deliver to private/loopback target (DNS resolved ${hostname} to private IP)`,
          );
        }
      }
    }
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
 * URL 에서 hostname 만 추출. brackets 가 둘러싼 IPv6 ([::1]) 도 그대로 반환한다
 * (`URL.hostname` 가 brackets 를 보존하므로 호출 측이 그대로 사용 가능).
 */
function extractHostname(rawUrl: string): string | undefined {
  try {
    return new URL(rawUrl).hostname;
  } catch {
    return undefined;
  }
}

/**
 * hostname 의 모든 A/AAAA 레코드를 짧은 timeout 안에 조회.
 *
 * 반환:
 * - string[] — 조회된 IP 주소 목록(빈 배열 가능).
 * - "timeout" — DNS 조회가 DNS_LOOKUP_TIMEOUT_MS 안에 응답하지 않음.
 *
 * IP 리터럴(`127.0.0.1`, `[::1]`)이 직접 들어와도 dns.lookup 은 그대로 반환한다.
 * brackets 가 있는 IPv6 hostname 은 brackets 를 벗겨 lookup 에 전달.
 */
async function resolveHostAddresses(hostname: string): Promise<string[] | "timeout"> {
  const stripped =
    hostname.startsWith("[") && hostname.endsWith("]")
      ? hostname.slice(1, -1)
      : hostname;
  const lookup = dnsLookup(stripped, { all: true }).then((entries) =>
    entries.map((e) => e.address),
  );
  const timeout = new Promise<"timeout">((resolve) =>
    setTimeout(() => resolve("timeout"), DNS_LOOKUP_TIMEOUT_MS),
  );
  try {
    const result = await Promise.race([lookup, timeout]);
    return result;
  } catch {
    // 조회 자체가 실패(ENOTFOUND 등). 보수적으로 빈 결과 → 외부 IP 로 간주,
    // 이후 fetch 단계에서 자연스럽게 실패한다. 본 함수의 목적은 사설 IP 의
    // 명시적 차단이지 "조회 실패 시 차단"이 아니다.
    return [];
  }
}

/**
 * URL 의 호스트명만 보고 보수적으로 사설/루프백/링크로컬을 식별한다.
 * 동적 DNS 우회 차단은 별도로 `resolveHostAddresses` + `isPrivateIp` 가 담당한다.
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
  // 0.0.0.0/8 (unspecified / "this network")
  if (a === 0) return true;
  return false;
}

/**
 * IP 문자열이 사설/루프백/링크로컬/unspecified 범위인지 판정. 순수 함수
 * (DNS/네트워크 없음) — 단위 테스트 용이성을 위해 export.
 *
 * 다루는 CIDR:
 * - IPv4: 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16,
 *         169.254.0.0/16, 0.0.0.0/8
 * - IPv6: ::1 (loopback), ::  (unspecified), fc00::/7 (unique local),
 *         fe80::/10 (link-local), ::ffff:0:0/96 mapped IPv4 (재귀 검사)
 *
 * IPv6 zone id(`fe80::1%eth0`)는 zone 부분을 제거 후 판정.
 */
export function isPrivateIp(ip: string): boolean {
  if (typeof ip !== "string" || ip.length === 0) return false;
  // IPv6 zone id 제거.
  const noZone = ip.includes("%") ? (ip.split("%")[0] ?? "") : ip;
  const lowered = noZone.toLowerCase();

  // IPv4 점-십진.
  const ipv4 = lowered.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (![a, b, Number(ipv4[3]), Number(ipv4[4])].every((n) => n >= 0 && n <= 255)) {
      return false; // 잘못된 옥텟 — 정상 IPv4 가 아님.
    }
    // 127.0.0.0/8 / 10.0.0.0/8 / 172.16.0.0/12 / 192.168.0.0/16 /
    // 169.254.0.0/16 / 0.0.0.0/8
    if (a === 127) return true;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 0) return true;
    return false;
  }

  // IPv6.
  if (lowered.includes(":")) {
    // unspecified `::` / loopback `::1`
    if (lowered === "::" || lowered === "::1") return true;
    // IPv4-mapped IPv6 (`::ffff:10.0.0.1`) — 매핑된 IPv4 부분으로 재귀 판정.
    const mapped = lowered.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (mapped && mapped[1]) {
      return isPrivateIp(mapped[1]);
    }
    // fc00::/7 — unique local (fc00..fdff)
    if (/^f[cd][0-9a-f]{2}:/.test(lowered)) return true;
    // fe80::/10 — link-local (fe80..febf, 첫 10 비트). 보수적으로 fe80..feff 차단.
    if (/^fe[89ab][0-9a-f]:/.test(lowered)) return true;
    return false;
  }

  return false;
}
