import { NextResponse } from "next/server";
import { z } from "zod";
import { appendAudit } from "@/lib/audit";
import { apiProfile } from "@/lib/auth/api";
import { consentState, ENROLMENT_RESULT_SELECT, guardVerifierLookup, minimalResult, signedReceipt, type EnrolmentForResult } from "@/lib/consent";
import { ApiError, route } from "@/lib/http";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const profile = await apiProfile(req, ["verifier"]);
  const id = z.uuid().parse((await params).id);
  const admin = createAdminSupabase();
  const { data: consent } = await admin.from("consents").select("*").eq("id", id).maybeSingle();
  if (!consent || consent.grantee_id !== profile.verifierOrgId) throw new ApiError(404, "NOT_FOUND", "That request was not found.");
  const state = consentState(consent);
  if (state === "Viewed") return NextResponse.json({ result: consent.receipt?.payload?.result ?? null, alreadyViewed: true });
  if (state !== "Approved") throw new ApiError(403, "NO_CONSENT", state === "Pending" ? "The student has not answered yet." : `This request is ${state.toLowerCase()}.`);
  const { data: org } = await admin.from("verifier_orgs").select("id, name, status").eq("id", consent.grantee_id).single();
  if (org?.status !== "Approved") throw new ApiError(403, "NOT_APPROVED", "AICTE has not approved your organisation.");
  await guardVerifierLookup(admin, org.id, org.name);

  const { data: enrolments } = await admin.from("enrolments").select(ENROLMENT_RESULT_SELECT).eq("student_id", consent.student_id).neq("enrolment_status", "PassedOut").order("created_at", { ascending: false });
  const list = (enrolments ?? []) as unknown as EnrolmentForResult[];
  const best = list.find((e) => e.validation_status === "Verified" && e.enrolment_status === "Active") ?? list[0];
  if (!best) throw new ApiError(404, "NO_RECORD", "No enrolment was found for this student.");
  const result = minimalResult(consent.scope, best);
  const receipt = signedReceipt(id, org.name, consent.purpose, result);
  await admin.from("consents").update({ consumed_at: new Date().toISOString(), receipt }).eq("id", id);
  await admin.from("access_log").insert({ who: profile.userId, grantee: org.name, student_id: consent.student_id, fields_returned: Object.keys(result), purpose: consent.purpose });
  await appendAudit(admin, { actorId: profile.userId, actorRole: profile.role, action: "verify.view", entity: "consent", entityId: id, meta: { fields: Object.keys(result) } });
  return NextResponse.json({ result, alreadyViewed: false });
});
