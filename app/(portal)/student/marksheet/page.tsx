import { MarksheetForm } from "@/components/marksheet-form";
import { DataTable, fmtDateTime, PageHeader, Section, StatusBadge } from "@/components/shared";
import { requireRole } from "@/lib/auth/session";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata = { title: "Marksheet check" };

export default async function Page() {
  await requireRole(["student"]);
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("marksheet_submissions").select("id, semester, claimed_pct, verified_pct, outcome, created_at").order("created_at", { ascending: false }).limit(20);
  return (
    <div className="space-y-5">
      <PageHeader title="Marksheet check" description="This stands in for the marksheet a student uploads to a college or scholarship portal. Sutra never reads the image. It compares the number on the marksheet with the university's signed record." />
      <Section title="Check your marks"><MarksheetForm /></Section>
      <Section title="Your checks">
        <DataTable rows={data ?? []} rowKey={(r) => r.id} empty="You have not checked any marks yet." columns={[
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
