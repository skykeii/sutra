import { NextResponse } from "next/server";
import { z } from "zod";
import { appendAudit } from "@/lib/audit";
import { getSessionProfile } from "@/lib/auth/session";
import { ApiError, assertSameOrigin, readJson, route } from "@/lib/http";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("enroll") }),
  z.object({ action: z.literal("verify"), factorId: z.string().min(1).max(100), code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code.") }),
  z.object({ action: z.literal("remove"), factorId: z.string().min(1).max(100) }),
]);

export const POST = route(async (req) => {
  assertSameOrigin(req);
  const profile = await getSessionProfile();
  if (!profile) throw new ApiError(401, "NOT_SIGNED_IN", "Please sign in.");
  const input = body.parse(await readJson(req));
  const supabase = await createServerSupabase();
  const audit = (action: string) => appendAudit(createAdminSupabase(), { actorId: profile.userId, actorRole: profile.role, action, entity: "session", entityId: profile.userId });

  if (input.action === "enroll") {
    // Clears any half-finished enrolment, since Supabase refuses a duplicate unverified factor.
    const { data: factors } = await supabase.auth.mfa.listFactors();
    for (const f of factors?.all ?? []) if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Sutra ${Date.now()}` });
    if (error || !data) throw new ApiError(400, "MFA_FAILED", "Could not start two-factor setup. It may be turned off for this project.");
    return NextResponse.json({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret }, { headers: { "Cache-Control": "no-store" } });
  }
  if (input.action === "verify") {
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: input.factorId, code: input.code });
    if (error) throw new ApiError(400, "MFA_WRONG", "That code is not right. Check your authenticator app and try again.");
    await audit("auth.mfa_verified");
    return NextResponse.json({ ok: true });
  }
  const { error } = await supabase.auth.mfa.unenroll({ factorId: input.factorId });
  if (error) throw new ApiError(400, "MFA_FAILED", "Please verify with your authenticator first, then remove it.");
  await audit("auth.mfa_removed");
  return NextResponse.json({ ok: true });
});
