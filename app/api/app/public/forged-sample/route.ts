import { NextResponse } from "next/server";
import type { SignedCredential } from "@/lib/credentials/vc";
import { ApiError, route } from "@/lib/http";
import { createAdminSupabase } from "@/lib/supabase/admin";

// The demo's "Fake QR test": a real credential with one field altered and the old signature kept.
export const GET = route(async () => {
  const { data } = await createAdminSupabase().from("credentials").select("payload").eq("record_id", "SUTRA-DEMO-VALID").maybeSingle();
  if (!data) throw new ApiError(404, "NOT_FOUND", "The demo credential is missing. Run npm run seed.");
  const forged = structuredClone(data.payload) as SignedCredential;
  forged.credentialSubject.program = "MBBS General Medicine";
  return NextResponse.json(forged);
});
