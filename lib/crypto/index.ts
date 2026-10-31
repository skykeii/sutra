import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  sign as edSign,
  verify as edVerify,
} from "node:crypto";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} missing in .env.local. Run: npm run keys`);
  return value;
}

function hexKey(name: string): Buffer {
  const key = Buffer.from(requireEnv(name), "hex");
  if (key.length !== 32) throw new Error(`${name} must be 32 bytes of hex`);
  return key;
}

// Must stay byte-identical to public.canonical_json() in Postgres.
export function canonicalJSON(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const body = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJSON(obj[k])}`)
    .join(",");
  return `{${body}}`;
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

// Keyed on purpose: plain SHA-256 of a 12-digit ID can be brute-forced in minutes.
export function hmacMatch(value: string): string {
  return createHmac("sha256", hexKey("HMAC_MATCH_KEY")).update(value.trim(), "utf8").digest("hex");
}

export function encryptField(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", hexKey("FIELD_ENC_KEY"), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString("base64")).join(":");
}

export function decryptField(stored: string): string {
  const [iv, tag, body] = stored.split(":").map((p) => Buffer.from(p, "base64"));
  if (!iv || !tag || !body) throw new Error("Malformed encrypted field");
  const decipher = createDecipheriv("aes-256-gcm", hexKey("FIELD_ENC_KEY"), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}

export function signPayload(payload: unknown): string {
  const key = createPrivateKey(requireEnv("ED25519_PRIVATE_KEY_PEM"));
  return edSign(null, Buffer.from(canonicalJSON(payload), "utf8"), key).toString("base64");
}

export function verifyPayload(payload: unknown, signature: string, publicKeyPem?: string): boolean {
  try {
    const key = createPublicKey(publicKeyPem ?? requireEnv("ED25519_PUBLIC_KEY_PEM"));
    return edVerify(null, Buffer.from(canonicalJSON(payload), "utf8"), key, Buffer.from(signature, "base64"));
  } catch {
    return false;
  }
}
