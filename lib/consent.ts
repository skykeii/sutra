import { randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { raiseAlert } from "@/lib/alerts";
import { appendAudit } from "@/lib/audit";
import { hmacMatch, signPayload } from "@/lib/crypto";
import { ApiError } from "@/lib/http";
import { LIMITS, takeToken } from "@/lib/ratelimit";

export const OTP_MINUTES = 5;
const otpHash = (consentId: string, otp: string) => hmacMatch(`otp:${consentId}:${otp}`);

export async function ownedConsent(admin: SupabaseClient, consentId: string, studentId: string) {
  const { data } = await admin.from("consents").select("*").eq("id", consentId).maybeSingle();
  if (!data || data.student_id !== studentId) throw new ApiError(404, "NOT_FOUND", "That consent request was not found.");
  return data;
}

export async function sendConsentOtp(admin: SupabaseClient, consentId: string, studentId: string, actorId: string) {
  const consent = await ownedConsent(admin, consentId, studentId);
  if (consent.approved_at || consent.denied_at) throw new ApiError(409, "ALREADY_DECIDED", "You have already answered this request.");
  if (!(await takeToken(`otp:${studentId}`, ...LIMITS.otpPerStudent))) throw new ApiError(429, "RATE_LIMITED", "Too many codes requested. You can ask for 5 codes an hour.");
  const otp = String(randomInt(100000, 1000000));
  const expires = new Date(Date.now() + OTP_MINUTES * 60_000).toISOString();
  await admin.from("consents").update({ otp_hash: otpHash(consentId, otp), otp_expires_at: expires, otp_attempts: 0 }).eq("id", consentId);
  await admin.from("simulated_sms").insert({ student_id: studentId, message: `Sutra: your consent code is ${otp}. It works for ${OTP_MINUTES} minutes. Purpose: ${consent.purpose}.` });
  await appendAudit(admin, { actorId, actorRole: "student", action: "consent.otp_sent", entity: "consent", entityId: consentId });
}

export async function approveConsent(admin: SupabaseClient, consentId: string, studentId: string, otp: string, days: number, actorId: string) {
  const consent = await ownedConsent(admin, consentId, studentId);
  if (consent.approved_at || consent.denied_at) throw new ApiError(409, "ALREADY_DECIDED", "You have already answered this request.");
  if (!consent.otp_hash || !consent.otp_expires_at || new Date(consent.otp_expires_at) < new Date()) throw new ApiError(400, "OTP_EXPIRED", "That code has expired. Please ask for a new one.");
  if (consent.otp_attempts >= 5) throw new ApiError(429, "OTP_LOCKED", "Too many wrong codes. Please ask for a new one.");
  if (otpHash(consentId, otp) !== consent.otp_hash) {
    await admin.from("consents").update({ otp_attempts: consent.otp_attempts + 1 }).eq("id", consentId);
    await appendAudit(admin, { actorId, actorRole: "student", action: "consent.otp_failed", entity: "consent", entityId: consentId });
    throw new ApiError(400, "OTP_WRONG", "That code is not right. Please check the simulated SMS inbox.");
  }
  const now = new Date();
  await admin.from("consents").update({ approved_at: now.toISOString(), expires_at: new Date(now.getTime() + days * 86_400_000).toISOString(), otp_hash: null, otp_expires_at: null }).eq("id", consentId);
  if (consent.grantee_type === "scholarship_portal") await admin.from("scholarship_requests").update({ status: "ConsentGranted" }).eq("consent_id", consentId).eq("status", "Pending");
  await appendAudit(admin, { actorId, actorRole: "student", action: "consent.approve", entity: "consent", entityId: consentId, meta: { days, scope: consent.scope } });
}

export async function denyConsent(admin: SupabaseClient, consentId: string, studentId: string, actorId: string) {
  const consent = await ownedConsent(admin, consentId, studentId);
  if (consent.approved_at || consent.denied_at) throw new ApiError(409, "ALREADY_DECIDED", "You have already answered this request.");
  await admin.from("consents").update({ denied_at: new Date().toISOString() }).eq("id", consentId);
  if (consent.grantee_type === "scholarship_portal") await admin.from("scholarship_requests").update({ status: "Denied", denial_reason: "Student declined consent" }).eq("consent_id", consentId);
  await appendAudit(admin, { actorId, actorRole: "student", action: "consent.deny", entity: "consent", entityId: consentId });
}

export async function revokeConsent(admin: SupabaseClient, consentId: string, studentId: string, actorId: string) {
  await ownedConsent(admin, consentId, studentId);
  await admin.from("consents").update({ revoked_at: new Date().toISOString() }).eq("id", consentId);
  await appendAudit(admin, { actorId, actorRole: "student", action: "consent.revoke", entity: "consent", entityId: consentId });
}

export function consentState(c: { approved_at: string | null; denied_at: string | null; revoked_at: string | null; consumed_at: string | null; expires_at: string | null }): string {
  if (c.denied_at) return "Denied";
  if (c.revoked_at) return "Revoked";
  if (!c.approved_at) return "Pending";
  if (c.consumed_at) return "Viewed";
  if (c.expires_at && new Date(c.expires_at) < new Date()) return "Expired";
  return "Approved";
}

export async function notifyStudent(admin: SupabaseClient, apaarHash: string, title: string, body: string, link: string) {
  const { data: owner } = await admin.from("profiles").select("user_id").eq("apaar_hash", apaarHash).maybeSingle();
  if (owner) await admin.from("notifications").insert({ user_id: owner.user_id, title, body, link });
}

/** Limits one verifier to 30 lookups a minute, and tells AICTE when an organisation hits the ceiling. */
export async function guardVerifierLookup(admin: SupabaseClient, orgId: string, orgName: string) {
  if (await takeToken(`verifier:${orgId}`, ...LIMITS.verifierLookup)) return;
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { data: recent } = await admin.from("alerts").select("id").eq("code", "BULK_SCRAPE").gte("created_at", since).contains("meta", { org_id: orgId }).limit(1);
  if (!recent?.length) await raiseAlert(admin, { code: "BULK_SCRAPE", severity: "Warning", title: "Possible bulk lookups", message: `${orgName} reached the verification rate limit.`, meta: { org_id: orgId } });
  throw new ApiError(429, "RATE_LIMITED", "Too many lookups. You can make 30 a minute.");
}

const FIELD_READERS: Record<string, (e: EnrolmentForResult) => unknown> = {
  institution: (e) => e.institutions.name,
  program: (e) => e.programs.name,
  years: (e) => `${e.admission_date.slice(0, 4)}-${Number(e.admission_date.slice(0, 4)) + e.programs.duration_years}`,
  status: (e) => e.enrolment_status,
  quota: (e) => e.quota_type,
  admission_category: (e) => e.admission_category,
  validation_status: (e) => e.validation_status,
};

export interface EnrolmentForResult {
  id: string;
  admission_date: string;
  enrolment_status: string;
  validation_status: string;
  quota_type: string;
  admission_category: string;
  institutions: { name: string };
  programs: { name: string; duration_years: number };
}

export const ENROLMENT_RESULT_SELECT = "id, admission_date, enrolment_status, validation_status, quota_type, admission_category, institutions(name), programs(name, duration_years)";

/** Allow-list by construction: only fields named in the consent scope are ever read. */
export function minimalResult(scope: string[], e: EnrolmentForResult): Record<string, unknown> {
  const out: Record<string, unknown> = { verified: e.validation_status === "Verified" };
  for (const field of scope) {
    const read = FIELD_READERS[field];
    if (read) out[field] = read(e);
  }
  return out;
}

export function signedReceipt(consentId: string, orgName: string, purpose: string, fields: Record<string, unknown>) {
  const payload = { receipt_id: consentId, verifier: orgName, purpose, result: fields, verified_at: new Date().toISOString() };
  return { payload, signature: signPayload(payload) };
}
