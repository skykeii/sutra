import { describe, expect, it } from "vitest";
import { clientIp } from "@/lib/client-ip";

const ip = (headers: Record<string, string>) => clientIp(new Headers(headers));

describe("the visitor's address behind the tunnel", () => {
  it("uses CF-Connecting-IP when the connection comes from loopback", () => {
    expect(ip({ "x-sutra-peer": "127.0.0.1", "cf-connecting-ip": "203.0.113.7" })).toBe("203.0.113.7");
    expect(ip({ "x-sutra-peer": "::1", "cf-connecting-ip": "2001:db8::1" })).toBe("2001:db8::1");
    expect(ip({ "x-sutra-peer": "::ffff:127.0.0.1", "cf-connecting-ip": "203.0.113.7" })).toBe("203.0.113.7");
  });
  it("keeps two tunnel visitors apart", () => {
    expect(ip({ "x-sutra-peer": "127.0.0.1", "cf-connecting-ip": "203.0.113.7" })).not.toBe(ip({ "x-sutra-peer": "127.0.0.1", "cf-connecting-ip": "203.0.113.8" }));
  });
  it("ignores a spoofed header from any other connection", () => {
    expect(ip({ "x-sutra-peer": "192.168.1.20", "cf-connecting-ip": "203.0.113.7" })).toBe("192.168.1.20");
    expect(ip({ "x-sutra-peer": "192.168.1.20", "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "8.8.8.8" })).toBe("192.168.1.20");
  });
  it("ignores X-Forwarded-For when the socket address is known", () => {
    expect(ip({ "x-sutra-peer": "127.0.0.1", "x-forwarded-for": "8.8.8.8" })).toBe("127.0.0.1");
  });
  it("ignores a CF-Connecting-IP that is not an address", () => {
    expect(ip({ "x-sutra-peer": "127.0.0.1", "cf-connecting-ip": "anything:else" })).toBe("127.0.0.1");
  });
  it("falls back to the platform's header with no socket address", () => {
    expect(ip({ "x-forwarded-for": "198.51.100.4, 10.0.0.1" })).toBe("198.51.100.4");
    expect(ip({})).toBe("local");
  });
});
