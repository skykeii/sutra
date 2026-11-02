import { isIP } from "node:net";

const isLoopback = (address: string) => address === "::1" || address.startsWith("127.") || address.startsWith("::ffff:127.");

/**
 * The visitor's address for per-IP rate limits. `x-sutra-peer` is the socket address, set by
 * serve.mjs over anything the client sent. CF-Connecting-IP counts only from loopback, which is
 * where our own tunnel connects from, so nobody else can choose their own limit bucket.
 * With no peer header (Vercel, plain next start) the platform's X-Forwarded-For is used.
 */
export function clientIp(headers: Pick<Headers, "get">): string {
  const peer = headers.get("x-sutra-peer");
  if (peer) {
    const visitor = headers.get("cf-connecting-ip")?.trim();
    return isLoopback(peer) && visitor && isIP(visitor) ? visitor : peer;
  }
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}
