import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

/** Token bucket stored in Postgres, so limits hold across serverless instances. */
export async function takeToken(key: string, capacity: number, refillPerSec: number): Promise<boolean> {
  const { data, error } = await createAdminSupabase().rpc("take_token", { p_key: key, p_capacity: capacity, p_refill_per_sec: refillPerSec });
  // Fails open: a rate-limiter hiccup should not take the whole service down.
  return error ? true : data === true;
}

export const LIMITS = {
  login: [10, 10 / 60],
  otpPerStudent: [5, 5 / 3600],
  verifierLookup: [30, 30 / 60],
} as const;
