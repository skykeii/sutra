import { NextResponse } from "next/server";
import { jsonError, route } from "@/lib/http";
import { createServerSupabase } from "@/lib/supabase/server";

// Hands the short-lived access token to the Realtime socket; RLS still decides what it can receive.
export const GET = route(async () => {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError(401, "NOT_SIGNED_IN", "Please sign in.");
  const { data: { session } } = await supabase.auth.getSession();
  return NextResponse.json({ token: session?.access_token ?? null }, { headers: { "Cache-Control": "no-store" } });
});
