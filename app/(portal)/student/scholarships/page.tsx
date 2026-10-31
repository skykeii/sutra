import Link from "next/link";
import { DataTable, fmtDateTime, PageHeader, StatusBadge } from "@/components/shared";
import { requireRole } from "@/lib/auth/session";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata = { title: "Scholarships" };

export default async function Page() {
  await requireRole(["student"]);
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("scholarship_requests").select("id, portal_id, scheme, academic_year, status, denial_reason, result, created_at").order("created_at", { ascending: false });
  const { data: portals } = await createAdminSupabase().from("scholarship_portals").select("id, name");
  const nameOf = (id: string) => portals?.find((p) => p.id === id)?.name ?? "Scholarship portal";
  return (
    <div className="space-y-4">
      <PageHeader title="Scholarships" description="Portals that have asked to verify your record. They get a short answer only, never your full marksheet." />
      <p className="text-sm">Waiting requests are answered in <Link className="text-primary underline" href="/student/consents">Access and consents</Link>.</p>
      <DataTable rows={data ?? []} rowKey={(r) => r.id} empty="No scholarship requests yet." columns={[
        { key: "scheme", header: "Scheme" },
        { key: "portal", header: "Portal", render: (r) => nameOf(r.portal_id) },
        { key: "academic_year", header: "Year" },
        { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
        { key: "detail", header: "Detail", render: (r) => r.denial_reason ?? (r.result ? "Verified answer shared" : "") },
        { key: "created_at", header: "When", render: (r) => fmtDateTime(r.created_at) },
      ]} />
    </div>
  );
}
