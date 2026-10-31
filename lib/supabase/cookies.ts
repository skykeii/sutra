import type { CookieOptions } from "@supabase/ssr";

// Sessions stay out of reach of page scripts: all auth runs server-side.
export function secureCookieOptions(options: CookieOptions): CookieOptions {
  return { ...options, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" };
}
