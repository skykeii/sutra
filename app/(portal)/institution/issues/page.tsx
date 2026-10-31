import Link from "next/link";
import { DataTable, fmtDateTime, firstParam, FilterBar, Pager, PageHeader, StatusBadge } from "@/components/shared";
import { requireRole } from "@/lib/auth/session";
import { createServerSupabase } from "@/lib/supabase/server";
import { RULES } from "@/lib/validation/rules";

export const metadata = { title: "Issues" };
const SIZE = 50;

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole(["institution_admin", "institution_staff"]);
  const sp = await searchParams;
  const page = Math.max(1, Number(firstParam(sp.page)) || 1);
  const rule = firstParam(sp.rule);
  const severity = firstParam(sp.severity);
  const supabase = await createServerSupabase();
  let query = supabase.from("validation_issues").select("id, rule_code, severity, row_number, message, batch_id, created_at").eq("resolved", false).order("created_at", { ascending: false }).range((page - 1) * SIZE, page * SIZE);
  if (rule) query = query.eq("rule_code", rule);
  if (severity) query = query.eq("severity", severity);
  const { data } = await query;
  const rows = data ?? [];
  return (
    <div className="space-y-4">
      <PageHeader title="Issues" description="Open problems from your uploads. Re-upload a corrected file to clear them." />
      <FilterBar
        action="/institution/issues"
        values={{ rule, severity }}
        fields={[
          { name: "rule", label: "Rule", options: RULES.map((r) => ({ value: r.code, label: r.title })) },
          { name: "severity", label: "Severity", options: ["Error", "Warning"].map((s) => ({ value: s, label: s })) },
        ]}
      />
      <DataTable
        rows={rows.slice(0, SIZE)}
        rowKey={(r) => r.id}
        empty="No open issues. Nice work."
        columns={[
          { key: "rule_code", header: "Rule" },
          { key: "severity", header: "Severity", render: (r) => <StatusBadge status={r.severity} /> },
          { key: "message", header: "What it means" },
          { key: "row_number", header: "Row", align: "right" },
          { key: "batch_id", header: "Batch", render: (r) => <Link className="text-primary underline" href={`/institution/history/${r.batch_id}`}>Open</Link> },
          { key: "created_at", header: "When", render: (r) => fmtDateTime(r.created_at) },
        ]}
      />
      <Pager page={page} hasNext={rows.length > SIZE} path="/institution/issues" query={{ rule, severity }} />
    </div>
  );
}
