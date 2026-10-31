import { UserPlus } from "lucide-react";
import Link from "next/link";
import { DataTable, firstParam, FilterBar, Pager, PageHeader, StatusBadge } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/session";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata = { title: "Students" };
const SIZE = 50;

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole(["institution_admin", "institution_staff"]);
  const sp = await searchParams;
  const page = Math.max(1, Number(firstParam(sp.page)) || 1);
  const status = firstParam(sp.status);
  const program = firstParam(sp.program);
  const name = firstParam(sp.q);
  const supabase = await createServerSupabase();
  const { data: programs } = await supabase.from("programs").select("id, name").order("name");
  let query = supabase
    .from("enrolments")
    .select("id, quota_type, admission_date, enrolment_status, validation_status, version, programs(name), students!inner(id, name)")
    .order("created_at", { ascending: false })
    .range((page - 1) * SIZE, page * SIZE);
  if (status) query = query.eq("validation_status", status);
  if (program) query = query.eq("program_id", program);
  if (name) query = query.ilike("students.name", `%${name.replace(/[%_,()]/g, "")}%`);
  const { data } = await query;
  const rows = (data ?? []).map((e) => ({
    ...e,
    student: e.students as unknown as { id: string; name: string },
    program: (e.programs as unknown as { name: string }).name,
  }));
  return (
    <div className="space-y-4">
      <PageHeader title="Students" description="Your enrolled students. Open a student to edit their record." actions={<Button asChild><Link href="/institution/students/new"><UserPlus className="h-4 w-4" aria-hidden />Add one student</Link></Button>} />
      <FilterBar
        action="/institution/students"
        values={{ q: name, status, program }}
        fields={[
          { name: "q", label: "Name", placeholder: "Search name" },
          { name: "program", label: "Program", options: (programs ?? []).map((p) => ({ value: p.id, label: p.name })) },
          { name: "status", label: "Check status", options: ["Pending", "Clean", "Flagged", "Verified", "Revoked"].map((s) => ({ value: s, label: s })) },
        ]}
      />
      <DataTable
        rows={rows.slice(0, SIZE)}
        rowKey={(r) => r.id}
        empty="No students match. Try clearing the filters."
        columns={[
          { key: "name", header: "Name", render: (r) => <Link className="font-medium text-primary underline" href={`/institution/students/${r.id}`}>{r.student.name}</Link> },
          { key: "program", header: "Program" },
          { key: "quota_type", header: "Quota" },
          { key: "admission_date", header: "Admitted" },
          { key: "enrolment_status", header: "Enrolment", render: (r) => <StatusBadge status={r.enrolment_status} /> },
          { key: "validation_status", header: "Checks", render: (r) => <StatusBadge status={r.validation_status} /> },
          { key: "version", header: "Version", align: "right" },
        ]}
      />
      <Pager page={page} hasNext={rows.length > SIZE} path="/institution/students" query={{ q: name, status, program }} />
    </div>
  );
}
