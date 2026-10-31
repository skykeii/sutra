import { generateKeyPairSync, randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { canonicalJSON, decryptField, encryptField, hmacMatch, sha256Hex, signPayload, verifyPayload } from "@/lib/crypto";
import { issueCredential, verifyCredential } from "@/lib/credentials/vc";

beforeAll(() => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  process.env.ED25519_PRIVATE_KEY_PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  process.env.ED25519_PUBLIC_KEY_PEM = publicKey.export({ type: "spki", format: "pem" }).toString();
  process.env.HMAC_MATCH_KEY = randomBytes(32).toString("hex");
  process.env.FIELD_ENC_KEY = randomBytes(32).toString("hex");
});

describe("canonicalJSON", () => {
  it("sorts keys recursively, keeps array order, removes whitespace", () => {
    expect(canonicalJSON({ b: 1, a: { d: [2, 1], c: null } })).toBe('{"a":{"c":null,"d":[2,1]},"b":1}');
  });
  it("is independent of insertion order", () => {
    expect(canonicalJSON({ x: 1, y: 2 })).toBe(canonicalJSON({ y: 2, x: 1 }));
  });
});

describe("hmacMatch", () => {
  it("is deterministic for the same key and ignores surrounding space", () => {
    expect(hmacMatch("123456789012")).toBe(hmacMatch(" 123456789012 "));
  });
  it("differs from an unkeyed hash and across values", () => {
    expect(hmacMatch("123456789012")).not.toBe(sha256Hex("123456789012"));
    expect(hmacMatch("123456789012")).not.toBe(hmacMatch("123456789013"));
  });
  it("changes when the key changes", () => {
    const original = process.env.HMAC_MATCH_KEY;
    const before = hmacMatch("123456789012");
    process.env.HMAC_MATCH_KEY = randomBytes(32).toString("hex");
    expect(hmacMatch("123456789012")).not.toBe(before);
    process.env.HMAC_MATCH_KEY = original;
  });
});

describe("field encryption", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const a = encryptField("9876543210");
    expect(decryptField(a)).toBe("9876543210");
    expect(a).not.toBe(encryptField("9876543210"));
    expect(a.split(":")).toHaveLength(3);
  });
  it("rejects altered ciphertext", () => {
    const [iv, tag, body] = encryptField("9876543210").split(":");
    const flipped = Buffer.from(body!, "base64");
    flipped[0]! ^= 0xff;
    expect(() => decryptField([iv, tag, flipped.toString("base64")].join(":"))).toThrow();
  });
});

describe("signatures", () => {
  it("verifies regardless of key order and rejects changes", () => {
    const sig = signPayload({ a: 1, b: 2 });
    expect(verifyPayload({ b: 2, a: 1 }, sig)).toBe(true);
    expect(verifyPayload({ a: 1, b: 3 }, sig)).toBe(false);
    expect(verifyPayload({ a: 1, b: 2 }, "not-a-signature")).toBe(false);
  });
  it("detects a forged credential using only the public key", () => {
    const vc = issueCredential({
      recordId: "SUTRA-TEST",
      apaarId: "123456789012",
      apaarHash: "ab".repeat(32),
      institution: "Test Institute",
      program: "B.Tech CSE",
      admissionYear: 2024,
      expectedCompletion: 2028,
      status: "Active",
      issuedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2028-07-31T00:00:00.000Z",
      baseUrl: "http://localhost:3000",
    });
    const publicKey = process.env.ED25519_PUBLIC_KEY_PEM;
    expect(verifyCredential(vc, publicKey)).toBe(true);
    const forged = structuredClone(vc);
    forged.credentialSubject.program = "MBBS";
    expect(verifyCredential(forged, publicKey)).toBe(false);
    expect(JSON.stringify(vc)).not.toContain("123456789012");
  });
});
