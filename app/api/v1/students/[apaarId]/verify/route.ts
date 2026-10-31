import { NextResponse } from "next/server";
import { z } from "zod";
import { appendAudit } from "@/lib/audit";
import { apiKeyOwner } from "@/lib/auth/api";
import { consentState, ENROLMENT_RESULT_SELECT, guardVerifierLookup, minimalResult, signedReceipt, type EnrolmentForResult } from "@/lib/consent";
import { hmacMatch } from "@/lib/crypto";
import { ApiError, route } from "@/lib/http";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const GET = route<{ params: Promise<{ apaarId: string }> }>(async (req, { params }) => {
  const owner = await apiKeyOwner(req, "verify:read");
  if (!owner.verifierOrgId) throw new ApiError(403, "API_KEY_SCOPE", "This endpoint needs a verifier key.");
  const apaarId = z.string().regex(/^\d{12}$/, "APAAR ID must have 12 digits").parse((await params).apaarId);
  const token = z.uuid({ error: "Send the consent ID in the X-Consent-Token header." }).parse(req.headers.get("x-consent-token"));
  const admin = createAdminSupabase();
  const { data: org } = await admin.from("verifier_orgs").select("id, name, status").eq("id", owner.verifierOrgId).single();
  if (org?.status !== "Approved") throw new ApiError(403, "NOT_APPROVED", "AICTE has not approved your organisation.");
  await guardVerifierLookup(admin, org.id, org.name);

  const { data: consent } = await admin.from("consents").select("*, students(apaar_hash)").eq("id", token).maybeSingle();
  const hash = (consent?.students as { apaar_hash: string } | null)?.apaar_hash;
  if (!consent || consent.grantee_id !== org.id || hash !== hmacMatch(apaarId)) throw new ApiError(403, "NO_CONSENT", "This consent token is not valid for this student.");
  const state = consentState(consent);
  if (state !== "Approved") throw new ApiError(403, "NO_CONSENT", state === "Viewed" ? "This consent has already been used." : `This consent is ${state.toLowerCase()}.`);

  const { data: enrolments } = await admin.from("enrolments").select(ENROLMENT_RESULT_SELECT).eq("student_id", consent.student_id).neq("enrolment_status", "PassedOut").order("created_at", { ascending: false });
  const list = (enrolments ?? []) as unknown as EnrolmentForResult[];
  const best = list.find((e) => e.validation_status === "Verified" && e.enrolment_status === "Active") ?? list[0];
  if (!best) throw new ApiError(404, "NO_RECORD", "No enrolment was found for this student.");
  const result = minimalResult(consent.scope, best);
  await admin.from("consents").update({ consumed_at: new Date().toISOString(), receipt: signedReceipt(token, org.name, consent.purpose, result) }).eq("id", token);
  await admin.from("access_log").insert({ grantee: org.name, student_id: consent.student_id, fields_returned: Object.keys(result), purpose: consent.purpose });
  await appendAudit(admin, { actorRole: "api_key", action: "verify.view", entity: "consent", entityId: token, meta: { fields: Object.keys(result) } });
  return NextResponse.json(result);
});
