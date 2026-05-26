import { describe, expect, it } from "vitest";

// UT-7 — SSRF DNS-aware 가드의 순수 함수 `isPrivateIp`.
//
// 본 테스트는 PRD `06` §3 의 SSRF 방어를 보강하는 동적 DNS 우회 차단 로직의
// 핵심 판정 함수를 단언한다. DNS 조회 자체는 통합 테스트의 결정성을 해치므로
// 본 단위 테스트는 IP 문자열만 검사한다.
//
// 다루는 CIDR (`packages/demo/src/handlers/deliver.ts::isPrivateIp`):
//   IPv4: 127/8, 10/8, 172.16/12, 192.168/16, 169.254/16, 0/8
//   IPv6: ::, ::1, fc00::/7, fe80::/10, ::ffff:<IPv4-mapped>

import { isPrivateIp } from "../src/handlers/deliver.js";

describe("UT-7 isPrivateIp (DNS-aware SSRF guard)", () => {
  describe("IPv4 loopback (127.0.0.0/8)", () => {
    it("flags 127.0.0.1", () => {
      expect(isPrivateIp("127.0.0.1")).toBe(true);
    });
    it("flags 127.255.255.255", () => {
      expect(isPrivateIp("127.255.255.255")).toBe(true);
    });
    it("flags 127.1.2.3 (whole /8)", () => {
      expect(isPrivateIp("127.1.2.3")).toBe(true);
    });
  });

  describe("IPv4 private RFC1918", () => {
    it("flags 10.0.0.0/8", () => {
      expect(isPrivateIp("10.0.0.1")).toBe(true);
      expect(isPrivateIp("10.255.255.255")).toBe(true);
    });
    it("flags 172.16.0.0/12 (16..31 second octet)", () => {
      expect(isPrivateIp("172.16.0.1")).toBe(true);
      expect(isPrivateIp("172.20.0.1")).toBe(true);
      expect(isPrivateIp("172.31.255.255")).toBe(true);
    });
    it("does NOT flag 172.32.0.1 (outside /12)", () => {
      expect(isPrivateIp("172.32.0.1")).toBe(false);
    });
    it("does NOT flag 172.15.0.1 (outside /12)", () => {
      expect(isPrivateIp("172.15.0.1")).toBe(false);
    });
    it("flags 192.168.0.0/16", () => {
      expect(isPrivateIp("192.168.0.1")).toBe(true);
      expect(isPrivateIp("192.168.255.255")).toBe(true);
    });
  });

  describe("IPv4 link-local / unspecified", () => {
    it("flags 169.254.0.0/16", () => {
      expect(isPrivateIp("169.254.169.254")).toBe(true);
      expect(isPrivateIp("169.254.0.1")).toBe(true);
    });
    it("flags 0.0.0.0/8 (unspecified)", () => {
      expect(isPrivateIp("0.0.0.0")).toBe(true);
      expect(isPrivateIp("0.1.2.3")).toBe(true);
    });
  });

  describe("IPv4 public addresses", () => {
    it("does NOT flag 8.8.8.8 (public DNS)", () => {
      expect(isPrivateIp("8.8.8.8")).toBe(false);
    });
    it("does NOT flag 1.1.1.1 (public DNS)", () => {
      expect(isPrivateIp("1.1.1.1")).toBe(false);
    });
    it("does NOT flag 142.250.0.1 (google)", () => {
      expect(isPrivateIp("142.250.0.1")).toBe(false);
    });
  });

  describe("IPv6 loopback / unspecified", () => {
    it("flags ::1 (loopback)", () => {
      expect(isPrivateIp("::1")).toBe(true);
    });
    it("flags :: (unspecified)", () => {
      expect(isPrivateIp("::")).toBe(true);
    });
  });

  describe("IPv6 unique local (fc00::/7) and link-local (fe80::/10)", () => {
    it("flags fc00::1", () => {
      expect(isPrivateIp("fc00::1")).toBe(true);
    });
    it("flags fd00::1", () => {
      expect(isPrivateIp("fd00::1")).toBe(true);
    });
    it("flags fe80::1", () => {
      expect(isPrivateIp("fe80::1")).toBe(true);
    });
    it("flags fe80::1 with zone id", () => {
      expect(isPrivateIp("fe80::1%eth0")).toBe(true);
    });
  });

  describe("IPv6 public addresses", () => {
    it("does NOT flag 2001:db8::1 (documentation but routable form)", () => {
      // 엄밀히 2001:db8::/32 는 문서화 전용이지만 본 함수의 차단 표는 사설/루프백/
      // 링크로컬에 한정. 공개 IPv6 와 동일한 카테고리로 본다.
      expect(isPrivateIp("2001:db8::1")).toBe(false);
    });
    it("does NOT flag 2606:4700:4700::1111 (cloudflare)", () => {
      expect(isPrivateIp("2606:4700:4700::1111")).toBe(false);
    });
  });

  describe("IPv4-mapped IPv6 (::ffff:a.b.c.d)", () => {
    it("flags ::ffff:127.0.0.1", () => {
      expect(isPrivateIp("::ffff:127.0.0.1")).toBe(true);
    });
    it("flags ::ffff:10.0.0.1", () => {
      expect(isPrivateIp("::ffff:10.0.0.1")).toBe(true);
    });
    it("does NOT flag ::ffff:8.8.8.8", () => {
      expect(isPrivateIp("::ffff:8.8.8.8")).toBe(false);
    });
  });

  describe("invalid / edge inputs", () => {
    it("returns false for empty string", () => {
      expect(isPrivateIp("")).toBe(false);
    });
    it("returns false for non-IP garbage", () => {
      expect(isPrivateIp("not-an-ip")).toBe(false);
      expect(isPrivateIp("999.999.999.999")).toBe(false);
    });
  });
});
