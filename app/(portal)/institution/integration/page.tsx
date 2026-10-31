import Link from "next/link";
import { WebhookForm } from "@/app/(portal)/institution/integration/webhook-form";
import { ActionButton } from "@/components/action-button";
import { ApiKeyManager, type KeyRow } from "@/components/api-key-manager";
import { DataTable, fmtDateTime, PageHeader, Section, StatusBadge } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/session";
import { baseUrl } from "@/lib/credentials/service";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata = { title: "API and webhooks" };

export default async function Page() {
  const profile = await requireRole(["institution_admin", "institution_staff"]);
  const canManage = profile.role === "institution_admin";
  const supabase = await createServerSupabase();
  const [keys, hooks, deliveries, program] = await Promise.all([
    supabase.from("api_keys").select("id, name, key_prefix, scopes, revoked_at, last_used_at").order("created_at", { ascending: false }),
    supabase.from("webhooks").select("id, url, events").order("created_at"),
    supabase.from("webhook_deliveries").select("id, event, status_code, ok, created_at").order("created_at", { ascending: false }).limit(10),
    supabase.from("programs").select("id").limit(1).maybeSingle(),
  ]);
  const base = baseUrl();
  const programId = program.data?.id ?? "PROGRAM_ID";
  const curl = `curl -X POST ${base}/api/v1/students/validate \\\n  -H "X-API-Key: YOUR_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"program_id":"${programId}","rows":[{"apaar_id":"123456789012","name":"Student Name","dob":"2006-03-14","gender":"Female","nationality":"Indian","admission_date":"2026-08-01","admission_category":"Regular","quota_type":"NON_CONVENOR","is_nri":"false","oci_status":"none","is_foreign_national":"false","fee_status":"Paid","enrolment_status":"Active"}]}'`;
  const curlIntake = `curl ${base}/api/v1/programs/${programId}/intake-status \\\n  -H "X-API-Key: YOUR_KEY"`;
  return (
    <div className="space-y-5">
      <PageHeader title="API and webhooks" description="Connect your own systems to Sutra." actions={<Button asChild variant="outline"><Link href="/docs">API documentation</Link></Button>} />
      <Section title="API keys" description="Each key is shown once and stored only as a hash."><ApiKeyManager keys={(keys.data ?? []) as KeyRow[]} canManage={canManage} /></Section>
      <Section title="Webhooks" description="Sutra posts here when something important happens. Each call has an HMAC signature in the X-Signature header.">
        <div className="space-y-4">
          <DataTable rows={hooks.data ?? []} rowKey={(r) => r.id} empty="No webhooks yet." columns={[
            { key: "url", header: "Address", render: (r) => <code className="break-all text-xs">{r.url}</code> },
            { key: "events", header: "Events", render: (r) => r.events.join(", ") },
            { key: "act", header: "Actions", render: (r) => canManage ? <span className="flex gap-1"><ActionButton size="sm" variant="outline" url="/api/app/webhooks" body={{ action: "test", id: r.id }} done="Sent">Send test</ActionButton><ActionButton size="sm" variant="ghost" url="/api/app/webhooks" body={{ action: "delete", id: r.id }}>Remove</ActionButton></span> : null },
          ]} />
          {canManage && <WebhookForm />}
          <div>
            <h3 className="mb-2 font-medium">Recent deliveries</h3>
            <DataTable rows={deliveries.data ?? []} rowKey={(r) => r.id} empty="Nothing has been delivered yet." columns={[
              { key: "event", header: "Event" },
              { key: "status_code", header: "Response", align: "right", render: (r) => r.status_code ?? "No response" },
              { key: "ok", header: "Result", render: (r) => <StatusBadge status={r.ok ? "delivered" : "failed"} /> },
              { key: "created_at", header: "When", render: (r) => fmtDateTime(r.created_at) },
            ]} />
          </div>
        </div>
      </Section>
      <Section title="Try it" description="Dry-run a record without saving it, or check a program's seats.">
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{curl}</pre>
        <pre className="mt-3 overflow-x-auto rounded-md bg-muted p-3 text-xs">{curlIntake}</pre>
      </Section>
      <Section title="CSV templates">
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><a href="/api/app/template?format=csv">CSV template</a></Button>
          <Button asChild variant="outline"><a href="/api/app/template?format=xlsx">Excel template</a></Button>
          <Button asChild variant="ghost"><Link href="/docs/rules">Validation rules</Link></Button>
        </div>
      </Section>
    </div>
  );
}
