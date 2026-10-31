import { notFound } from "next/navigation";
import { DataTable, fmtDateTime, KpiCard, PageHeader, PipelineStepper, Section, StatusBadge } from "@/components/shared";
import { requireRole } from "@/lib/auth/session";
import { fetchAll } from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { RULE_BY_CODE } from "@/lib/validation/rules";

export const metadata = { title: "Batch results" };
const STEPS = ["Uploaded", "APAAR validated", "Rules checked", "Verified", "In AICTE repository"];

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["institution_admin", "institution_staff"]);
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: batch } = await supabase.from("upload_batches").select("id, file_name, row_count, error_count, warning_count, status, created_at, programs(name)").eq("id", id).maybeSingle();
  if (!batch) notFound();
  const issues = await fetchAll<{ id: string; rule_code: string; severity: string; row_number: number | null; message: string; resolved: boolean }>((from, to) =>
    supabase.from("validation_issues").select("id, rule_code, severity, row_number, message, resolved").eq("batch_id", id).order("row_number").range(from, to),
  );
  const enrolments = await fetchAll<{ validation_status: string }>((from, to) => supabase.from("enrolments").select("validation_status").eq("upload_batch_id", id).range(from, to));
  const verified = enrolments.filter((e) => e.validation_status === "Verified").length;
  const current = batch.status === "Rejected" ? 2 : enrolments.length && verified === enrolments.length ? 5 : verified ? 4 : 3;
  const byRule = new Map<string, { code: string; severity: string; count: number }>();
  issues.forEach((i) => {
    const entry = byRule.get(i.rule_code) ?? { code: i.rule_code, severity: i.severity, count: 0 };
    entry.count += 1;
    byRule.set(i.rule_code, entry);
  });
  return (
    <div className="space-y-4">
      <PageHeader title={batch.file_name} description={`${(batch.programs as unknown as { name: string } | null)?.name ?? ""}, submitted ${fmtDateTime(batch.created_at)}`} actions={<StatusBadge status={batch.status} />} />
      <PipelineStepper steps={STEPS} current={current} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Rows in file" value={batch.row_count} />
        <KpiCard label="Records saved" value={enrolments.length} tone="green" />
        <KpiCard label="Errors" value={batch.error_count} tone={batch.error_count ? "red" : undefined} />
        <KpiCard label="Warnings" value={batch.warning_count} tone={batch.warning_count ? "amber" : undefined} />
      </div>
      <Section title="Counts by rule">
        <DataTable
          rows={[...byRule.values()].sort((a, b) => b.count - a.count)}
          rowKey={(r) => r.code}
          empty="No issues in this batch."
          columns={[
            { key: "code", header: "Rule", render: (r) => <span title={RULE_BY_CODE.get(r.code)?.description}>{RULE_BY_CODE.get(r.code)?.title ?? r.code}</span> },
            { key: "severity", header: "Severity", render: (r) => <StatusBadge status={r.severity} /> },
            { key: "count", header: "Count", align: "right" },
          ]}
        />
      </Section>
      <Section title="Issues" description="Stored without student values. See the error report from the upload for row details.">
        <DataTable
          rows={issues.slice(0, 200)}
          rowKey={(r) => r.id}
          empty="No issues in this batch."
          columns={[
            { key: "row_number", header: "Row", align: "right" },
            { key: "rule_code", header: "Rule" },
            { key: "severity", header: "Severity", render: (r) => <StatusBadge status={r.severity} /> },
            { key: "message", header: "What it means" },
          ]}
        />
      </Section>
    </div>
  );
}
