import type { SupabaseClient } from "@supabase/supabase-js";
import { appendAudit } from "@/lib/audit";
import { issueCredential, verifyCredential, type SignedCredential } from "@/lib/credentials/vc";
import { decryptField, sha256Hex } from "@/lib/crypto";
import { ApiError } from "@/lib/http";
import { brandHeader, drawQr, keyValues, newPdf, pageFooter, A4 } from "@/lib/pdf";

export const baseUrl = () => process.env.APP_BASE_URL ?? "http://localhost:3000";
export const verifyUrl = (recordId: string) => `${baseUrl()}/verify/${recordId}`;

export type CredentialVerdict = "VALID" | "TAMPERED" | "REVOKED" | "EXPIRED" | "NOT_FOUND";

export interface CredentialCheck {
  verdict: CredentialVerdict;
  recordId: string;
  signatureValid: boolean;
  revokedReason?: string | null;
  fields?: { institution: string; program: string; years: string; status: string };
}

export function publicFields(vc: SignedCredential): CredentialCheck["fields"] {
  const s = vc.credentialSubject;
  return { institution: String(s.institution), program: String(s.program), years: `${s.admissionYear}-${s.expectedCompletion}`, status: String(s.status) };
}

export async function checkRecord(admin: SupabaseClient, recordId: string): Promise<CredentialCheck> {
  const { data } = await admin.from("credentials").select("payload, status, revoked_reason, expires_at").eq("record_id", recordId).maybeSingle();
  if (!data) return { verdict: "NOT_FOUND", recordId, signatureValid: false };
  const vc = data.payload as SignedCredential;
  const signatureValid = verifyCredential(vc);
  const fields = publicFields(vc);
  if (!signatureValid) return { verdict: "TAMPERED", recordId, signatureValid, fields };
  if (data.status === "Revoked") return { verdict: "REVOKED", recordId, signatureValid, revokedReason: data.revoked_reason, fields };
  if (data.expires_at && new Date(data.expires_at) < new Date()) return { verdict: "EXPIRED", recordId, signatureValid, fields };
  return { verdict: "VALID", recordId, signatureValid, fields };
}

/** Checks a credential someone pasted or uploaded: the signature first, then its revocation status. */
export async function checkUploaded(admin: SupabaseClient, vc: SignedCredential): Promise<CredentialCheck> {
  const recordId = String(vc.id ?? "").replace("urn:sutra:credential:", "");
  const signatureValid = verifyCredential(vc);
  if (!signatureValid) return { verdict: "TAMPERED", recordId, signatureValid, fields: vc.credentialSubject ? publicFields(vc) : undefined };
  const stored = await checkRecord(admin, recordId);
  return stored.verdict === "NOT_FOUND" ? { ...stored, verdict: "TAMPERED", signatureValid } : stored;
}

export async function issueForEnrolment(admin: SupabaseClient, enrolmentId: string, actor: { id: string; role: string }): Promise<string> {
  const { data: e } = await admin
    .from("enrolments")
    .select("id, admission_date, enrolment_status, institutions(name), programs(name, duration_years), students(id, apaar_id_enc, apaar_hash)")
    .eq("id", enrolmentId)
    .maybeSingle();
  if (!e) throw new ApiError(404, "NOT_FOUND", "That enrolment was not found.");
  const student = e.students as unknown as { id: string; apaar_id_enc: string; apaar_hash: string };
  const program = e.programs as unknown as { name: string; duration_years: number };
  const institution = e.institutions as unknown as { name: string };
  const { data: existing } = await admin.from("credentials").select("record_id, status").eq("enrolment_id", enrolmentId).eq("status", "Valid").maybeSingle();
  if (existing) return existing.record_id;

  const recordId = `SUTRA-${sha256Hex(`${e.id}:${Date.now()}`).slice(0, 10).toUpperCase()}`;
  const year = Number(e.admission_date.slice(0, 4));
  const completion = year + program.duration_years;
  const issuedAt = new Date().toISOString();
  const expiresAt = `${completion}-07-31T00:00:00.000Z`;
  const vc = issueCredential({
    recordId,
    apaarId: decryptField(student.apaar_id_enc),
    apaarHash: student.apaar_hash,
    institution: institution.name,
    program: program.name,
    admissionYear: year,
    expectedCompletion: completion,
    status: e.enrolment_status,
    issuedAt,
    expiresAt,
    baseUrl: baseUrl(),
  });
  const { error } = await admin.from("credentials").insert({ record_id: recordId, enrolment_id: e.id, payload: vc, signature: vc.proof.signatureValue, issued_at: issuedAt, expires_at: expiresAt, status: "Valid" });
  if (error) throw new Error(`Could not save the credential: ${error.message}`);
  await appendAudit(admin, { actorId: actor.id, actorRole: actor.role, action: "credential.issue", entity: "credential", entityId: recordId });

  const { data: owner } = await admin.from("profiles").select("user_id").eq("apaar_hash", student.apaar_hash).maybeSingle();
  if (owner) await admin.from("notifications").insert({ user_id: owner.user_id, title: "Your record has been verified", body: "Your signed credential is ready to download.", link: "/student" });
  return recordId;
}

export async function credentialPdf(recordId: string, vc: SignedCredential, revoked: boolean): Promise<Uint8Array> {
  const { doc, fonts } = await newPdf(`Sutra credential ${recordId}`);
  const page = doc.addPage([A4.w, A4.h]);
  brandHeader(page, fonts, "Verified Enrolment Record", `Record ${recordId}`);
  const s = vc.credentialSubject;
  const y = keyValues(page, fonts, [
    ["Institution", String(s.institution)],
    ["Program", String(s.program)],
    ["Years", `${s.admissionYear} to ${s.expectedCompletion}`],
    ["Status", revoked ? "REVOKED" : String(s.status)],
    ["APAAR ID", String(s.apaarIdMasked)],
    ["Issued", vc.issuanceDate.slice(0, 10)],
    ["Issuer", vc.issuer.name],
  ], A4.h - 160);
  await drawQr(doc, page, verifyUrl(recordId), 36, y - 170, 150);
  page.drawText("Scan to check this record", { x: 200, y: y - 60, size: 12, font: fonts.bold });
  page.drawText("The public page confirms the digital signature and", { x: 200, y: y - 80, size: 10, font: fonts.regular });
  page.drawText("whether the record has been revoked.", { x: 200, y: y - 94, size: 10, font: fonts.regular });
  page.drawText(verifyUrl(recordId), { x: 200, y: y - 114, size: 9, font: fonts.regular, maxWidth: 360 });
  page.drawText(`Signature: ${vc.proof.signatureValue.slice(0, 64)}...`, { x: 36, y: y - 200, size: 8, font: fonts.regular, maxWidth: 520 });
  pageFooter(page, fonts, "Digitally signed with Ed25519. Tamper-evident: any change to this record invalidates the signature.");
  return doc.save();
}
