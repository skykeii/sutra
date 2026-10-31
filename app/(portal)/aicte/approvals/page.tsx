import { IntakeForm, RevokeForm } from "@/app/(portal)/aicte/approvals/forms";
import { ActionButton } from "@/components/action-button";
import { DataTable, fmtDateTime, PageHeader, Section, StatusBadge } from "@/components/shared";
import { requireRole } from "@/lib/auth/session";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata = { title: "Approvals" };

const describe = (type: string, p: Record<string, unknown>) => {
  if (type === "CHANGE_INTAKE") return `Change intake of ${p.program_name} at ${p.institution} to ${p.new_intake}. ${p.reason}`;
  if (type === "REVOKE_RECORD") return `Revoke record ${p.record_id}. ${p.reason}`;
  return `Approve verifier ${p.org_name}`;
};

export default async function Page() {
  const profile = await requireRole(["aicte_admin", "aicte_officer"]);
  const isAdmin = profile.role === "aicte_admin";
  const supabase = await createServerSupabase();
  const [approvals, orgs, programs, staff] = await Promise.all([
    supabase.from("approvals").select("id, action_type, payload, status, requested_by, approved_by, created_at").order("created_at", { ascending: false }).limit(50),
    supabase.from("verifier_orgs").select("id, name, type, status").order("created_at", { ascending: false }),
    supabase.from("programs").select("id, name, approved_intake, institutions(name)").order("name"),
    supabase.from("profiles").select("user_id, full_name").in("role", ["aicte_admin", "aicte_officer"]),
  ]);
  const nameOf = (id: string | null) => (staff.data ?? []).find((s) => s.user_id === id)?.full_name ?? "";
  const rows = approvals.data ?? [];
  const pendingOrgIds = new Set(rows.filter((r) => r.action_type === "APPROVE_VERIFIER" && r.status === "Pending").map((r) => (r.payload as { org_id: string }).org_id));
  return (
    <div className="space-y-5">
      <PageHeader title="Approvals" description="Sensitive actions need two people: one AICTE admin proposes, a different admin approves." />
      <Section title="Requests">
        <DataTable rows={rows} rowKey={(r) => r.id} empty="No requests yet." columns={[
          { key: "what", header: "Request", render: (r) => describe(r.action_type, r.payload as Record<string, unknown>) },
          { key: "by", header: "Asked by", render: (r) => nameOf(r.requested_by) },
          { key: "created_at", header: "When", render: (r) => fmtDateTime(r.created_at) },
          { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
          { key: "act", header: "Decision", render: (r) => {
            if (r.status !== "Pending") return nameOf(r.approved_by);
            if (!isAdmin) return "Admins only";
            if (r.requested_by === profile.userId) return <span className="text-xs text-muted-foreground">Needs a different admin</span>;
            return (
              <span className="flex flex-wrap gap-1">
                <ActionButton size="sm" url={`/api/app/approvals/${r.id}`} body={{ approve: true }}>Approve</ActionButton>
                <ActionButton size="sm" variant="outline" url={`/api/app/approvals/${r.id}`} body={{ approve: false }}>Reject</ActionButton>
              </span>
            );
          } },
        ]} />
      </Section>
      {isAdmin ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Section title="Verifier organisations" description="Propose approval for a waiting organisation.">
            <ul className="space-y-2">
              {(orgs.data ?? []).map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>{o.name} <StatusBadge status={o.status} /></span>
                  {o.status === "Pending" && (pendingOrgIds.has(o.id) ? <span className="text-xs text-muted-foreground">Waiting for approval</span> : <ActionButton size="sm" variant="outline" url="/api/app/approvals" body={{ action_type: "APPROVE_VERIFIER", payload: { org_id: o.id } }}>Propose approval</ActionButton>)}
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Revoke a credential"><RevokeForm /></Section>
          <Section title="Change approved intake"><IntakeForm programs={(programs.data ?? []).map((p) => ({ id: p.id, label: `${(p.institutions as unknown as { name: string }).name}: ${p.name} (${p.approved_intake})` }))} /></Section>
        </div>
      ) : <p className="text-sm text-muted-foreground">AICTE officers can follow requests here. Only admins can propose or approve them.</p>}
    </div>
  );
}
