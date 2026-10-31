import { ViewResult } from "@/app/(portal)/verifier/requests/view-result";
import { LiveRefresh } from "@/components/live";
import { DataTable, fmtDateTime, PageHeader, StatusBadge } from "@/components/shared";
import { requireRole } from "@/lib/auth/session";
import { consentState } from "@/lib/consent";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const metadata = { title: "My requests" };

export default async function Page() {
  const profile = await requireRole(["verifier"]);
  // Verifiers have no direct table access; this server code returns only their own requests and no student identity.
  const { data } = await createAdminSupabase()
    .from("consents")
    .select("id, purpose, approved_at, denied_at, revoked_at, consumed_at, expires_at, created_at, receipt")
    .eq("grantee_id", profile.verifierOrgId ?? "")
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = (data ?? []).map((c) => ({ ...c, state: consentState(c), result: (c.receipt as { payload?: { result?: Record<string, unknown> } } | null)?.payload?.result ?? null }));
  return (
    <div className="space-y-4">
      <PageHeader title="My requests" description="Requests you have made, and what each student decided." actions={<LiveRefresh tables={[]} />} />
      <DataTable rows={rows} rowKey={(r) => r.id} empty="You have not made any requests yet." columns={[
        { key: "purpose", header: "Purpose" },
        { key: "created_at", header: "Asked", render: (r) => fmtDateTime(r.created_at) },
        { key: "state", header: "Status", render: (r) => <StatusBadge status={r.state} /> },
        { key: "result", header: "Result", render: (r) => <ViewResult id={r.id} state={r.state} initial={r.result} /> },
      ]} />
    </div>
  );
}
