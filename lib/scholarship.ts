import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { raiseAlert } from "@/lib/alerts";
import { appendAudit } from "@/lib/audit";
import { notifyStudent } from "@/lib/consent";
import { hmacMatch } from "@/lib/crypto";

export const ACADEMIC_YEAR = "2026-27";
export const SCHOLARSHIP_SCOPE = ["enrolment_status", "program", "institution", "latest_semester", "result_status", "aggregate_pct"];
export const SCHEMES = ["Post-Matric Merit Scholarship", "Technical Education Fee Reimbursement", "State Merit-cum-Means Grant"];

export const scholarshipBody = z.object({
  apaar_id: z.string().trim().regex(/^\d{12}$/, "APAAR ID must have 12 digits"),
  scheme: z.string().trim().min(3).max(120),
  scope: z.array(z.string().max(40)).max(10).optional(),
  request_id: z.uuid().optional(),
});

export interface ScholarshipOutcome {
  request_id: string | null;
  status: "Pending" | "Fulfilled" | "Denied";
  message: string;
  denial_reason?: string;
  result?: Record<string, unknown>;
}

const deny = async (admin: SupabaseClient, requestId: string | null, reason: string): Promise<ScholarshipOutcome> => {
  if (requestId) await admin.from("scholarship_requests").update({ status: "Denied", denial_reason: reason }).eq("id", requestId);
  return { request_id: requestId, status: "Denied", denial_reason: reason, message: reason };
};

/** Runs only after the student has consented: these checks use private academic data. */
async function evaluate(admin: SupabaseClient, requestId: string, portalId: string, hash: string, scheme: string, consentId: string, scope: string[]): Promise<ScholarshipOutcome> {
  const { data: student } = await admin.from("students").select("id").eq("apaar_hash", hash).single();
  const { data: enrolment } = await admin.from("enrolments").select("institution_id, enrolment_status, institutions(name), programs(name)").eq("student_id", student!.id).eq("enrolment_status", "Active").order("admission_date", { ascending: false }).limit(1).maybeSingle();
  const ineligible = async (reason: string, institutionId: string | null) => {
    await raiseAlert(admin, { code: "SCHOLARSHIP_INELIGIBLE", severity: "Warning", institutionId, title: "Scholarship request denied", message: `A request for ${scheme} was denied: ${reason.replace(/Student /, "the student ")}.`, meta: { scheme } });
    await appendAudit(admin, { actorRole: "scholarship_portal", action: "scholarship.deny", entity: "scholarship_request", entityId: requestId, meta: { reason } });
    return deny(admin, requestId, reason);
  };
  if (!enrolment) return ineligible("Student is not actively enrolled", null);

  const { data: results } = await admin.from("university_results").select("semester, percentage, result_status").eq("apaar_hash", hash).gt("semester", 0).order("semester");
  const latest = results?.[results.length - 1];
  if (latest?.result_status === "Detained") return ineligible(`Student detained in Sem ${latest.semester}`, enrolment.institution_id);
  if (latest?.result_status === "Fail") return ineligible(`Student failed Sem ${latest.semester}`, enrolment.institution_id);

  const { data: mismatch } = await admin.from("marksheet_submissions").select("id").eq("student_id", student!.id).eq("outcome", "Mismatch").limit(1).maybeSingle();
  if (mismatch) return ineligible("Marks mismatch", enrolment.institution_id);

  const { data: flagged } = await admin.from("alerts").select("id").eq("institution_id", enrolment.institution_id).eq("code", "OVER_QUOTA").eq("status", "Open").limit(1).maybeSingle();
  if (flagged) return ineligible("Institution is under review for quota violations", enrolment.institution_id);

  const aggregate = results?.length ? Math.round((results.reduce((sum, r) => sum + Number(r.percentage), 0) / results.length) * 100) / 100 : null;
  // Allow-list: only these fields can ever leave, and never the full marksheet.
  const full: Record<string, unknown> = {
    enrolment_status: enrolment.enrolment_status,
    program: (enrolment.programs as unknown as { name: string }).name,
    institution: (enrolment.institutions as unknown as { name: string }).name,
    latest_semester: latest?.semester ?? null,
    result_status: latest?.result_status ?? null,
    aggregate_pct: aggregate,
  };
  const result: Record<string, unknown> = { verified: true };
  for (const field of SCHOLARSHIP_SCOPE) if (scope.includes(field)) result[field] = full[field];

  await admin.from("scholarship_requests").update({ status: "Fulfilled", result }).eq("id", requestId);
  await admin.from("consents").update({ consumed_at: new Date().toISOString() }).eq("id", consentId);
  const { data: portal } = await admin.from("scholarship_portals").select("name").eq("id", portalId).single();
  await admin.from("access_log").insert({ grantee: portal?.name ?? "Scholarship portal", student_id: student!.id, fields_returned: Object.keys(result), purpose: `Scholarship: ${scheme}` });
  await appendAudit(admin, { actorRole: "scholarship_portal", action: "scholarship.fulfil", entity: "scholarship_request", entityId: requestId, meta: { fields: Object.keys(result) } });
  return { request_id: requestId, status: "Fulfilled", message: "Verified with the student's consent.", result };
}

async function advance(admin: SupabaseClient, request: { id: string; portal_id: string; apaar_hash: string; scheme: string; status: string; consent_id: string | null; denial_reason: string | null; result: Record<string, unknown> | null }): Promise<ScholarshipOutcome> {
  if (request.status === "Fulfilled") return { request_id: request.id, status: "Fulfilled", message: "Verified with the student's consent.", result: request.result ?? undefined };
  if (request.status === "Denied") return { request_id: request.id, status: "Denied", denial_reason: request.denial_reason ?? "Denied", message: request.denial_reason ?? "Denied" };
  const { data: consent } = await admin.from("consents").select("approved_at, denied_at, revoked_at, expires_at, scope").eq("id", request.consent_id ?? "").maybeSingle();
  if (consent?.denied_at) return deny(admin, request.id, "Student declined consent");
  if (consent?.revoked_at) return deny(admin, request.id, "Student took back consent");
  if (consent?.approved_at) {
    if (consent.expires_at && new Date(consent.expires_at) < new Date()) return deny(admin, request.id, "Student's consent has expired");
    return evaluate(admin, request.id, request.portal_id, request.apaar_hash, request.scheme, request.consent_id!, consent.scope);
  }
  return { request_id: request.id, status: "Pending", message: "Waiting for the student to approve in their Sutra portal." };
}

/**
 * First call creates the request and asks for consent. Later calls with `request_id` poll it.
 * A new application after one was fulfilled counts as a duplicate claim for that scheme and year.
 */
export async function processScholarship(admin: SupabaseClient, portalId: string, input: z.infer<typeof scholarshipBody>): Promise<ScholarshipOutcome> {
  const hash = hmacMatch(input.apaar_id);
  const columns = "id, portal_id, apaar_hash, scheme, status, consent_id, denial_reason, result";
  if (input.request_id) {
    const { data } = await admin.from("scholarship_requests").select(columns).eq("id", input.request_id).eq("portal_id", portalId).maybeSingle();
    if (data && data.apaar_hash === hash) return advance(admin, data);
  }
  const { data: student } = await admin.from("students").select("id").eq("apaar_hash", hash).maybeSingle();
  if (!student) return { request_id: null, status: "Denied", denial_reason: "No student record found", message: "No student record found" };

  const { data: fulfilled } = await admin.from("scholarship_requests").select("id").eq("apaar_hash", hash).eq("scheme", input.scheme).eq("academic_year", ACADEMIC_YEAR).eq("status", "Fulfilled").limit(1).maybeSingle();
  if (fulfilled) {
    await raiseAlert(admin, { code: "SCHOLARSHIP_DUP_CLAIM", severity: "Warning", title: "Duplicate scholarship claim", message: `A second claim for ${input.scheme} in ${ACADEMIC_YEAR} was blocked.`, meta: { scheme: input.scheme } });
    const { data: denied } = await admin.from("scholarship_requests").insert({ portal_id: portalId, apaar_hash: hash, scheme: input.scheme, academic_year: ACADEMIC_YEAR, status: "Denied", denial_reason: "Duplicate claim detected" }).select("id").single();
    return { request_id: denied?.id ?? null, status: "Denied", denial_reason: "Duplicate claim detected", message: "Duplicate claim detected" };
  }

  const { data: open } = await admin.from("scholarship_requests").select(columns).eq("apaar_hash", hash).eq("scheme", input.scheme).eq("portal_id", portalId).in("status", ["Pending", "ConsentGranted"]).limit(1).maybeSingle();
  if (open) return advance(admin, open);

  const scope = (input.scope ?? SCHOLARSHIP_SCOPE).filter((f) => SCHOLARSHIP_SCOPE.includes(f));
  const { data: consent, error: consentError } = await admin.from("consents").insert({ student_id: student.id, grantee_type: "scholarship_portal", grantee_id: portalId, purpose: `Scholarship: ${input.scheme}`, scope }).select("id").single();
  if (consentError) throw new Error(consentError.message);
  const { data: request, error } = await admin.from("scholarship_requests").insert({ portal_id: portalId, apaar_hash: hash, scheme: input.scheme, academic_year: ACADEMIC_YEAR, status: "Pending", consent_id: consent.id }).select("id").single();
  if (error) throw new Error(error.message);
  await notifyStudent(admin, hash, "A scholarship portal asked to verify your record", input.scheme, "/student/consents");
  await appendAudit(admin, { actorRole: "scholarship_portal", action: "scholarship.request", entity: "scholarship_request", entityId: request.id, meta: { scope } });
  return { request_id: request.id, status: "Pending", message: "Waiting for the student to approve in their Sutra portal." };
}
