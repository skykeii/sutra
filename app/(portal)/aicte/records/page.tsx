import Link from "next/link";
import { Reveal } from "@/app/(portal)/aicte/records/reveal";
import { ActionButton } from "@/components/action-button";
import { DataTable, FilterBar, firstParam, Pager, PageHeader, StatusBadge } from "@/components/shared";
import { requireRole } from "@/lib/auth/session";
import { decryptField } from "@/lib/crypto";
import { maskEmail, maskMobile } from "@/lib/mask";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata = { title: "Verify records" };
const SIZE = 25;

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await requireRole(["aicte_admin", "aicte_officer"]);
  const sp = await searchParams;
  const page = Math.max(1, Number(firstParam(sp.page)) || 1);
  const status = firstParam(sp.status) || "Clean";
  const institution = firstParam(sp.institution);
  const supabase = await createServerSupabase();
  const { data: institutions } = await supabase.from("institutions").select("id, name").order("name");
  let query = supabase
    .from("enrolments")
    .select("id, validation_status, quota_type, admission_date, institutions(name), programs(name), students(id, name, mobile_enc, email_enc)")
    .eq("validation_status", status)
    .eq("enrolment_status", "Active")
    .order("created_at", { ascending: false })
    .range((page - 1) * SIZE, page * SIZE);
  if (institution) query = query.eq("institution_id", institution);
  const { data } = await query;
  const rows = (data ?? []).map((e) => {
    const s = e.students as unknown as { id: string; name: string; mobile_enc: string | null; email_enc: string | null };
    return {
      ...e,
      studentId: s.id,
      name: s.name,
      mobile: s.mobile_enc ? maskMobile(decryptField(s.mobile_enc)) : "",
      email: s.email_enc ? maskEmail(decryptField(s.email_enc)) : "",
      institution: (e.institutions as unknown as { name: string }).name,
      program: (e.programs as unknown as { name: string }).name,
    };
  });
  const shown = rows.slice(0, SIZE);
  const canVerify = status === "Clean" || status === "Flagged";
  return (
    <div className="space-y-4">
      <PageHeader title="Verify records" description="Records AICTE verifies get a digitally signed credential with a QR code. Contact details stay masked; each reveal is audited." actions={canVerify && shown.length > 0 ? <ActionButton url="/api/app/aicte/verify-records" body={{ enrolmentIds: shown.map((r) => r.id) }} done="Verified" confirm={`Verify all ${shown.length} records on this page and issue their credentials?`}>Verify this page</ActionButton> : undefined} />
      <FilterBar action="/aicte/records" values={{ status, institution }} fields={[
        { name: "status", label: "Check status", options: ["Clean", "Flagged", "Pending", "Verified", "Revoked"].map((v) => ({ value: v, label: v })) },
        { name: "institution", label: "Institution", options: (institutions ?? []).map((i) => ({ value: i.id, label: i.name })) },
      ]} />
      <DataTable rows={shown} rowKey={(r) => r.id} empty="No records with this status. Try another filter." columns={[
        { key: "name", header: "Student" },
        { key: "institution", header: "Institution" },
        { key: "program", header: "Program" },
        { key: "quota_type", header: "Quota" },
        { key: "mobile", header: "Mobile", render: (r) => <Reveal studentId={r.studentId} field="mobile" masked={r.mobile} canReveal={profile.role === "aicte_admin"} /> },
        { key: "email", header: "Email", render: (r) => <Reveal studentId={r.studentId} field="email" masked={r.email} canReveal={profile.role === "aicte_admin"} /> },
        { key: "status", header: "Status", render: (r) => <StatusBadge status={r.validation_status} /> },
        { key: "act", header: "Action", render: (r) => canVerify ? <ActionButton size="sm" variant="outline" url="/api/app/aicte/verify-records" body={{ enrolmentIds: [r.id] }}>Verify</ActionButton> : r.validation_status === "Verified" ? <Link className="text-primary underline" href="/aicte/approvals">Revoke</Link> : null },
      ]} />
      <Pager page={page} hasNext={rows.length > SIZE} path="/aicte/records" query={{ status, institution }} />
    </div>
  );
}
