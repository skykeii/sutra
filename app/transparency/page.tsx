import { BadgeCheck, CircleSlash } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/layout/logo";
import { DataTable, firstParam, fmtDateTime, PageHeader, Section, StatusBadge } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { verifyPayload } from "@/lib/crypto";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const metadata = { title: "Transparency" };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const hash = (firstParam((await searchParams).hash) ?? "").trim().toLowerCase();
  const admin = createAdminSupabase();
  const [anchors, head] = await Promise.all([
    admin.from("audit_anchors").select("id, date, last_seq, last_hash, signature, created_at").order("created_at", { ascending: false }).limit(60),
    admin.from("audit_log").select("seq, hash").order("seq", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const rows = (anchors.data ?? []).map((a) => ({ ...a, valid: verifyPayload({ date: a.date, last_seq: a.last_seq, last_hash: a.last_hash }, a.signature) }));
  const match = hash ? rows.find((r) => r.last_hash === hash) : null;
  return (
    <main className="mx-auto max-w-4xl space-y-5 p-4 md:p-6">
      <Link href="/" className="inline-block"><Logo /></Link>
      <PageHeader title="Transparency" description="Sutra's audit trail is a hash chain. Each day AICTE signs a checkpoint of it and publishes it here. Rewriting history would no longer match these published anchors. No student data appears on this page." />
      <Section title="Current head of the chain">
        <p className="text-sm">Entry #{head.data?.seq ?? 0}</p>
        <code className="block break-all text-xs">{head.data?.hash ?? "The chain is empty."}</code>
      </Section>
      <Section title="Check a hash" description="Paste a hash to see whether it matches a published anchor.">
        <form method="get" className="flex flex-wrap gap-2">
          <Input name="hash" aria-label="Hash" defaultValue={hash} placeholder="64-character hash" className="min-w-64 flex-1 font-mono text-xs" />
          <Button type="submit">Check</Button>
        </form>
        {hash && (
          <p role="status" className={`mt-3 flex items-center gap-2 rounded-md p-3 text-sm font-medium ${match ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-900"}`}>
            {match ? <BadgeCheck className="h-5 w-5" aria-hidden /> : <CircleSlash className="h-5 w-5" aria-hidden />}
            {match ? `Matches the anchor of ${match.date}, covering entries up to #${match.last_seq}.` : "This hash does not match any published anchor."}
          </p>
        )}
      </Section>
      <Section title="Published anchors" description={<>Signatures can be checked with the <a className="text-primary underline" href="/.well-known/aicte-public-key.json">public key</a>.</> as unknown as string}>
        <DataTable rows={rows} rowKey={(r) => r.id} empty="No anchors have been published yet." columns={[
          { key: "date", header: "Date" },
          { key: "last_seq", header: "Up to entry", align: "right" },
          { key: "last_hash", header: "Hash", render: (r) => <code className="break-all text-xs">{r.last_hash}</code> },
          { key: "valid", header: "Signature", render: (r) => <StatusBadge status={r.valid ? "Valid" : "Revoked"} title={r.valid ? "Signature verified" : "Signature failed"} /> },
          { key: "created_at", header: "Signed", render: (r) => fmtDateTime(r.created_at) },
        ]} />
      </Section>
    </main>
  );
}
