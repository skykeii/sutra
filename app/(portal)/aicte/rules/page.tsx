import Link from "next/link";
import { AddRule, RULE_LABELS, RuleValue } from "@/app/(portal)/aicte/rules/rule-forms";
import { DataTable, PageHeader, Section } from "@/components/shared";
import { requireRole } from "@/lib/auth/session";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata = { title: "Eligibility rules" };

export default async function Page() {
  const profile = await requireRole(["aicte_admin", "aicte_officer"]);
  const canEdit = profile.role === "aicte_admin";
  const supabase = await createServerSupabase();
  const [{ data: rules }, { data: programs }] = await Promise.all([
    supabase.from("eligibility_rules").select("id, level, program_id, rule_type, params, programs(name, institutions(name))").order("level"),
    supabase.from("programs").select("id, name, institutions(name)").order("name"),
  ]);
  const rows = (rules ?? []).map((r) => {
    const params = r.params as Record<string, unknown>;
    const program = r.programs as unknown as { name: string; institutions: { name: string } } | null;
    return { ...r, value: String(params.min ?? params.max ?? params.stream ?? ""), target: program ? `${program.institutions.name}: ${program.name}` : `All ${r.level} programs` };
  });
  return (
    <div className="space-y-5">
      <PageHeader title="Eligibility rules" description="Checked against verified university marks each time an enrolment is validated. A program-specific rule overrides the level rule." />
      <p className="text-sm">The full list of checks is on the <Link className="text-primary underline" href="/docs/rules">validation rules page</Link>.</p>
      <Section title="Current rules">
        <DataTable rows={rows} rowKey={(r) => r.id} empty="No rules set." columns={[
          { key: "target", header: "Applies to" },
          { key: "rule", header: "Rule", render: (r) => RULE_LABELS[r.rule_type] ?? r.rule_type },
          { key: "value", header: "Value", render: (r) => <RuleValue key={r.value} id={r.id} level={r.level} programId={r.program_id} ruleType={r.rule_type} value={r.value} canEdit={canEdit} /> },
        ]} />
      </Section>
      {canEdit && <Section title="Add a rule"><AddRule programs={(programs ?? []).map((p) => ({ id: p.id, label: `${(p.institutions as unknown as { name: string }).name}: ${p.name}` }))} /></Section>}
    </div>
  );
}
