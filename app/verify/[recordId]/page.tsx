import Link from "next/link";
import { VerdictCard } from "@/app/verify/verdict";
import { Button } from "@/components/ui/button";
import { appendAudit } from "@/lib/audit";
import { checkRecord } from "@/lib/credentials/service";
import { PUBLIC_KEY_ID } from "@/lib/credentials/vc";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const metadata = { title: "Record check" };
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ recordId: string }> }) {
  const recordId = decodeURIComponent((await params).recordId).slice(0, 60);
  const admin = createAdminSupabase();
  const result = await checkRecord(admin, recordId);
  await appendAudit(admin, { actorRole: "public", action: "credential.verify", entity: "credential", entityId: result.verdict === "NOT_FOUND" ? null : recordId, meta: { verdict: result.verdict, source: "page" } });
  return (
    <main className="space-y-5">
      <h1 className="text-xl font-semibold">Record {recordId}</h1>
      <VerdictCard verdict={result.verdict} fields={result.fields} reason={result.revokedReason} />
      <details className="rounded-md border bg-card p-4 text-sm">
        <summary className="cursor-pointer font-medium">Check the signature offline</summary>
        <div className="mt-3 space-y-2 text-muted-foreground">
          <p>Each record is signed with Ed25519 over its JSON with sorted keys and no spaces, leaving out the <code>proof</code> block. You can verify it without trusting this website.</p>
          <p>Public key <code>{PUBLIC_KEY_ID}</code>:</p>
          <pre className="overflow-x-auto rounded bg-muted p-2 text-xs text-foreground">{process.env.ED25519_PUBLIC_KEY_PEM}</pre>
          <p>Also published at <a className="text-primary underline" href="/.well-known/aicte-public-key.json">/.well-known/aicte-public-key.json</a>.</p>
        </div>
      </details>
      <Button asChild variant="outline"><Link href="/verify">Check another record</Link></Button>
    </main>
  );
}
