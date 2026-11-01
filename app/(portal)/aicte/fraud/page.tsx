import { ScanSearch } from "lucide-react";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { LiveRefresh } from "@/components/live";
import { DataTable, FilterBar, firstParam, fmtDateTime, PageHeader, Section, StatusBadge } from "@/components/shared";
import { aiLabel, type ProviderName } from "@/lib/ai/provider";
import { requireRole } from "@/lib/auth/session";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata = { title: "Fraud patterns" };

const severity = (n: number) => (n >= 10 ? "Error" : n >= 5 ? "Warning" : "Info");
const maskedToken = (id: string) => `Student#${parseInt(id.replace(/-/g, "").slice(0, 4), 16)}`;
const LABELS: Record<string, string> = { SHARED_MOBILE: "Shared mobile", SHARED_EMAIL: "Shared email", SHARED_ADDRESS: "Shared address", MULTI_FULLTIME: "Two full-time programs", CATEGORY_SPIKE: "Category spike", ADMISSION_SURGE: "Last-minute surge" };
const NEXT: Record<string, string[]> = { Open: ["Under review"], "Under review": ["Cleared", "Escalated"], Cleared: ["Open"], Escalated: ["Open"] };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole(["aicte_admin", "aicte_officer"]);
  const sp = await searchParams;
  const status = firstParam(sp.status);
  const open = firstParam(sp.cluster);
  const supabase = await createServerSupabase();
  let q = supabase.from("fraud_clusters").select("id, cluster_type, member_count, explanation, explained_by, status, created_at, institution_id, member_ids, institutions(name)").order("member_count", { ascending: false });
  if (status) q = q.eq("status", status);
  const { data } = await q;
  const rows = data ?? [];
  const cluster = rows.find((c) => c.id === open);
  const explainedBy = rows.find((c) => c.explained_by)?.explained_by as ProviderName | undefined;
  const { data: members } = cluster?.member_ids.length
    ? await supabase.from("enrolments").select("id, student_id, enrolment_status, validation_status, institutions(name), programs(name)").in("student_id", cluster.member_ids.slice(0, 100))
    : { data: [] };
  return (
    <div className="space-y-5">
      <PageHeader title="Fraud patterns" description="Patterns found by comparing keyed hashes and counts. Each one is a lead for a person to review, not proof of fraud." actions={
        <span className="flex items-center gap-3">
          <LiveRefresh tables={["fraud_clusters"]} />
          <ActionButton url="/api/app/fraud" body={{ action: "run" }} done="Detection finished"><ScanSearch className="h-4 w-4" aria-hidden />Run detection now</ActionButton>
        </span>
      } />
      <p className="w-fit rounded-full border px-2.5 py-0.5 text-xs font-semibold" title="Who wrote the explanations below">{aiLabel(explainedBy ?? "none")}</p>
      <FilterBar action="/aicte/fraud" values={{ status }} fields={[{ name: "status", label: "Status", options: ["Open", "Under review", "Cleared", "Escalated"].map((v) => ({ value: v, label: v })) }]} />
      <DataTable rows={rows} rowKey={(r) => r.id} empty="No patterns found. Run detection to check again." columns={[
        { key: "type", header: "Pattern", render: (r) => <Link className="font-medium text-primary underline" href={`/aicte/fraud?cluster=${r.id}`}>{LABELS[r.cluster_type] ?? r.cluster_type}</Link> },
        { key: "severity", header: "Severity", render: (r) => <StatusBadge status={severity(r.member_count)} /> },
        { key: "member_count", header: "Students", align: "right" },
        { key: "institution", header: "Institution", render: (r) => (r.institutions as unknown as { name: string } | null)?.name ?? "Across institutions" },
        { key: "explanation", header: "Why it stands out" },
        { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
        { key: "act", header: "Move to", render: (r) => <span className="flex flex-wrap gap-1">{(NEXT[r.status] ?? []).map((s) => <ActionButton key={s} size="sm" variant="outline" url="/api/app/fraud" body={{ action: "status", id: r.id, status: s }}>{s}</ActionButton>)}</span> },
      ]} />
      {cluster && (
        <Section title={`${LABELS[cluster.cluster_type]}: ${cluster.member_count} students`} description={`First seen ${fmtDateTime(cluster.created_at)}. Student identities stay masked here.`} actions={<Link className="text-sm text-primary underline" href="/aicte/fraud">Close</Link>}>
          <DataTable rows={members ?? []} rowKey={(r) => r.id} empty="No active enrolments for these students." columns={[
            { key: "student", header: "Student", render: (r) => <code className="text-xs">{maskedToken(r.student_id)}</code> },
            { key: "institution", header: "Institution", render: (r) => (r.institutions as unknown as { name: string }).name },
            { key: "program", header: "Program", render: (r) => (r.programs as unknown as { name: string }).name },
            { key: "enrolment", header: "Enrolment", render: (r) => <StatusBadge status={r.enrolment_status} /> },
            { key: "checks", header: "Checks", render: (r) => <StatusBadge status={r.validation_status} /> },
          ]} />
        </Section>
      )}
    </div>
  );
}
