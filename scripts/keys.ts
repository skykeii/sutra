import { generateKeyPairSync, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { ENV_PATH, FriendlyError, runScript } from "./lib/run";

function quotePem(pem: string): string {
  return `"${pem.trim().replace(/\r?\n/g, "\\n")}"`;
}

async function main() {
  if (!existsSync(ENV_PATH)) {
    throw new FriendlyError(
      existsSync(`${ENV_PATH}.txt`)
        ? ".env.local not found, but .env.local.txt exists. Rename it to .env.local (Windows hides the .txt ending)."
        : ".env.local not found. Copy .env.example to .env.local and fill in your Supabase values.",
    );
  }
  const lines = readFileSync(ENV_PATH, "utf8").split(/\r?\n/);
  const has = (key: string) => lines.some((l) => l.startsWith(`${key}=`) && l.slice(key.length + 1).trim() !== "");
  const set = (key: string, value: string) => {
    const i = lines.findIndex((l) => l.startsWith(`${key}=`));
    if (i >= 0) lines[i] = `${key}=${value}`;
    else lines.push(`${key}=${value}`);
  };
  const added: string[] = [];
  const addIfMissing = (key: string, value: () => string) => {
    if (!has(key)) {
      set(key, value());
      added.push(key);
    }
  };

  // The Supabase dashboard often offers the REST URL; the client needs the bare project URL.
  const urlLine = lines.find((l) => l.startsWith("NEXT_PUBLIC_SUPABASE_URL="));
  const url = urlLine?.slice("NEXT_PUBLIC_SUPABASE_URL=".length).trim();
  if (url && /\/(rest\/v1\/?|)$/.test(url)) {
    const clean = url.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
    if (clean !== url) {
      set("NEXT_PUBLIC_SUPABASE_URL", clean);
      console.log("• Trimmed NEXT_PUBLIC_SUPABASE_URL to the bare project URL");
    }
  }

  if (!has("ED25519_PRIVATE_KEY_PEM") || !has("ED25519_PUBLIC_KEY_PEM")) {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    set("ED25519_PRIVATE_KEY_PEM", quotePem(privateKey.export({ type: "pkcs8", format: "pem" }).toString()));
    set("ED25519_PUBLIC_KEY_PEM", quotePem(publicKey.export({ type: "spki", format: "pem" }).toString()));
    added.push("ED25519_PRIVATE_KEY_PEM", "ED25519_PUBLIC_KEY_PEM");
  }
  addIfMissing("HMAC_MATCH_KEY", () => randomBytes(32).toString("hex"));
  addIfMissing("FIELD_ENC_KEY", () => randomBytes(32).toString("hex"));
  addIfMissing("APP_BASE_URL", () => "http://localhost:3000");
  addIfMissing("DEMO_MODE", () => "true");

  writeFileSync(ENV_PATH, lines.join("\n").replace(/\n*$/, "\n"));
  console.log(added.length ? `✔ Keys: added ${added.join(", ")}` : "✔ Keys: all present, nothing changed");
}

runScript(main);
