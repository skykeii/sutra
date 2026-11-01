import { AlertTriangle, ClipboardCheck, Upload } from "lucide-react";
import Link from "next/link";
import { LiveRefresh } from "@/components/live";
import { DataTable, fmtDateTime, KpiCard, Meter, PageHeader, Section, StatusBadge } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/session";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata = { title: "Institution dashboard" };

export default async function Page() {
  const profile = await requireRole(["institution_admin", "institution_staff"]);
  const supabase = await createServerSupabase();
  // These filters match what RLS already enforces. They let Postgres use an index instead of checking every row.
  const own = profile.institutionId!;
  const [institution, intake, quotas, labels, issues, overIssues, awaiting, certificateReady, batches] = await Promise.all([
    supabase.from("institutions").select("name, state").eq("id", profile.institutionId!).single(),
    supabase.from("v_intake_status").select("*").eq("institution_id", own).order("program_name"),
    supabase.from("v_quota_status").select("*").eq("institution_id", own),
    supabase.from("quota_labels").select("state, quota_type, label"),
    supabase.from("validation_issues").select("id", { head: true, count: "exact" }).eq("institution_id", own).eq("resolved", false),
    supabase.from("validation_issues").select("batch_id, rule_code, upload_batches(program_id)").eq("institution_id", own).eq("rule_code", "OVER_INTAKE").eq("resolved", false),
    supabase.from("enrolments").select("id", { head: true, count: "exact" }).eq("institution_id", own).in("validation_status", ["Clean", "Pending"]).eq("enrolment_status", "Active"),
    createAdminSupabase().from("credentials").select("id, enrolments!inner(institution_id)", { head: true, count: "exact" }).eq("enrolments.institution_id", own).eq("status", "Valid"),
    supabase.from("upload_batches").select("id, file_name, row_count, error_count, warning_count, status, created_at").eq("institution_id", own).order("created_at", { ascending: false }).limit(6),
  ]);
  const state = institution.data?.state ?? "";
  const label = (q: string) => (labels.data ?? []).find((l) => l.state === state && l.quota_type === q)?.label ?? q.replace("_", "-");
  const overPrograms = new Set((overIssues.data ?? []).map((i) => (i.upload_batches as unknown as { program_id: string } | null)?.program_id));
  return (
    <div className="space-y-5">
      <PageHeader title={institution.data?.name ?? "Your institution"} description="Approved intake against actual admissions, updated live." actions={
        <div className="flex items-center gap-3">
          <LiveRefresh tables={["enrolments", "validation_issues", "upload_batches"]} />
          <Button asChild><Link href="/institution/upload"><Upload className="h-4 w-4" aria-hidden />Upload students</Link></Button>
        </div>
      } />
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard label="Open issues" value={issues.count ?? 0} tone={issues.count ? "amber" : "green"} icon={AlertTriangle} hint="From your uploads" />
        <KpiCard label="Awaiting AICTE verification" value={awaiting.count ?? 0} icon={ClipboardCheck} />
        <KpiCard label="Certificate-ready verified records" value={certificateReady.count ?? 0} tone="green" icon={ClipboardCheck} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {(intake.data ?? []).map((p) => {
          const attempted = overPrograms.has(p.program_id);
          return (
            <Section key={p.program_id} title={p.program_name} description={`${p.level}, ${p.academic_year}`} actions={attempted ? <StatusBadge status="Error" title="An upload tried to go past the approved intake. AICTE has been alerted." /> : undefined}>
              <div className="space-y-2">
                <div className="text-lg font-semibold">{p.enrolled_regular} / {p.approved} filled</div>
                <Meter value={p.enrolled_regular} max={p.approved} label="Approved intake" tone={attempted || p.enrolled_regular > p.approved ? "red" : undefined} />
                {attempted && <p className="text-sm font-medium text-red-800">An upload tried to go past this intake. AICTE has been alerted.</p>}
                <Meter value={p.enrolled_supernumerary} max={p.supernumerary_cap} label="Supernumerary" />
                <div className="grid gap-2 pt-1 sm:grid-cols-2">
                  {(quotas.data ?? []).filter((q) => q.program_id === p.program_id && q.quota_type !== "SUPERNUMERARY").map((q) => (
                    <Meter key={q.quota_type} value={q.enrolled} max={q.seats_allowed} label={label(q.quota_type)} />
                  ))}
                </div>
              </div>
            </Section>
          );
        })}
      </div>
      <Section title="Recent uploads" actions={<Button asChild variant="outline" size="sm"><Link href="/institution/history">All uploads</Link></Button>}>
        <DataTable rows={batches.data ?? []} rowKey={(r) => r.id} empty="No uploads yet." columns={[
          { key: "file_name", header: "File", render: (r) => <Link className="text-primary underline" href={`/institution/history/${r.id}`}>{r.file_name}</Link> },
          { key: "created_at", header: "When", render: (r) => fmtDateTime(r.created_at) },
          { key: "row_count", header: "Rows", align: "right" },
          { key: "error_count", header: "Errors", align: "right" },
          { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
        ]} />
      </Section>
    </div>
  );
}
