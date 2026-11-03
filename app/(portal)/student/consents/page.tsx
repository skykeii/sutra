import { ConsentDecision } from "@/app/(portal)/student/consents/consent-card";
import { ActionButton } from "@/components/action-button";
import { LiveRefresh } from "@/components/live";
import { DataTable, EmptyState, fmtDateTime, PageHeader, Section, SimulatedChip, StatusBadge } from "@/components/shared";
import { requireRole } from "@/lib/auth/session";
import { consentState } from "@/lib/consent";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata = { title: "Access and consents" };

export default async function Page() {
  await requireRole(["student"]);
  const supabase = await createServerSupabase();
  const { data: studentId } = await supabase.rpc("app_student_id");
  const [consents, access, sms] = await Promise.all([
    supabase.from("consents").select("id, grantee_type, grantee_id, purpose, scope, approved_at, denied_at, revoked_at, consumed_at, expires_at, created_at").eq("student_id", studentId ?? "").order("created_at", { ascending: false }),
    supabase.from("access_log").select("id, grantee, purpose, fields_returned, at").eq("student_id", studentId ?? "").order("at", { ascending: false }),
    supabase.from("simulated_sms").select("id, message, created_at").eq("student_id", studentId ?? "").order("created_at", { ascending: false }).limit(5),
  ]);
  // Students cannot read these tables directly; only the display names are fetched.
  const admin = createAdminSupabase();
  const ids = (consents.data ?? []).map((c) => c.grantee_id);
  const [orgs, portals] = await Promise.all([
    admin.from("verifier_orgs").select("id, name").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
    admin.from("scholarship_portals").select("id, name").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
  ]);
  const names = new Map([...(orgs.data ?? []), ...(portals.data ?? [])].map((o) => [o.id, o.name]));
  const rows = (consents.data ?? []).map((c) => ({ ...c, state: consentState(c), name: names.get(c.grantee_id) ?? "Unknown organisation" }));
  const pending = rows.filter((r) => r.state === "Pending");
  return (
    <div className="space-y-5">
      <PageHeader title="Access and consents" description="Nobody sees your record without your approval. You can take access back at any time." actions={<LiveRefresh tables={["consents", "access_log"]} />} />
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <Section title="Waiting for your answer">
          {pending.length === 0 ? <EmptyState>No requests are waiting for you.</EmptyState> : (
            <ul className="space-y-3">
              {pending.map((c) => (
                <li key={c.id} className="rounded-md border p-3">
                  <p className="font-medium">{c.name}</p>
                  <p className="text-sm">Purpose: {c.purpose}</p>
                  <p className="mb-2 text-sm text-muted-foreground">They would see: {c.scope.join(", ")}</p>
                  <ConsentDecision id={c.id} />
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Simulated SMS inbox" actions={<SimulatedChip />} description="A real deployment sends these to your phone.">
          {sms.data?.length ? (
            <ul className="space-y-2">{sms.data.map((m) => <li key={m.id} className="rounded-md bg-muted p-2 text-sm">{m.message}<span className="mt-1 block text-xs text-muted-foreground">{fmtDateTime(m.created_at)}</span></li>)}</ul>
          ) : <p className="text-sm text-muted-foreground">No messages yet.</p>}
        </Section>
      </div>
      <Section title="All requests">
        <DataTable rows={rows} rowKey={(r) => r.id} empty="No requests yet." columns={[
          { key: "name", header: "Organisation" }, { key: "purpose", header: "Purpose" },
          { key: "state", header: "Status", render: (r) => r.state === "Viewed" ? <span className="space-y-0.5"><StatusBadge status="Used once" /><span className="block text-xs text-muted-foreground">{fmtDateTime(r.consumed_at)}</span></span> : <StatusBadge status={r.state} /> },
          { key: "expires_at", header: "Access until", render: (r) => fmtDateTime(r.expires_at) },
          { key: "act", header: "Action", render: (r) => r.state === "Approved" ? <ActionButton size="sm" variant="outline" url={`/api/app/student/consents/${r.id}`} body={{ action: "revoke" }}>Take back access</ActionButton> : null },
        ]} />
      </Section>
      <Section title="Who accessed my record">
        <DataTable rows={access.data ?? []} rowKey={(r) => r.id} empty="Nobody has accessed your record yet." columns={[
          { key: "grantee", header: "Organisation" }, { key: "purpose", header: "Purpose" },
          { key: "fields", header: "What they saw", render: (r) => r.fields_returned.join(", ") },
          { key: "at", header: "When", render: (r) => fmtDateTime(r.at) },
        ]} />
      </Section>
    </div>
  );
}
