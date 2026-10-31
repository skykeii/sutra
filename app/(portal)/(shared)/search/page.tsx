import Link from "next/link";
import { DataTable, firstParam, PageHeader, StatusBadge } from "@/components/shared";
import { getSessionProfile } from "@/lib/auth/session";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { appendAudit } from "@/lib/audit";
import { redirect } from "next/navigation";

export const metadata = { title: "Search" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");
  const q = (firstParam((await searchParams).q) ?? "").trim().slice(0, 64);
  const supabase = await createServerSupabase();
  const isAicte = profile.role === "aicte_admin" || profile.role === "aicte_officer";
  const isInstitution = profile.role === "institution_admin" || profile.role === "institution_staff";

  if (isAicte) {
    const clean = q.toLowerCase().replace(/[^0-9a-f]/g, "");
    const { data } = clean.length >= 6
      ? await supabase.from("students").select("id, apaar_hash, enrolments(id, enrolment_status, validation_status, institutions(name), programs(name))").like("apaar_hash", `${clean}%`).limit(25)
      : { data: [] };
    if (clean) await appendAudit(createAdminSupabase(), { actorId: profile.userId, actorRole: profile.role, action: "student.search", entity: "student", meta: { results: data?.length ?? 0 } });
    const rows = (data ?? []).flatMap((s) => (s.enrolments as unknown as { id: string; enrolment_status: string; validation_status: string; institutions: { name: string }; programs: { name: string } }[]).map((e) => ({ ...e, hash: s.apaar_hash as string })));
    return (
      <div className="space-y-4">
        <PageHeader title="Search" description="AICTE searches by the start of a student's keyed APAAR hash (at least 6 characters)." />
        <DataTable rows={rows} rowKey={(r) => r.id} empty={q ? "No students match. Enter at least 6 hash characters." : "Enter a hash prefix in the search box above."} columns={[
          { key: "hash", header: "Key", render: (r) => <code className="text-xs">{r.hash.slice(0, 12)}…</code> },
          { key: "institution", header: "Institution", render: (r) => r.institutions.name },
          { key: "program", header: "Program", render: (r) => r.programs.name },
          { key: "status", header: "Enrolment", render: (r) => <StatusBadge status={r.enrolment_status} /> },
          { key: "checks", header: "Checks", render: (r) => <StatusBadge status={r.validation_status} /> },
        ]} />
      </div>
    );
  }
  if (isInstitution) {
    const { data } = q
      ? await supabase.from("enrolments").select("id, enrolment_status, programs(name), students!inner(name)").ilike("students.name", `%${q.replace(/[%_,()]/g, "")}%`).limit(50)
      : { data: [] };
    return (
      <div className="space-y-4">
        <PageHeader title="Search" description="Find a student at your institution by name." />
        <DataTable rows={data ?? []} rowKey={(r) => r.id} empty={q ? "No students match that name." : "Enter a name in the search box above."} columns={[
          { key: "name", header: "Name", render: (r) => <Link className="text-primary underline" href={`/institution/students/${r.id}`}>{(r.students as unknown as { name: string }).name}</Link> },
          { key: "program", header: "Program", render: (r) => (r.programs as unknown as { name: string }).name },
          { key: "status", header: "Enrolment", render: (r) => <StatusBadge status={r.enrolment_status} /> },
        ]} />
      </div>
    );
  }
  redirect("/");
}
