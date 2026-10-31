import { z } from "zod";
import { appendAudit } from "@/lib/audit";
import { apiProfile } from "@/lib/auth/api";
import { certificatePdf, certificateZip, layoutSchema } from "@/lib/certificates";
import { verifyUrl } from "@/lib/credentials/service";
import { decryptField, hmacMatch } from "@/lib/crypto";
import { chunked } from "@/lib/db";
import { ApiError, fileResponse, readJson, route } from "@/lib/http";
import { createAdminSupabase } from "@/lib/supabase/admin";

const body = z.object({
  enrolmentIds: z.array(z.uuid()).max(100).default([]),
  apaarIds: z.array(z.string().trim().regex(/^\d{12}$/, "Each APAAR ID must have 12 digits")).max(100).default([]),
  layout: layoutSchema,
});

export const POST = route(async (req) => {
  const profile = await apiProfile(req, ["university_admin"]);
  const input = body.parse(await readJson(req));
  const admin = createAdminSupabase();
  const { data: university } = await admin.from("universities").select("name").eq("id", profile.universityId!).single();
  const { data: colleges } = await admin.from("institutions").select("id").eq("university_id", profile.universityId!);
  const collegeIds = (colleges ?? []).map((c) => c.id);

  const ids = [...input.enrolmentIds];
  for (const part of chunked(input.apaarIds.map(hmacMatch))) {
    const { data: students } = await admin.from("students").select("id").in("apaar_hash", part);
    const { data: enrolments } = await admin.from("enrolments").select("id").in("student_id", (students ?? []).map((s) => s.id)).in("institution_id", collegeIds).eq("enrolment_status", "Active");
    ids.push(...(enrolments ?? []).map((e) => e.id));
  }
  if (!ids.length) throw new ApiError(400, "NOTHING_SELECTED", "Choose at least one student from your affiliated colleges.");

  // Filtering by affiliated colleges keeps a university from printing another university's students.
  const { data: rows } = await admin
    .from("enrolments")
    .select("id, admission_date, institutions(name), programs(name, duration_years), students(id, name, apaar_id_enc), credentials(record_id, status)")
    .in("id", [...new Set(ids)].slice(0, 100))
    .in("institution_id", collegeIds);
  if (!rows?.length) throw new ApiError(404, "NOT_FOUND", "None of those students are at your affiliated colleges.");

  const items = await Promise.all(rows.map(async (e) => {
    const student = e.students as unknown as { id: string; name: string; apaar_id_enc: string };
    const program = e.programs as unknown as { name: string; duration_years: number };
    const credential = (e.credentials as unknown as { record_id: string; status: string }[]).find((c) => c.status === "Valid");
    const year = Number(e.admission_date.slice(0, 4));
    const code = `STU-${student.id.slice(0, 8).toUpperCase()}`;
    const pdf = await certificatePdf({
      name: student.name,
      apaarId: decryptField(student.apaar_id_enc),
      studentCode: code,
      program: program.name,
      institution: (e.institutions as unknown as { name: string }).name,
      university: university?.name ?? "University",
      year: `${year} to ${year + program.duration_years}`,
      qrUrl: credential ? verifyUrl(credential.record_id) : verifyUrl("none"),
    }, input.layout);
    return { fileName: `certificate_${code}.pdf`, pdf };
  }));
  await appendAudit(admin, { actorId: profile.userId, actorRole: profile.role, action: "certificate.generate", entity: "certificate_batch", meta: { count: items.length, layout: input.layout } });
  return fileResponse(new Uint8Array(await certificateZip(items)), "application/zip", "sutra_certificates.zip");
});
