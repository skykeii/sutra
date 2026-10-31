import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { secureCookieOptions } from "@/lib/supabase/cookies";

export async function createServerSupabase() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(items) {
        try {
          items.forEach(({ name, value, options }) => store.set(name, value, secureCookieOptions(options)));
        } catch {
          // Server Components cannot write cookies; middleware refreshes the session instead.
        }
      },
    },
  });
}
