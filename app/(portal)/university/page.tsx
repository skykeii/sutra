import { FileCheck2, GraduationCap, SearchCheck, Upload } from "lucide-react";
import Link from "next/link";
import { DataTable, fmtDateTime, KpiCard, PageHeader, Section } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/session";
import { chunked } from "@/lib/db";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata = { title: "University" };

export default async function Page() {
  const profile = await requireRole(["university_admin"]);
  const supabase = await createServerSupabase();
  const [university, results, batches, summary] = await Promise.all([
    supabase.from("universities").select("name").eq("id", profile.universityId!).single(),
    createAdminSupabase().from("university_results").select("id", { head: true, count: "exact" }).eq("university_id", profile.universityId!),
    supabase.from("university_result_batches").select("id, file_name, semester, row_count, digest, created_at").eq("university_id", profile.universityId!).order("created_at", { ascending: false }).limit(10),
    supabase.from("v_university_summary").select("*").maybeSingle(),
  ]);
  // Universities have no student-level access; only a count of checks against their own results leaves here.
  const admin = createAdminSupabase();
  const { data: submissions } = await admin.from("marksheet_submissions").select("students(apaar_hash)");
  const asked = (submissions ?? []).map((s) => (s.students as unknown as { apaar_hash: string }).apaar_hash);
  const hashes = new Set<string>();
  for (const part of chunked([...new Set(asked)])) {
    const { data } = await admin.from("university_results").select("apaar_hash").eq("university_id", profile.universityId!).in("apaar_hash", part);
    data?.forEach((r) => hashes.add(r.apaar_hash));
  }
  const queries = asked.filter((h) => hashes.has(h)).length;
  return (
    <div className="space-y-5">
      <PageHeader title={university.data?.name ?? "University"} description="You are the source of truth for marks. Sutra compares claims against what you publish." actions={<Button asChild><Link href="/university/results"><Upload className="h-4 w-4" aria-hidden />Publish results</Link></Button>} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Results published" value={(results.count ?? 0).toLocaleString("en-IN")} icon={FileCheck2} />
        <KpiCard label="Signed batches" value={batches.data?.length ?? 0} icon={FileCheck2} />
        <KpiCard label="Verification queries" value={queries} icon={SearchCheck} hint="Marks checked against your results" />
        <KpiCard label="Students at affiliated colleges" value={(summary.data?.active_enrolments ?? 0).toLocaleString("en-IN")} icon={GraduationCap} hint={`${summary.data?.institutions ?? 0} institutions`} />
      </div>
      <Section title="Recent batches" description="Each batch is digitally signed when published.">
        <DataTable rows={batches.data ?? []} rowKey={(r) => r.id} empty="No results published yet." columns={[
          { key: "file_name", header: "File" },
          { key: "semester", header: "Semester", align: "right", render: (r) => (r.semester === 0 ? "Qualifying" : r.semester ?? "Mixed") },
          { key: "row_count", header: "Rows", align: "right" },
          { key: "digest", header: "Digest", render: (r) => <code className="text-xs">{r.digest.slice(0, 16)}…</code> },
          { key: "created_at", header: "When", render: (r) => fmtDateTime(r.created_at) },
        ]} />
      </Section>
    </div>
  );
}
