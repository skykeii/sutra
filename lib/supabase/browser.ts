import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

// Realtime only. Sessions live in httpOnly cookies, so the browser client holds no auth state.
// One instance per page load: more than one makes Supabase warn about multiple GoTrueClient instances.
export function createBrowserSupabase(): SupabaseClient {
  client ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
