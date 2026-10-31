import { notFound } from "next/navigation";
import { DataTable, fmtDateTime, Meter, PageHeader, Section, StatusBadge } from "@/components/shared";
import { requireRole } from "@/lib/auth/session";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata = { title: "Institution" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["aicte_admin", "aicte_officer"]);
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: institution } = await supabase.from("institutions").select("name, aicte_id, state, district, type").eq("id", id).maybeSingle();
  if (!institution) notFound();
  const [intake, quotas, alerts, batches] = await Promise.all([
    supabase.from("v_intake_status").select("*").eq("institution_id", id).order("program_name"),
    supabase.from("v_quota_status").select("*").eq("institution_id", id),
    supabase.from("alerts").select("id, title, message, status, severity, created_at").eq("institution_id", id).order("created_at", { ascending: false }).limit(10),
    supabase.from("upload_batches").select("id, file_name, row_count, error_count, warning_count, status, created_at").eq("institution_id", id).order("created_at", { ascending: false }).limit(10),
  ]);
  return (
    <div className="space-y-4">
      <PageHeader title={institution.name} description={`${institution.district}, ${institution.state}. AICTE ID ${institution.aicte_id}.`} />
      <div className="grid gap-4 lg:grid-cols-2">
        {(intake.data ?? []).map((p) => (
          <Section key={p.program_id} title={p.program_name} description={`${p.level}, ${p.academic_year}`}>
            <div className="space-y-2">
              <Meter label="Regular admissions" value={p.enrolled_regular} max={p.approved} />
              <Meter label="Supernumerary" value={p.enrolled_supernumerary} max={p.supernumerary_cap} />
              {(quotas.data ?? []).filter((q) => q.program_id === p.program_id).map((q) => (
                <Meter key={q.quota_type} label={q.quota_type.replace("_", "-")} value={q.enrolled} max={q.seats_allowed} />
              ))}
            </div>
          </Section>
        ))}
      </div>
      <Section title="Alerts">
        <DataTable rows={alerts.data ?? []} rowKey={(r) => r.id} empty="No alerts for this institution." columns={[
          { key: "title", header: "Alert" }, { key: "message", header: "Detail" },
          { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
          { key: "created_at", header: "When", render: (r) => fmtDateTime(r.created_at) },
        ]} />
      </Section>
      <Section title="Uploads">
        <DataTable rows={batches.data ?? []} rowKey={(r) => r.id} empty="This institution has not submitted anything yet." columns={[
          { key: "file_name", header: "File" }, { key: "row_count", header: "Rows", align: "right" }, { key: "error_count", header: "Errors", align: "right" }, { key: "warning_count", header: "Warnings", align: "right" },
          { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
          { key: "created_at", header: "When", render: (r) => fmtDateTime(r.created_at) },
        ]} />
      </Section>
    </div>
  );
}
