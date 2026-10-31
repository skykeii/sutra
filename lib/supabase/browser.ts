import { createClient } from "@supabase/supabase-js";

// Realtime only. Sessions live in httpOnly cookies, so the browser client holds no auth state.
export function createBrowserSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
