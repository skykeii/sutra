"use client";

import { BadgeCheck, Download } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/components/action-button";
import { Button } from "@/components/ui/button";

type Result = Record<string, unknown> & { verified?: boolean; program?: string; institution?: string; years?: string; status?: string };

export function ViewResult({ id, state, initial }: { id: string; state: string; initial: Result | null }) {
  const router = useRouter();
  const [result, setResult] = useState<Result | null>(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (result) {
    const extras = Object.entries(result).filter(([k]) => !["verified", "program", "institution", "years", "status"].includes(k));
    return (
      <div className="space-y-1">
        <p className={`flex items-center gap-1 text-sm font-medium ${result.verified ? "text-emerald-800" : "text-amber-800"}`}>
          <BadgeCheck className="h-4 w-4" aria-hidden />{result.verified ? "Verified ✓" : "On record, not yet verified"}: {result.program}, {result.institution}, {result.years}, {result.status}
        </p>
        {extras.map(([k, v]) => <p key={k} className="text-xs text-muted-foreground">{k.replace(/_/g, " ")}: {String(v)}</p>)}
        <Button asChild size="sm" variant="outline"><a href={`/api/app/verifier/receipt/${id}`}><Download className="h-4 w-4" aria-hidden />Receipt PDF</a></Button>
      </div>
    );
  }
  if (state !== "Approved") return <span className="text-sm text-muted-foreground">{state === "Pending" ? "Waiting for the student" : "No access"}</span>;
  return (
    <div>
      <Button size="sm" disabled={busy} onClick={async () => {
        setBusy(true);
        setError("");
        try {
          const r = await postJson<{ result: Result }>(`/api/app/verifier/view/${id}`);
          setResult(r.result);
          router.refresh();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}>View result (one time)</Button>
      {error && <p role="alert" className="mt-1 text-xs text-red-800">{error}</p>}
    </div>
  );
}
