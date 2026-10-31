import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { raiseAlert } from "@/lib/alerts";
import { appendAudit } from "@/lib/audit";
import { canonicalJSON, hmacMatch, sha256Hex, signPayload } from "@/lib/crypto";
import { chunked } from "@/lib/db";

export const resultRow = z.object({
  apaar_id: z.string().trim().regex(/^\d{12}$/, "APAAR ID must have 12 digits"),
  semester: z.coerce.number().int().min(0).max(20),
  percentage: z.coerce.number().min(0).max(100),
  sgpa: z.union([z.coerce.number().min(0).max(10), z.literal("")]).optional(),
  result_status: z.enum(["Pass", "Fail", "Detained"]),
});
export const resultsBody = z.object({ fileName: z.string().min(1).max(200).regex(/\.(csv|xlsx)$|^api$/i), rows: z.array(resultRow).min(1).max(10_000) });

/** The university is the source of truth: each batch is signed over its digest and audited. */
export async function ingestResults(admin: SupabaseClient, universityId: string, input: z.infer<typeof resultsBody>, actor: { id: string | null; role: string }) {
  const rows = input.rows.map((r) => ({
    university_id: universityId,
    apaar_hash: hmacMatch(r.apaar_id),
    semester: r.semester,
    percentage: r.percentage,
    sgpa: r.sgpa === "" || r.sgpa === undefined ? null : r.sgpa,
    result_status: r.result_status,
  }));
  const digest = sha256Hex(canonicalJSON([...rows].sort((a, b) => `${a.apaar_hash}${a.semester}`.localeCompare(`${b.apaar_hash}${b.semester}`))));
  const signature = signPayload({ digest, university: universityId, file: input.fileName });
  const semesters = [...new Set(rows.map((r) => r.semester))];
  const { data: batch, error } = await admin
    .from("university_result_batches")
    .insert({ university_id: universityId, file_name: input.fileName, semester: semesters.length === 1 ? semesters[0] : null, row_count: rows.length, digest, signature, submitted_by: actor.id })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  for (const part of chunked(rows, 500)) {
    const { error: saveError } = await admin.from("university_results").upsert(part.map((r) => ({ ...r, batch_id: batch.id, batch_signature: signature })), { onConflict: "university_id,apaar_hash,semester" });
    if (saveError) throw new Error(saveError.message);
  }
  await appendAudit(admin, { actorId: actor.id, actorRole: actor.role, action: "results.publish", entity: "result_batch", entityId: batch.id, meta: { rows: rows.length, semesters } });
  return { batchId: batch.id, rows: rows.length, digest };
}

export const marksheetBody = z.object({ semester: z.coerce.number().int().min(1).max(20), claimed_pct: z.coerce.number().min(0).max(100), enrolmentId: z.uuid().optional() });

const TOLERANCE = 0.5;

/** Compares a claim with the university record by keyed hash. Marksheet images are never inspected. */
export async function checkMarksheet(admin: SupabaseClient, studentId: string, semester: number, claimed: number, actor: { id: string | null; role: string }) {
  const { data: student } = await admin.from("students").select("apaar_hash, enrolments(institution_id, enrolment_status)").eq("id", studentId).single();
  const { data: record } = await admin.from("university_results").select("percentage").eq("apaar_hash", student?.apaar_hash ?? "").eq("semester", semester).limit(1).maybeSingle();
  const verified = record ? Number(record.percentage) : null;
  const outcome = verified === null ? "NotFound" : Math.abs(verified - claimed) <= TOLERANCE ? "Match" : "Mismatch";
  await admin.from("marksheet_submissions").insert({ student_id: studentId, semester, claimed_pct: claimed, verified_pct: verified, outcome });
  await appendAudit(admin, { actorId: actor.id, actorRole: actor.role, action: "marksheet.check", entity: "student", entityId: studentId, meta: { semester, outcome } });
  if (outcome === "Mismatch") {
    const enrolments = (student?.enrolments ?? []) as { institution_id: string; enrolment_status: string }[];
    const institutionId = enrolments.find((e) => e.enrolment_status === "Active")?.institution_id ?? null;
    const payload = { semester, difference: Math.round(Math.abs(claimed - verified!) * 10) / 10 };
    await raiseAlert(admin, { code: "MARKS_MISMATCH", institutionId, title: "Marks claim does not match the university", message: `A claim for Semester ${semester} differs from the university record by ${payload.difference} points.`, meta: payload, webhook: { event: "marks_mismatch", payload } });
  }
  return { outcome, claimed, verified, semester };
}
