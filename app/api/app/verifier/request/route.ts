import { NextResponse } from "next/server";
import { z } from "zod";
import { appendAudit } from "@/lib/audit";
import { apiProfile } from "@/lib/auth/api";
import { guardVerifierLookup, notifyStudent } from "@/lib/consent";
import { hmacMatch } from "@/lib/crypto";
import { ApiError, readJson, route } from "@/lib/http";
import { createAdminSupabase } from "@/lib/supabase/admin";

const body = z.object({ lookup: z.string().min(5).max(300), purpose: z.string().min(3).max(200) });

export const POST = route(async (req) => {
  const profile = await apiProfile(req, ["verifier"]);
  const input = body.parse(await readJson(req));
  const admin = createAdminSupabase();
  const { data: org } = await admin.from("verifier_orgs").select("id, name, status, scope").eq("id", profile.verifierOrgId ?? "").maybeSingle();
  if (!org || org.status !== "Approved") throw new ApiError(403, "NOT_APPROVED", "AICTE has not approved your organisation yet.");
  await guardVerifierLookup(admin, org.id, org.name);

  // Accepts a 12-digit APAAR ID, a /verify/ QR link, or a bare record ID.
  const raw = input.lookup.trim();
  let studentId: string | null = null;
  let apaarHash: string | null = null;
  if (/^\d{12}$/.test(raw.replace(/[\s-]/g, ""))) {
    apaarHash = hmacMatch(raw.replace(/[\s-]/g, ""));
    const { data } = await admin.from("students").select("id").eq("apaar_hash", apaarHash).maybeSingle();
    studentId = data?.id ?? null;
  } else {
    const recordId = raw.split("/").pop()!.split("?")[0]!;
    const { data } = await admin.from("credentials").select("enrolments(students(id, apaar_hash))").eq("record_id", recordId).maybeSingle();
    const student = (data?.enrolments as unknown as { students: { id: string; apaar_hash: string } } | undefined)?.students;
    studentId = student?.id ?? null;
    apaarHash = student?.apaar_hash ?? null;
  }
  await appendAudit(admin, { actorId: profile.userId, actorRole: profile.role, action: "verify.lookup", entity: "verifier_org", entityId: org.id, meta: { found: !!studentId } });
  if (!studentId || !apaarHash) throw new ApiError(404, "NO_RECORD", "We have no record for that ID. Check it and try again.");

  const recent = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data: open } = await admin.from("consents").select("id").eq("student_id", studentId).eq("grantee_id", org.id).eq("purpose", input.purpose)
    .is("approved_at", null).is("denied_at", null).is("revoked_at", null).gte("created_at", recent).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (open) return NextResponse.json({ consentId: open.id, alreadyPending: true });
  const { data: consent, error } = await admin.from("consents").insert({ student_id: studentId, grantee_type: "verifier_org", grantee_id: org.id, purpose: input.purpose, scope: org.scope }).select("id").single();
  if (error) throw new Error(error.message);
  await notifyStudent(admin, apaarHash, "Someone asked to verify your record", `${org.name}: ${input.purpose}`, "/student/consents");
  await appendAudit(admin, { actorId: profile.userId, actorRole: profile.role, action: "consent.request", entity: "consent", entityId: consent.id, meta: { scope: org.scope } });
  return NextResponse.json({ consentId: consent.id, alreadyPending: false });
});
