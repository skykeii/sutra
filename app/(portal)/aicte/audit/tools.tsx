"use client";

import { Anchor, FlaskConical, RotateCcw, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/components/action-button";
import { Button } from "@/components/ui/button";

type Result = { ok: true; count: number } | { ok: false; count: number; brokenAt: number };

export function AuditTools({ demo, isAdmin }: { demo: boolean; isAdmin: boolean }) {
  const router = useRouter();
  const [result, setResult] = useState<Result | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (action: string, after: (json: Record<string, unknown>) => void) => {
    setBusy(true);
    setError("");
    try {
      after(await postJson(`/api/app/audit/${action}`));
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => run("verify", (j) => { setResult(j as unknown as Result); setNote(""); })}><ShieldCheck className="h-4 w-4" aria-hidden />{busy ? "Checking…" : "Verify audit integrity"}</Button>
        <Button variant="outline" disabled={busy} onClick={() => run("anchor", () => setNote("Anchor created. It now appears on the public transparency page."))}><Anchor className="h-4 w-4" aria-hidden />Create anchor now</Button>
        {demo && isAdmin && (
          <>
            <Button variant="outline" disabled={busy} onClick={() => run("tamper", (j) => { setResult(null); setNote(`Demo: entry #${j.seq} was edited directly in the database. Now run the integrity check.`); })}><FlaskConical className="h-4 w-4" aria-hidden />Simulate tampering</Button>
            <Button variant="outline" disabled={busy} onClick={() => run("restore", () => { setResult(null); setNote("Original entry restored. Run the integrity check again."); })}><RotateCcw className="h-4 w-4" aria-hidden />Restore</Button>
          </>
        )}
      </div>
      {result && (
        <p role="status" className={`rounded-md p-3 font-medium ${result.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-900"}`}>
          {result.ok ? `Chain intact: ${result.count.toLocaleString("en-IN")} entries verified` : `Tampering detected at entry #${result.brokenAt}. The ${result.count} entries before it are intact.`}
        </p>
      )}
      {note && <p role="status" className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">{note}</p>}
      {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-900">{error}</p>}
    </div>
  );
}
