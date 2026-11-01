import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { apaarAdapter } from "@/lib/adapters/apaar";
import { raiseAlert } from "@/lib/alerts";
import { appendAudit } from "@/lib/audit";
import { invalidateAggregates } from "@/lib/cache-tags";
import { encryptField, hmacMatch } from "@/lib/crypto";
import { chunked, fetchAll } from "@/lib/db";
import { ApiError } from "@/lib/http";
import { numberRows, toIsoDate, toStoredIssue, validateBatch, type Issue, type NumberedRow, type ValidationContext, type ValidationResult } from "@/lib/validation";
import { coerceRow, CSV_COLUMNS, MAX_UPLOAD_ROWS } from "@/lib/validation/columns";
import { normaliseName } from "@/lib/validation/rules";
import type { Quota } from "@/lib/validation/types";

const cell = z.union([z.string().max(500), z.number(), z.boolean(), z.null()]);
export const uploadBody = z.object({
  programId: z.uuid(),
  fileName: z.string().min(1).max(200).regex(/\.(csv|xlsx)$|^single-entry$|^api$/i, "Only .csv and .xlsx files are accepted."),
  rows: z.array(z.partialRecord(z.enum(CSV_COLUMNS), cell)).min(1).max(MAX_UPLOAD_ROWS),
  updateApaars: z.array(z.string().max(20)).max(MAX_UPLOAD_ROWS).optional(),
  fixes: z.array(z.object({ rowNumber: z.number(), field: z.string().max(40), code: z.string().max(40) })).max(50_000).optional(),
  commit: z.boolean().optional(),
});

export interface Actor {
  id: string | null;
  role: string;
}

async function loadProgram(admin: SupabaseClient, programId: string, institutionId: string) {
  const { data: program } = await admin.from("programs").select("id, name, level, approved_intake, supernumerary_cap, institution_id").eq("id", programId).maybeSingle();
  if (!program || program.institution_id !== institutionId) throw new ApiError(404, "PROGRAM_NOT_FOUND", "That program does not belong to your institution.");
  return program;
}

async function buildContext(admin: SupabaseClient, program: Awaited<ReturnType<typeof loadProgram>>, rows: NumberedRow[], updateApaars: string[]): Promise<{ ctx: ValidationContext; hashOf: Map<string, string> }> {
  const apaars = [...new Set(rows.map((r) => r.apaar_id.trim()).filter((a) => /^\d{12}$/.test(a)))];
  const hashOf = new Map(apaars.map((a) => [a, hmacMatch(a)]));
  const apaarOfHash = new Map(apaars.map((a) => [hashOf.get(a)!, a]));
  const hashes = [...apaarOfHash.keys()];

  const [matrix, active, rules] = await Promise.all([
    admin.from("seat_matrix").select("quota_type, seats_allowed").eq("program_id", program.id),
    fetchAll<{ quota_type: Quota }>((from, to) => admin.from("enrolments").select("quota_type").eq("program_id", program.id).eq("enrolment_status", "Active").range(from, to)),
    admin.from("eligibility_rules").select("program_id, level, rule_type, params").or(`program_id.eq.${program.id},level.eq.${program.level}`),
  ]);

  const byQuota: Partial<Record<Quota, number>> = {};
  active.forEach((e) => (byQuota[e.quota_type] = (byQuota[e.quota_type] ?? 0) + 1));

  const eligibility: ValidationContext["eligibility"] = {};
  // Program-specific rules run last, so they override the level default.
  for (const rule of [...(rules.data ?? [])].sort((a) => (a.program_id ? 1 : -1))) {
    const params = rule.params as Record<string, unknown>;
    if (rule.rule_type === "MIN_QUALIFYING_PCT") eligibility.minPct = Number(params.min);
    if (rule.rule_type === "MAX_AGE") eligibility.maxAge = Number(params.max);
    if (rule.rule_type === "REQUIRED_STREAM") eligibility.requiredStream = String(params.stream);
  }

  const existingInProgram = new Set<string>();
  const crossInstitution = new Set<string>();
  const qualifyingMarks = new Map<string, number>();
  for (const part of chunked(hashes)) {
    const { data: students } = await admin.from("students").select("id, apaar_hash").in("apaar_hash", part);
    const apaarOfStudent = new Map((students ?? []).map((s) => [s.id, apaarOfHash.get(s.apaar_hash)!]));
    if (apaarOfStudent.size) {
      const { data: enrolments } = await admin.from("enrolments").select("student_id, program_id, institution_id, enrolment_status").in("student_id", [...apaarOfStudent.keys()]);
      for (const e of enrolments ?? []) {
        const apaar = apaarOfStudent.get(e.student_id)!;
        if (e.program_id === program.id) existingInProgram.add(apaar);
        else if (e.institution_id !== program.institution_id && e.enrolment_status === "Active") crossInstitution.add(apaar);
      }
    }
    const { data: marks } = await admin.from("university_results").select("apaar_hash, percentage").in("apaar_hash", part).eq("semester", 0);
    marks?.forEach((m) => qualifyingMarks.set(apaarOfHash.get(m.apaar_hash)!, Number(m.percentage)));
  }

  // Keyed mobile hash only: same name, DOB and mobile under a different APAAR ID.
  const fuzzyRows = new Set<number>();
  const byMobile = new Map<string, NumberedRow[]>();
  for (const r of rows) {
    const digits = r.mobile.replace(/\D/g, "").slice(-10);
    if (digits.length === 10) {
      const h = hmacMatch(digits);
      byMobile.set(h, [...(byMobile.get(h) ?? []), r]);
    }
  }
  for (const part of chunked([...byMobile.keys()])) {
    const { data: same } = await admin.from("students").select("apaar_hash, mobile_hash, name, dob").in("mobile_hash", part);
    for (const s of same ?? []) {
      for (const r of byMobile.get(s.mobile_hash) ?? []) {
        if (hashOf.get(r.apaar_id.trim()) !== s.apaar_hash && normaliseName(s.name) === normaliseName(r.name) && s.dob === toIsoDate(r.dob)) fuzzyRows.add(r.rowNumber);
      }
    }
  }

  return {
    hashOf,
    ctx: {
      program: {
        level: program.level,
        approvedIntake: program.approved_intake,
        supernumeraryCap: program.supernumerary_cap,
        seatMatrix: Object.fromEntries((matrix.data ?? []).map((m) => [m.quota_type, m.seats_allowed])),
      },
      counts: {
        regular: active.filter((e) => e.quota_type !== "SUPERNUMERARY").length,
        supernumerary: active.filter((e) => e.quota_type === "SUPERNUMERARY").length,
        byQuota,
      },
      registry: await apaarAdapter(admin).lookupMany(apaars),
      existingInProgram,
      updateApaars: new Set(updateApaars),
      crossInstitution,
      fuzzyRows,
      qualifyingMarks,
      eligibility,
    },
  };
}

export interface UploadOutcome extends ValidationResult {
  batchId?: string;
  created: number;
  updated: number;
}

export async function processUpload(
  admin: SupabaseClient,
  input: z.infer<typeof uploadBody> & { institutionId: string; actor: Actor },
): Promise<UploadOutcome> {
  const program = await loadProgram(admin, input.programId, input.institutionId);
  const rows = numberRows(input.rows.map((r) => coerceRow(r)));
  const { ctx, hashOf } = await buildContext(admin, program, rows, input.updateApaars ?? []);
  const result = validateBatch(rows, ctx);
  const auditBase = { actorId: input.actor.id, actorRole: input.actor.role };

  if (!input.commit) {
    await appendAudit(admin, { ...auditBase, action: "validation.outcome", entity: "program", entityId: program.id, meta: { rows: result.stats.total, errors: result.stats.errors, warnings: result.stats.warnings, by_rule: result.stats.byRule, stage: "preview" } });
    return { ...result, created: 0, updated: 0 };
  }

  const blockedIssues = result.issues.filter((i) => i.severity === "Error");
  const { data: batch, error: batchError } = await admin
    .from("upload_batches")
    .insert({
      institution_id: input.institutionId,
      program_id: program.id,
      file_name: input.fileName,
      row_count: rows.length,
      error_count: blockedIssues.length,
      warning_count: result.stats.warnings,
      status: result.cleanRows.length ? "Submitted" : "Rejected",
      submitted_by: input.actor.id,
    })
    .select("id")
    .single();
  if (batchError || !batch) throw new Error(`Could not record the batch: ${batchError?.message}`);

  const warned = new Set(result.issues.filter((i) => i.severity === "Warning").map((i) => i.rowNumber));
  const enrolmentOfRow = new Map<number, string>();
  let created = 0;
  let updated = 0;

  for (const part of chunked(result.cleanRows, 200)) {
    const hashes = part.map((r) => hashOf.get(r.apaar_id.trim())!);
    const { data: known } = await admin.from("students").select("id, apaar_hash").in("apaar_hash", hashes);
    const idOfHash = new Map((known ?? []).map((s) => [s.apaar_hash, s.id]));

    const studentRow = (r: NumberedRow) => {
      const mobile = r.mobile.replace(/\D/g, "").slice(-10);
      const email = r.email.trim().toLowerCase();
      const reg = ctx.registry.get(r.apaar_id.trim());
      return {
        apaar_hash: hashOf.get(r.apaar_id.trim())!,
        apaar_id_enc: encryptField(r.apaar_id.trim()),
        name: reg?.name ?? r.name.trim(),
        dob: toIsoDate(r.dob),
        gender: r.gender.trim(),
        nationality: r.nationality.trim() || "Indian",
        is_nri: r.is_nri.trim().toLowerCase() === "true",
        oci_status: r.oci_status.trim().toLowerCase() || "none",
        is_foreign_national: r.is_foreign_national.trim().toLowerCase() === "true",
        passport_no_enc: r.passport_no.trim() ? encryptField(r.passport_no.trim()) : null,
        mobile_enc: mobile ? encryptField(mobile) : null,
        mobile_hash: mobile ? hmacMatch(mobile) : null,
        email_enc: email ? encryptField(email) : null,
        email_hash: email ? hmacMatch(email) : null,
        address_hash: r.address.trim() ? hmacMatch(r.address.trim().toLowerCase()) : null,
        prev_qualification: r.prev_qualification.trim() || null,
        prev_marks_pct: r.prev_marks_pct.trim() ? Number(r.prev_marks_pct) : null,
        prev_pass_year: r.prev_pass_year.trim() ? Number(r.prev_pass_year) : null,
      };
    };

    const fresh = part.filter((r) => !idOfHash.has(hashOf.get(r.apaar_id.trim())!));
    if (fresh.length) {
      const { data: inserted, error } = await admin.from("students").insert(fresh.map((r) => ({ ...studentRow(r), created_by_institution_id: input.institutionId }))).select("id, apaar_hash");
      if (error) throw new Error(`Could not save students: ${error.message}`);
      inserted?.forEach((s) => idOfHash.set(s.apaar_hash, s.id));
    }
    for (const r of part.filter((x) => !fresh.includes(x))) {
      const { error } = await admin.from("students").update(studentRow(r)).eq("id", idOfHash.get(hashOf.get(r.apaar_id.trim())!)!);
      if (error) throw new Error(`Could not update a student: ${error.message}`);
    }

    const studentIds = [...idOfHash.values()];
    const { data: existing } = await admin.from("enrolments").select("id, student_id, version").eq("program_id", program.id).in("student_id", studentIds);
    const existingOf = new Map((existing ?? []).map((e) => [e.student_id, e]));
    const { data: saved, error: enrolError } = await admin
      .from("enrolments")
      .upsert(
        part.map((r) => {
          const studentId = idOfHash.get(hashOf.get(r.apaar_id.trim())!)!;
          const previous = existingOf.get(studentId);
          if (previous) updated += 1;
          else created += 1;
          return {
            student_id: studentId,
            institution_id: input.institutionId,
            program_id: program.id,
            admission_date: toIsoDate(r.admission_date),
            quota_type: r.quota_type.trim().toUpperCase(),
            admission_category: r.admission_category.trim() || "Regular",
            counselling_allotment_no: r.counselling_allotment_no.trim() || null,
            fee_status: r.fee_status.trim() || "Pending",
            enrolment_status: r.enrolment_status.trim() || "Active",
            validation_status: warned.has(r.rowNumber) ? "Flagged" : "Clean",
            upload_batch_id: batch.id,
            version: (previous?.version ?? 0) + 1,
            updated_by: input.actor.id,
          };
        }),
        { onConflict: "student_id,program_id" },
      )
      .select("id, student_id");
    if (enrolError) throw new Error(`Could not save enrolments: ${enrolError.message}`);
    const enrolmentOfStudent = new Map((saved ?? []).map((e) => [e.student_id, e.id]));
    part.forEach((r) => enrolmentOfRow.set(r.rowNumber, enrolmentOfStudent.get(idOfHash.get(hashOf.get(r.apaar_id.trim())!)!)!));
  }

  for (const part of chunked(result.issues, 500)) {
    const { error } = await admin.from("validation_issues").insert(
      part.map((issue: Issue) => ({ ...toStoredIssue(issue), institution_id: input.institutionId, batch_id: batch.id, enrolment_id: enrolmentOfRow.get(issue.rowNumber) ?? null })),
    );
    if (error) throw new Error(`Could not save issues: ${error.message}`);
  }

  const { data: institution } = await admin.from("institutions").select("name").eq("id", input.institutionId).single();
  const name = institution?.name ?? "An institution";
  const count = (code: string) => result.issues.filter((i) => i.code === code).length;
  const commonAlert = { institutionId: input.institutionId, programId: program.id };
  if (count("OVER_INTAKE")) {
    const payload = { program_id: program.id, rows_blocked: count("OVER_INTAKE"), approved_intake: program.approved_intake };
    await raiseAlert(admin, { ...commonAlert, code: "OVER_INTAKE", title: "Admissions over approved intake", message: `${name} tried to admit ${count("OVER_INTAKE")} students past the approved intake of ${program.approved_intake} in ${program.name}.`, meta: payload, webhook: { event: "over_intake", payload } });
  }
  if (count("OVER_SUPERNUMERARY")) {
    await raiseAlert(admin, { ...commonAlert, code: "OVER_SUPERNUMERARY", title: "Supernumerary cap exceeded", message: `${name} tried to admit ${count("OVER_SUPERNUMERARY")} students past the supernumerary cap in ${program.name}.`, meta: { rows_blocked: count("OVER_SUPERNUMERARY") } });
  }
  if (count("OVER_QUOTA")) {
    const payload = { program_id: program.id, rows_blocked: count("OVER_QUOTA") };
    await raiseAlert(admin, { ...commonAlert, code: "OVER_QUOTA", title: "Quota seats exceeded", message: `${name} tried to admit ${count("OVER_QUOTA")} students past a quota limit in ${program.name}.`, meta: payload, webhook: { event: "over_quota", payload } });
  }

  // Only rows that were actually admitted become cross-institution matches.
  const crossRows = result.issues.filter((i) => i.code === "CROSS_INST_DUP" && enrolmentOfRow.has(i.rowNumber));
  for (const issue of crossRows) {
    const enrolmentB = enrolmentOfRow.get(issue.rowNumber)!;
    const { data: mine } = await admin.from("enrolments").select("student_id").eq("id", enrolmentB).single();
    const { data: other } = await admin.from("enrolments").select("id, institution_id").eq("student_id", mine?.student_id ?? "").eq("enrolment_status", "Active").neq("institution_id", input.institutionId).limit(1).maybeSingle();
    const row = rows.find((r) => r.rowNumber === issue.rowNumber)!;
    if (other) {
      await admin.from("cross_matches").upsert({ apaar_hash: hashOf.get(row.apaar_id.trim()), enrolment_a: other.id, enrolment_b: enrolmentB, status: "Open" }, { onConflict: "enrolment_a,enrolment_b" });
    }
  }
  if (crossRows.length) {
    await raiseAlert(admin, { ...commonAlert, severity: "Warning", code: "CROSS_INST_DUP", title: "Student active at two institutions", message: `${crossRows.length} student(s) uploaded by ${name} already have an active enrolment elsewhere.`, meta: { count: crossRows.length }, webhook: { event: "cross_match", payload: { program_id: program.id, count: crossRows.length, notice: "Possible existing enrolment elsewhere. Contact AICTE." } } });
  }

  await appendAudit(admin, { ...auditBase, action: "upload.submit", entity: "upload_batch", entityId: batch.id, meta: { rows: rows.length, created, updated, blocked: result.stats.blockedRows, fixes_applied: input.fixes?.length ?? 0, fixes_by_rule: tally(input.fixes?.map((f) => f.code) ?? []) } });
  await appendAudit(admin, { ...auditBase, action: "validation.outcome", entity: "upload_batch", entityId: batch.id, meta: { rows: rows.length, errors: result.stats.errors, warnings: result.stats.warnings, by_rule: result.stats.byRule, stage: "submit" } });

  invalidateAggregates();
  return { ...result, batchId: batch.id, created, updated };
}

function tally(values: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  values.forEach((v) => (out[v] = (out[v] ?? 0) + 1));
  return out;
}
