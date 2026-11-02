import { afterEach, describe, expect, it, vi } from "vitest";
import { isPrivateAddress, signWebhook, webhookSignatureValid, webhookUrlProblem } from "@/lib/webhook-guard";

afterEach(() => vi.unstubAllEnvs());

describe("private address ranges", () => {
  it.each([
    "127.0.0.1", "10.0.0.5", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "100.127.255.254", "0.0.0.0", "224.0.0.1",
    "::1", "::", "fe80::1", "fc00::1", "fd12::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:192.168.1.1", "64:ff9b::7f00:1", "2002:7f00:1::",
  ])("refuses %s", (address) => expect(isPrivateAddress(address)).toBe(true));

  it.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "100.128.0.1", "49.37.145.244", "2606:4700:4700::1111"])("allows %s", (address) => expect(isPrivateAddress(address)).toBe(false));

  it("refuses text that is not an address", () => expect(isPrivateAddress("example.com")).toBe(true));
});

describe("webhook addresses", () => {
  const publicHost = async () => ["93.184.216.34"];

  it("accepts a public https address", async () => expect(await webhookUrlProblem("https://example.com/x", publicHost)).toBeNull());

  it.each(["https://127.0.0.1/x", "https://192.168.1.1/x", "https://[::1]/x", "https://2130706433/x", "https://0x7f.1/x", "https://[::ffff:10.0.0.1]/x"])("refuses %s", async (url) => {
    expect(await webhookUrlProblem(url, publicHost)).toMatch(/private or internal/);
  });

  it("refuses a hostname that resolves to a private address, even if only one of several does", async () => {
    expect(await webhookUrlProblem("https://sneaky.example/x", async () => ["10.0.0.1"])).toMatch(/private or internal/);
    expect(await webhookUrlProblem("https://sneaky.example/x", async () => ["8.8.8.8", "192.168.0.1"])).toMatch(/private or internal/);
  });

  it("refuses plain http and non-web schemes", async () => {
    expect(await webhookUrlProblem("http://example.com/x", publicHost)).toMatch(/https/);
    expect(await webhookUrlProblem("file:///etc/passwd", publicHost)).toMatch(/https/);
  });

  it("explains a name that does not resolve", async () => {
    expect(await webhookUrlProblem("https://nope.example/x", async () => { throw new Error("ENOTFOUND"); })).toMatch(/could not find/);
  });

  it("allows http://localhost only with the development switch on", async () => {
    vi.stubEnv("ALLOW_PRIVATE_WEBHOOKS", "");
    expect(await webhookUrlProblem("http://localhost:3000/x", publicHost)).toMatch(/https/);
    vi.stubEnv("ALLOW_PRIVATE_WEBHOOKS", "true");
    expect(await webhookUrlProblem("http://localhost:3000/x", publicHost)).toBeNull();
    expect(await webhookUrlProblem("http://192.168.1.1/x", publicHost)).toMatch(/https/);
  });
});

describe("signatures", () => {
  const sig = signWebhook("secret", "body");
  it("accepts the right signature", () => expect(webhookSignatureValid("secret", "body", sig)).toBe(true));
  it("refuses a changed body, a wrong secret and junk", () => {
    expect(webhookSignatureValid("secret", "body2", sig)).toBe(false);
    expect(webhookSignatureValid("other", "body", sig)).toBe(false);
    expect(webhookSignatureValid("secret", "body", "x")).toBe(false);
  });
});
