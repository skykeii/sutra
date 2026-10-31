"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/components/action-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Result { outcome: "Match" | "Mismatch" | "NotFound"; claimed: number; verified: number | null; semester: number }

export function MarksheetForm({ enrolments }: { enrolments?: { id: string; label: string }[] }) {
  const router = useRouter();
  const [enrolmentId, setEnrolmentId] = useState(enrolments?.[0]?.id ?? "");
  const [semester, setSemester] = useState("4");
  const [claimed, setClaimed] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-3">
      <form className="flex flex-wrap items-end gap-3" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          setResult(await postJson<Result>("/api/app/marksheet", { semester: Number(semester), claimed_pct: Number(claimed), enrolmentId: enrolments ? enrolmentId : undefined }));
          router.refresh();
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}>
        {enrolments && (
          <div className="min-w-64 space-y-1">
            <Label htmlFor="student">Student</Label>
            <select id="student" value={enrolmentId} onChange={(e) => setEnrolmentId(e.target.value)} className="h-10 w-full rounded-md border border-input bg-card px-2 text-sm">
              {enrolments.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
        )}
        <div className="space-y-1">
          <Label htmlFor="semester">Semester</Label>
          <select id="semester" value={semester} onChange={(e) => setSemester(e.target.value)} className="h-10 rounded-md border border-input bg-card px-2 text-sm">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="claimed">Marks on the marksheet (%)</Label>
          <Input id="claimed" type="number" min={0} max={100} step="0.01" required value={claimed} onChange={(e) => setClaimed(e.target.value)} className="w-40" />
        </div>
        <Button type="submit" disabled={busy}>{busy ? "Checking…" : "Check with the university"}</Button>
      </form>
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
      {result && (
        <p role="status" className={`rounded-md p-3 font-medium ${result.outcome === "Match" ? "bg-emerald-50 text-emerald-900" : result.outcome === "Mismatch" ? "bg-red-50 text-red-900" : "bg-amber-50 text-amber-900"}`}>
          {result.outcome === "Match" && `Match: ${result.claimed}% agrees with the university record.`}
          {result.outcome === "Mismatch" && `Mismatch: claimed ${result.claimed}%, university record ${result.verified}%. AICTE has been alerted.`}
          {result.outcome === "NotFound" && `The university has not published a result for Semester ${result.semester} yet.`}
        </p>
      )}
    </div>
  );
}
