import Link from "next/link";
import { DataTable, ExportMenu, FilterBar, firstParam, Pager, PageHeader, Section } from "@/components/shared";
import { requireRole } from "@/lib/auth/session";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata = { title: "Quota audit" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole(["aicte_admin", "aicte_officer"]);
  const sp = await searchParams;
  const state = firstParam(sp.state);
  const page = Math.max(1, Number(firstParam(sp.page)) || 1);
  const supabase = await createServerSupabase();
  const [quotas, institutions, noAllotment, labels] = await Promise.all([
    supabase.from("v_quota_status").select("*"),
    supabase.from("institutions").select("id, name, state"),
    supabase.from("enrolments").select("id, institution_id, programs(name)").eq("quota_type", "CONVENOR").eq("enrolment_status", "Active").is("counselling_allotment_no", null),
    supabase.from("quota_labels").select("state, quota_type, label"),
  ]);
  const instById = new Map((institutions.data ?? []).map((i) => [i.id, i]));
  const labelFor = (s: string, q: string) => (labels.data ?? []).find((l) => l.state === s && l.quota_type === q)?.label ?? q.replace("_", "-");
  const rows = (quotas.data ?? [])
    .map((q) => ({ ...q, institution: instById.get(q.institution_id) }))
    .filter((q) => q.enrolled > 0 && (!state || q.institution?.state === state))
    .sort((a, b) => b.enrolled / Math.max(1, b.seats_allowed) - a.enrolled / Math.max(1, a.seats_allowed));
  const over = rows.filter((r) => r.over_quota);
  const columns = [
    { key: "institution", header: "Institution", render: (r: (typeof rows)[number]) => <Link className="text-primary underline" href={`/aicte/institutions/${r.institution_id}`}>{r.institution?.name}</Link> },
    { key: "state", header: "State", render: (r: (typeof rows)[number]) => r.institution?.state },
    { key: "program_name", header: "Program" },
    { key: "quota", header: "Quota", render: (r: (typeof rows)[number]) => labelFor(r.institution?.state ?? "", r.quota_type) },
    { key: "seats_allowed", header: "Allowed", align: "right" as const },
    { key: "enrolled", header: "Admitted", align: "right" as const, render: (r: (typeof rows)[number]) => <span className={r.over_quota ? "font-semibold text-red-700" : ""}>{r.enrolled}</span> },
  ];
  return (
    <div className="space-y-4">
      <PageHeader title="Quota audit" description="Convenor and non-convenor seats checked against each program's seat matrix. Labels follow each state's own naming." actions={<ExportMenu template="quota-audit" query={{ state }} />} />
      <FilterBar action="/aicte/quota" values={{ state }} fields={[{ name: "state", label: "State", options: [...new Set((institutions.data ?? []).map((i) => i.state))].sort().map((v) => ({ value: v, label: v })) }]} />
      <Section title="Quotas over their limit" description="These can be over even when overall intake looks fine.">
        <DataTable rows={over} rowKey={(r) => `${r.program_id}${r.quota_type}`} empty="No quota is over its limit." columns={columns} />
      </Section>
      <Section title="Convenor seats without a counselling allotment">
        <DataTable rows={(noAllotment.data ?? []).filter((r) => !state || instById.get(r.institution_id)?.state === state)} rowKey={(r) => r.id} empty="Every Convenor admission has an allotment number." columns={[
          { key: "institution", header: "Institution", render: (r) => <Link className="text-primary underline" href={`/aicte/institutions/${r.institution_id}`}>{instById.get(r.institution_id)?.name}</Link> },
          { key: "program", header: "Program", render: (r) => (r.programs as unknown as { name: string }).name },
        ]} />
      </Section>
      <Section title="All quotas, fullest first">
        <DataTable rows={rows.slice((page - 1) * 50, page * 50)} rowKey={(r) => `${r.program_id}${r.quota_type}`} columns={columns} />
        <Pager page={page} hasNext={rows.length > page * 50} path="/aicte/quota" query={{ state }} />
      </Section>
    </div>
  );
}
