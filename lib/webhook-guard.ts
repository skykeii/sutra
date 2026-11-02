import { createHmac, timingSafeEqual } from "node:crypto";
import { lookup as dnsLookup } from "node:dns";
import { lookup as resolveAll } from "node:dns/promises";
import { BlockList, isIP, type LookupFunction } from "node:net";

const BLOCKED = new BlockList();
for (const [network, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24],
  ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) BLOCKED.addSubnet(network, bits, "ipv4");
// Includes the forms that embed an IPv4 address (::/96, NAT64, 6to4). BlockList checks ::ffff:a.b.c.d against the IPv4 rules itself.
for (const [network, bits] of [
  ["::", 96], ["64:ff9b::", 96], ["100::", 64], ["2001:db8::", 32], ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
] as const) BLOCKED.addSubnet(network, bits, "ipv6");

/** True for anything that is not a plain public address, including text that is not an address at all. */
export function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  return !family || BLOCKED.check(address, family === 4 ? "ipv4" : "ipv6");
}

// Only for local development, where the built-in sink is on this machine.
function isAllowedLocalDev(url: URL): boolean {
  return process.env.ALLOW_PRIVATE_WEBHOOKS === "true" && url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

type Resolver = (hostname: string) => Promise<string[]>;
const resolveHost: Resolver = async (hostname) => (await resolveAll(hostname, { all: true })).map((a) => a.address);

/** Returns a plain-language reason the address cannot be used, or null if it is fine. */
export async function webhookUrlProblem(raw: string, resolve: Resolver = resolveHost): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "That is not a valid web address.";
  }
  if (isAllowedLocalDev(url)) return null;
  if (url.protocol !== "https:") return "Webhook addresses must start with https.";
  const host = url.hostname.replace(/^\[|\]$/g, "");
  let addresses: string[];
  try {
    addresses = isIP(host) ? [host] : await resolve(host);
  } catch {
    return "We could not find that web address.";
  }
  if (!addresses.length || addresses.some(isPrivateAddress)) return "Webhook addresses cannot point at private or internal networks.";
  return null;
}

/** Runs as the connection opens, so a hostname cannot pass the check and then re-resolve to a private address. */
export const publicOnlyLookup = ((hostname: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) => {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error);
    if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) return callback(new Error("private address refused"));
    if (options.all) return callback(null, addresses);
    return callback(null, addresses[0]!.address, addresses[0]!.family);
  });
}) as unknown as LookupFunction;

export const signWebhook = (secret: string, body: string) => createHmac("sha256", secret).update(body).digest("hex");

export function webhookSignatureValid(secret: string, body: string, signature: string): boolean {
  const expected = Buffer.from(signWebhook(secret, body));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
