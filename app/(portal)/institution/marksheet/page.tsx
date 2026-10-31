import { MarksheetForm } from "@/components/marksheet-form";
import { DataTable, EmptyState, firstParam, fmtDateTime, PageHeader, Section, StatusBadge } from "@/components/shared";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/session";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata = { title: "Marksheet check" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole(["institution_admin", "institution_staff"]);
  const q = (firstParam((await searchParams).q) ?? "").trim().replace(/[%_,()]/g, "");
  const supabase = await createServerSupabase();
  let list = supabase.from("enrolments").select("id, programs(name), students!inner(name)").eq("enrolment_status", "Active").limit(100);
  if (q) list = list.ilike("students.name", `%${q}%`);
  const [{ data: enrolments }, { data: checks }] = await Promise.all([
    list,
    supabase.from("marksheet_submissions").select("id, semester, claimed_pct, verified_pct, outcome, created_at, students(name)").order("created_at", { ascending: false }).limit(25),
  ]);
  const options = (enrolments ?? []).map((e) => ({ id: e.id, label: `${(e.students as unknown as { name: string }).name}, ${(e.programs as unknown as { name: string }).name}` }));
  return (
    <div className="space-y-5">
      <PageHeader title="Marksheet check" description="Compare a student's claimed marks with the university's published record." />
      <Section title="Check a student's marks">
        <form method="get" className="mb-4 flex max-w-md gap-2">
          <Input name="q" aria-label="Find a student" placeholder="Find a student by name" defaultValue={q} />
          <Button type="submit" variant="outline">Find</Button>
        </form>
        {options.length ? <MarksheetForm enrolments={options} /> : <EmptyState>No active students match that name.</EmptyState>}
      </Section>
      <Section title="Recent checks">
        <DataTable rows={checks ?? []} rowKey={(r) => r.id} empty="No checks yet." columns={[
          { key: "student", header: "Student", render: (r) => (r.students as unknown as { name: string }).name },
          { key: "semester", header: "Semester", align: "right" },
          { key: "claimed_pct", header: "Claimed %", align: "right" },
          { key: "verified_pct", header: "University %", align: "right", render: (r) => r.verified_pct ?? "Not published" },
          { key: "outcome", header: "Outcome", render: (r) => <StatusBadge status={r.outcome} /> },
          { key: "created_at", header: "When", render: (r) => fmtDateTime(r.created_at) },
        ]} />
      </Section>
    </div>
  );
}
