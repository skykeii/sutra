import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadEnvConfig } from "@next/env";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const ROOT = process.cwd();
export const ENV_PATH = join(ROOT, ".env.local");

export class FriendlyError extends Error {}

export function loadEnv(): void {
  if (!existsSync(ENV_PATH)) {
    const hint = existsSync(`${ENV_PATH}.txt`)
      ? "Found .env.local.txt. Rename it to .env.local (Windows hides the .txt ending)."
      : "Copy .env.example to .env.local and fill in your Supabase values.";
    throw new FriendlyError(`.env.local not found. ${hint}`);
  }
  loadEnvConfig(ROOT, true, { info: () => {}, error: () => {} }, true);
}

export function needEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new FriendlyError(`${name} missing in .env.local`);
  return value;
}

export function adminClient(): SupabaseClient {
  return createClient(needEnv("NEXT_PUBLIC_SUPABASE_URL"), needEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function runScript(main: () => Promise<void>): void {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n✖ ${message}`);
    if (!(err instanceof FriendlyError)) console.error("  (Unexpected error. Fix the cause above and run the command again; it is safe to re-run.)");
    process.exit(1);
  });
}
