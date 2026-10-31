import { createServerClient } from "@supabase/ssr";
import { DEMO_PASSWORD, demoEmail } from "@/lib/demo-accounts";
import { needEnv } from "./run";

// Signs in a demo account and returns the exact cookies the app would set, for HTTP-level tests.
export async function demoCookie(handle: string): Promise<string> {
  const jar = new Map<string, string>();
  const client = createServerClient(needEnv("NEXT_PUBLIC_SUPABASE_URL"), needEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (items) => items.forEach(({ name, value }) => jar.set(name, value)),
    },
  });
  const { error } = await client.auth.signInWithPassword({ email: demoEmail(handle), password: DEMO_PASSWORD });
  if (error) throw new Error(`Demo login failed for ${handle}: ${error.message}`);
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}
