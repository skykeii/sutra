import { notFound } from "next/navigation";
import { StudentForm } from "@/app/(portal)/institution/students/student-form";
import { DataTable, fmtDateTime, PageHeader, Section } from "@/components/shared";
import { appendAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/session";
import { decryptField } from "@/lib/crypto";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { emptyRow } from "@/lib/validation/columns";

export const metadata = { title: "Student record" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireRole(["institution_admin", "institution_staff"]);
  const { id } = await params;
  const supabase = await createServerSupabase();
  // RLS proves this enrolment belongs to the signed-in institution before anything is decrypted.
  const { data: enrolment } = await supabase
    .from("enrolments")
    .select("id, program_id, admission_date, admission_category, quota_type, counselling_allotment_no, fee_status, enrolment_status, version, students(apaar_id_enc, name, dob, gender, nationality, is_nri, oci_status, is_foreign_national, passport_no_enc, mobile_enc, email_enc, prev_qualification, prev_marks_pct, prev_pass_year)")
    .eq("id", id)
    .maybeSingle();
  if (!enrolment) notFound();
  const s = enrolment.students as unknown as Record<string, string | number | boolean | null>;
  const dec = (v: unknown) => (typeof v === "string" && v ? decryptField(v) : "");
  const text = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  const initial = {
    ...emptyRow(),
    apaar_id: dec(s.apaar_id_enc),
    name: text(s.name),
    dob: text(s.dob),
    gender: text(s.gender),
    nationality: text(s.nationality),
    admission_date: enrolment.admission_date,
    admission_category: enrolment.admission_category,
    quota_type: enrolment.quota_type,
    counselling_allotment_no: text(enrolment.counselling_allotment_no),
    is_nri: text(s.is_nri),
    oci_status: text(s.oci_status),
    is_foreign_national: text(s.is_foreign_national),
    passport_no: dec(s.passport_no_enc),
    mobile: dec(s.mobile_enc),
    email: dec(s.email_enc),
    prev_qualification: text(s.prev_qualification),
    prev_marks_pct: text(s.prev_marks_pct),
    prev_pass_year: text(s.prev_pass_year),
    fee_status: enrolment.fee_status,
    enrolment_status: enrolment.enrolment_status,
  };
  await appendAudit(createAdminSupabase(), { actorId: profile.userId, actorRole: profile.role, action: "student.view", entity: "enrolment", entityId: id, meta: { purpose: "edit" } });
  const { data: programs } = await supabase.from("programs").select("id, name").order("name");
  const { data: history } = await supabase.from("enrolment_history").select("id, created_at, before, after").eq("enrolment_id", id).order("created_at", { ascending: false }).limit(20);
  const changes = (history ?? []).map((h) => {
    const before = h.before as Record<string, unknown>;
    const after = h.after as Record<string, unknown>;
    const fields = Object.keys(after).filter((k) => !["updated_at", "created_at", "version", "updated_by", "upload_batch_id"].includes(k) && JSON.stringify(before[k]) !== JSON.stringify(after[k]));
    return { id: h.id, when: h.created_at, fields: fields.join(", ") || "Re-submitted" };
  });
  return (
    <div className="space-y-4">
      <PageHeader title={String(s.name)} description={`Record version ${enrolment.version}. Saving creates a new version and keeps a history entry.`} />
      <StudentForm programs={programs ?? []} initial={initial} programId={enrolment.program_id} editing />
      <Section title="Change history">
        <DataTable rows={changes} rowKey={(r) => r.id} empty="This record has not been changed." columns={[{ key: "when", header: "When", render: (r) => fmtDateTime(r.when) }, { key: "fields", header: "Fields changed" }]} />
      </Section>
    </div>
  );
}
