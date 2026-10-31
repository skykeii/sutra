import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { LiveRefresh } from "@/components/live";
import { DataTable, FilterBar, firstParam, fmtDateTime, Pager, PageHeader, StatusBadge } from "@/components/shared";
import { requireRole } from "@/lib/auth/session";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata = { title: "Alerts" };
const SIZE = 40;

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole(["aicte_admin", "aicte_officer"]);
  const sp = await searchParams;
  const page = Math.max(1, Number(firstParam(sp.page)) || 1);
  const status = firstParam(sp.status);
  const code = firstParam(sp.code);
  const supabase = await createServerSupabase();
  let query = supabase.from("alerts").select("id, code, severity, title, message, status, created_at, institution_id, institutions(name)").order("created_at", { ascending: false }).range((page - 1) * SIZE, page * SIZE);
  if (status) query = query.eq("status", status);
  if (code) query = query.eq("code", code);
  const { data } = await query;
  const rows = (data ?? []).map((a) => ({ ...a, institution: (a.institutions as unknown as { name: string } | null)?.name ?? "" }));
  const codes = ["OVER_INTAKE", "OVER_QUOTA", "OVER_SUPERNUMERARY", "QUOTA_NO_ALLOTMENT", "CROSS_INST_DUP", "SHARED_MOBILE", "MARKS_MISMATCH", "SCHOLARSHIP_DUP_CLAIM", "SCHOLARSHIP_INELIGIBLE", "BULK_SCRAPE"];
  return (
    <div className="space-y-4">
      <PageHeader title="Alerts" description="Everything the checks have raised for AICTE." actions={<LiveRefresh tables={["alerts"]} />} />
      <FilterBar action="/aicte/alerts" values={{ status, code }} fields={[
        { name: "status", label: "Status", options: ["Open", "Acknowledged", "Resolved"].map((v) => ({ value: v, label: v })) },
        { name: "code", label: "Type", options: codes.map((v) => ({ value: v, label: v })) },
      ]} />
      <DataTable rows={rows.slice(0, SIZE)} rowKey={(r) => r.id} empty="No alerts match these filters." columns={[
        { key: "title", header: "Alert", render: (r) => <><p className="font-medium">{r.title}</p><p className="text-xs text-muted-foreground">{r.message}</p></> },
        { key: "institution", header: "Institution", render: (r) => r.institution_id ? <Link className="text-primary underline" href={`/aicte/institutions/${r.institution_id}`}>{r.institution}</Link> : "" },
        { key: "code", header: "Type", render: (r) => <code className="text-xs">{r.code}</code> },
        { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
        { key: "created_at", header: "When", render: (r) => fmtDateTime(r.created_at) },
        { key: "actions", header: "Actions", render: (r) => r.status === "Resolved" ? null : (
          <span className="flex flex-wrap gap-1">
            {r.status === "Open" && <ActionButton size="sm" variant="outline" url={`/api/app/alerts/${r.id}`} body={{ status: "Acknowledged" }}>Acknowledge</ActionButton>}
            <ActionButton size="sm" variant="outline" url={`/api/app/alerts/${r.id}`} body={{ status: "Resolved" }}>Resolve</ActionButton>
          </span>
        ) },
      ]} />
      <Pager page={page} hasNext={rows.length > SIZE} path="/aicte/alerts" query={{ status, code }} />
    </div>
  );
}
