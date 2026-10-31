import { ResultsUploader } from "@/app/(portal)/university/results/uploader";
import { ApiKeyManager, type KeyRow } from "@/components/api-key-manager";
import { DataTable, fmtDateTime, PageHeader, Section } from "@/components/shared";
import { requireRole } from "@/lib/auth/session";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata = { title: "Results" };

export default async function Page() {
  await requireRole(["university_admin"]);
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("university_result_batches").select("id, file_name, semester, row_count, signature, created_at").order("created_at", { ascending: false }).limit(50);
  const { data: keys } = await supabase.from("api_keys").select("id, name, key_prefix, scopes, revoked_at, last_used_at").order("created_at", { ascending: false });
  return (
    <div className="space-y-5">
      <PageHeader title="Results" description="Upload semester results by APAAR ID. Each batch is signed, stored and audited." />
      <Section title="Publish a results file"><ResultsUploader /></Section>
      <Section title="API keys" description="For publishing results and fetching certificate lines from your own software."><ApiKeyManager keys={(keys ?? []) as KeyRow[]} /></Section>
      <Section title="Published batches">
        <DataTable rows={data ?? []} rowKey={(r) => r.id} empty="No batches yet." columns={[
          { key: "file_name", header: "File" },
          { key: "semester", header: "Semester", align: "right", render: (r) => (r.semester === 0 ? "Qualifying" : r.semester ?? "Mixed") },
          { key: "row_count", header: "Rows", align: "right" },
          { key: "signature", header: "Signature", render: (r) => <code className="text-xs">{r.signature.slice(0, 20)}…</code> },
          { key: "created_at", header: "When", render: (r) => fmtDateTime(r.created_at) },
        ]} />
      </Section>
    </div>
  );
}
