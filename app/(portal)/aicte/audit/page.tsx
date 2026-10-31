import Link from "next/link";
import { AuditTools } from "@/app/(portal)/aicte/audit/tools";
import { DataTable, ExportMenu, FilterBar, firstParam, fmtDateTime, Pager, PageHeader, Section } from "@/components/shared";
import { canonicalJSON } from "@/lib/crypto";
import { requireRole } from "@/lib/auth/session";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata = { title: "Audit trail" };
const SIZE = 30;

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await requireRole(["aicte_admin", "aicte_officer"]);
  const sp = await searchParams;
  const page = Math.max(1, Number(firstParam(sp.page)) || 1);
  const action = firstParam(sp.action);
  const entity = firstParam(sp.entity);
  const role = firstParam(sp.role);
  const from = firstParam(sp.from);
  const to = firstParam(sp.to);
  const entrySeq = Number(firstParam(sp.entry)) || null;
  const query = { action, entity, role, from, to };
  const supabase = await createServerSupabase();
  let q = supabase.from("audit_log").select("seq, actor_role, action, entity, entity_id, at, hash").order("seq", { ascending: false }).range((page - 1) * SIZE, page * SIZE);
  if (action) q = q.ilike("action", `%${action.replace(/[%_,()]/g, "")}%`);
  if (entity) q = q.eq("entity", entity);
  if (role) q = q.eq("actor_role", role);
  if (from) q = q.gte("at", from);
  if (to) q = q.lte("at", `${to}T23:59:59Z`);
  const [{ data }, { count }, entry, anchors] = await Promise.all([
    q,
    supabase.from("audit_log").select("seq", { head: true, count: "exact" }),
    entrySeq ? supabase.from("audit_log").select("*").eq("seq", entrySeq).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("audit_anchors").select("id, date, last_seq, last_hash, created_at").order("created_at", { ascending: false }).limit(5),
  ]);
  const rows = data ?? [];
  const entryLink = (seq: number) => {
    const params = new URLSearchParams(Object.entries({ ...query, page: String(page), entry: String(seq) }).filter((e): e is [string, string] => !!e[1]));
    return `/aicte/audit?${params}`;
  };
  return (
    <div className="space-y-5">
      <PageHeader title="Audit trail" description={`${(count ?? 0).toLocaleString("en-IN")} entries. Each entry's hash includes the one before it, so editing any entry breaks the chain from that point on.`} actions={<ExportMenu template="audit-log" query={query} formats={["csv"]} />} />
      <Section title="Integrity"><AuditTools demo={process.env.DEMO_MODE === "true"} isAdmin={profile.role === "aicte_admin"} /></Section>
      {entry.data && (
        <Section title={`Entry #${entry.data.seq}`} actions={<Link className="text-sm text-primary underline" href="/aicte/audit">Close</Link>}>
          <dl className="grid gap-2 text-sm sm:grid-cols-[8rem_1fr]">
            {([["Action", entry.data.action], ["Entity", `${entry.data.entity} ${entry.data.entity_id ?? ""}`], ["Actor", `${entry.data.actor_role ?? ""} ${entry.data.actor_id ?? ""}`], ["When", fmtDateTime(entry.data.at)], ["Details", canonicalJSON(entry.data.meta)], ["Previous hash", entry.data.prev_hash], ["Hash", entry.data.hash]] as const).map(([k, v]) => (
              <div key={k} className="contents"><dt className="font-medium">{k}</dt><dd className="break-all font-mono text-xs">{v}</dd></div>
            ))}
          </dl>
        </Section>
      )}
      <FilterBar action="/aicte/audit" values={query} fields={[
        { name: "action", label: "Action", placeholder: "e.g. upload" },
        { name: "entity", label: "Entity", options: ["upload_batch", "credential", "consent", "session", "alert", "approval", "student", "report"].map((v) => ({ value: v, label: v })) },
        { name: "role", label: "Actor", options: ["aicte_admin", "aicte_officer", "institution_admin", "institution_staff", "university_admin", "verifier", "student", "api_key", "public", "system"].map((v) => ({ value: v, label: v })) },
        { name: "from", label: "From", placeholder: "YYYY-MM-DD" },
        { name: "to", label: "To", placeholder: "YYYY-MM-DD" },
      ]} />
      <DataTable rows={rows.slice(0, SIZE)} rowKey={(r) => String(r.seq)} empty="No entries match these filters." columns={[
        { key: "seq", header: "#", align: "right", render: (r) => <Link className="text-primary underline" href={entryLink(r.seq)}>{r.seq}</Link> },
        { key: "at", header: "When", render: (r) => fmtDateTime(r.at) },
        { key: "actor_role", header: "Actor" },
        { key: "action", header: "Action" },
        { key: "entity", header: "Entity" },
        { key: "hash", header: "Hash", render: (r) => <code className="text-xs">{r.hash.slice(0, 14)}…</code> },
      ]} />
      <Pager page={page} hasNext={rows.length > SIZE} path="/aicte/audit" query={query} />
      <Section title="Recent anchors" description="Signed checkpoints of the chain, published on the public transparency page.">
        <DataTable rows={anchors.data ?? []} rowKey={(r) => r.id} empty="No anchors yet." columns={[
          { key: "date", header: "Date" }, { key: "last_seq", header: "Up to entry", align: "right" },
          { key: "last_hash", header: "Hash", render: (r) => <code className="text-xs">{r.last_hash.slice(0, 24)}…</code> },
        ]} />
      </Section>
    </div>
  );
}
