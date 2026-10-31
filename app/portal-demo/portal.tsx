"use client";

import { BadgeCheck, CircleSlash, Hourglass } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { postJson } from "@/components/action-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Outcome { request_id: string | null; status: "Pending" | "Fulfilled" | "Denied"; message: string; denial_reason?: string; result?: Record<string, unknown> }

const SAMPLES = [
  { label: "Sneha: eligible", apaar: "900000000005", scheme: "Post-Matric Merit Scholarship" },
  { label: "Vikram: detained", apaar: "900000000006", scheme: "Technical Education Fee Reimbursement" },
  { label: "Meera: second claim", apaar: "900000000007", scheme: "Post-Matric Merit Scholarship" },
  { label: "Arjun: after a marks mismatch", apaar: "900000000004", scheme: "Post-Matric Merit Scholarship" },
];

export function Portal({ schemes }: { schemes: string[] }) {
  const [apaar, setApaar] = useState("");
  const [scheme, setScheme] = useState(schemes[0]!);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const live = useRef({ apaar, scheme });
  live.current = { apaar, scheme };

  const submit = async (requestId?: string) => {
    const result = await postJson<Outcome>("/api/app/portal-demo", { apaar_id: live.current.apaar, scheme: live.current.scheme, request_id: requestId });
    setOutcome(result);
  };

  useEffect(() => {
    if (outcome?.status !== "Pending" || !outcome.request_id) return;
    const id = outcome.request_id;
    const timer = setInterval(() => void submit(id).catch(() => undefined), 3000);
    return () => clearInterval(timer);
  }, [outcome?.status, outcome?.request_id]);

  return (
    <div className="space-y-5">
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        setOutcome(null);
        try {
          await submit();
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}>
        <div className="space-y-1">
          <Label htmlFor="apaar">Student&apos;s APAAR ID</Label>
          <Input id="apaar" required inputMode="numeric" maxLength={12} value={apaar} onChange={(e) => setApaar(e.target.value.replace(/\D/g, ""))} placeholder="12 digits" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="scheme">Scheme</Label>
          <select id="scheme" value={scheme} onChange={(e) => setScheme(e.target.value)} className="h-10 w-full rounded-md border border-input bg-card px-2 text-sm">
            {schemes.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <Button type="submit" disabled={busy || apaar.length !== 12}>{busy ? "Applying…" : "Apply"}</Button>
      </form>

      <div>
        <p className="mb-2 text-sm font-medium">Demo students</p>
        <div className="flex flex-wrap gap-2">
          {SAMPLES.map((s) => <Button key={s.apaar} variant="outline" size="sm" onClick={() => { setApaar(s.apaar); setScheme(s.scheme); setOutcome(null); }}>{s.label}</Button>)}
        </div>
      </div>

      {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-900">{error}</p>}
      {outcome?.status === "Pending" && (
        <div role="status" className="flex items-start gap-3 rounded-md border bg-amber-50 p-4 text-amber-950">
          <Hourglass className="h-6 w-6 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">Waiting for the student&apos;s consent</p>
            <p className="text-sm">Sign in as the student in another window, open <Link className="underline" href="/student/consents">Access and consents</Link> and approve with the code. This page updates by itself.</p>
          </div>
        </div>
      )}
      {outcome?.status === "Denied" && (
        <div role="alert" className="flex items-start gap-3 rounded-md border border-red-300 bg-red-50 p-4 text-red-950">
          <CircleSlash className="h-6 w-6 shrink-0" aria-hidden />
          <div><p className="font-semibold">Application denied</p><p className="text-sm">{outcome.denial_reason}</p></div>
        </div>
      )}
      {outcome?.status === "Fulfilled" && (
        <div role="status" className="rounded-md border border-emerald-300 bg-emerald-50 p-4 text-emerald-950">
          <p className="flex items-center gap-2 font-semibold"><BadgeCheck className="h-6 w-6" aria-hidden />Verified with the student&apos;s consent</p>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            {Object.entries(outcome.result ?? {}).map(([k, v]) => <div key={k}><dt className="text-xs uppercase tracking-wide opacity-75">{k.replace(/_/g, " ")}</dt><dd className="font-medium">{String(v)}</dd></div>)}
          </dl>
          <p className="mt-3 text-xs">That is everything this portal receives. It never sees the full marksheet.</p>
        </div>
      )}
    </div>
  );
}
