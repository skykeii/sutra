import { ActionButton } from "@/components/action-button";
import { DataTable, ExportMenu, fmtDateTime, PageHeader, StatusBadge } from "@/components/shared";
import { requireRole } from "@/lib/auth/session";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata = { title: "Cross-institution duplicates" };

interface Side { admission_date: string; institutions: { name: string; state: string }; programs: { name: string } }

export default async function Page() {
  await requireRole(["aicte_admin", "aicte_officer"]);
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("cross_matches")
    .select("id, apaar_hash, status, created_at, a:enrolments!cross_matches_enrolment_a_fkey(admission_date, institutions(name, state), programs(name)), b:enrolments!cross_matches_enrolment_b_fkey(admission_date, institutions(name, state), programs(name))")
    .order("created_at", { ascending: false });
  const rows = (data ?? []).map((m) => ({ ...m, a: m.a as unknown as Side, b: m.b as unknown as Side }));
  const side = (s: Side) => <><p className="font-medium">{s.institutions.name}</p><p className="text-xs text-muted-foreground">{s.programs.name}, {s.institutions.state}. Admitted {s.admission_date}.</p></>;
  return (
    <div className="space-y-4">
      <PageHeader title="Cross-institution duplicates" description="One APAAR ID active at two institutions, found by comparing keyed hashes only. Only AICTE sees both sides; institutions get a generic notice." actions={<ExportMenu template="cross-duplicates" />} />
      <DataTable rows={rows} rowKey={(r) => r.id} empty="No cross-institution matches found." columns={[
        { key: "hash", header: "Student key", render: (r) => <code className="text-xs" title="Start of the keyed hash. Not reversible.">{r.apaar_hash.slice(0, 12)}…</code> },
        { key: "a", header: "Enrolled at", render: (r) => side(r.a) },
        { key: "b", header: "Also enrolled at", render: (r) => side(r.b) },
        { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
        { key: "created_at", header: "Found", render: (r) => fmtDateTime(r.created_at) },
        { key: "act", header: "Action", render: (r) => r.status === "Open" ? <ActionButton size="sm" variant="outline" url={`/api/app/duplicates/${r.id}`}>Mark resolved</ActionButton> : null },
      ]} />
    </div>
  );
}
