import { NextResponse } from "next/server";
import { z } from "zod";
import { apiProfile } from "@/lib/auth/api";
import { approveConsent, denyConsent, revokeConsent, sendConsentOtp } from "@/lib/consent";
import { ApiError, readJson, route } from "@/lib/http";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("otp") }),
  z.object({ action: z.literal("approve"), otp: z.string().regex(/^\d{6}$/, "Enter the 6-digit code."), days: z.number().int().min(1).max(90).default(7) }),
  z.object({ action: z.literal("deny") }),
  z.object({ action: z.literal("revoke") }),
]);

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const profile = await apiProfile(req, ["student"]);
  const id = z.uuid().parse((await params).id);
  const input = body.parse(await readJson(req));
  const supabase = await createServerSupabase();
  const { data: studentId } = await supabase.rpc("app_student_id");
  if (!studentId) throw new ApiError(404, "NO_RECORD", "We could not find your student record.");
  const admin = createAdminSupabase();
  if (input.action === "otp") await sendConsentOtp(admin, id, studentId, profile.userId);
  if (input.action === "approve") await approveConsent(admin, id, studentId, input.otp, input.days, profile.userId);
  if (input.action === "deny") await denyConsent(admin, id, studentId, profile.userId);
  if (input.action === "revoke") await revokeConsent(admin, id, studentId, profile.userId);
  return NextResponse.json({ ok: true });
});
