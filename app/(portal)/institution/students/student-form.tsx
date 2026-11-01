"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COLUMN_LABELS, CSV_COLUMNS, type CsvColumn, type CsvRow } from "@/lib/validation/columns";
import type { Issue } from "@/lib/validation/types";

const SELECTS: Partial<Record<CsvColumn, string[]>> = {
  gender: ["Male", "Female", "Other"],
  admission_category: ["Regular", "Supernumerary", "Lateral"],
  quota_type: ["CONVENOR", "NON_CONVENOR", "NRI", "SUPERNUMERARY", "LATERAL"],
  oci_status: ["none", "holder", "applied"],
  is_nri: ["false", "true"],
  is_foreign_national: ["false", "true"],
  fee_status: ["Paid", "Partial", "Pending", "Waived"],
  enrolment_status: ["Active", "Withdrawn", "PassedOut"],
};
const DATES: CsvColumn[] = ["dob", "admission_date"];

export function StudentForm({ programs, initial, programId, editing }: { programs: { id: string; name: string }[]; initial: CsvRow; programId?: string; editing?: boolean }) {
  const router = useRouter();
  const [row, setRow] = useState(initial);
  const [program, setProgram] = useState(programId ?? programs[0]?.id ?? "");
  const [issues, setIssues] = useState<Issue[]>([]);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  const send = async (commit: boolean) => {
    setBusy(true);
    setToast(null);
    try {
      const res = await fetch("/api/app/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId: program, fileName: "single-entry", rows: [row], updateApaars: editing ? [row.apaar_id.trim()] : [], commit }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "This record could not be checked.");
      setIssues(json.issues);
      if (commit) {
        if (json.stats.blockedRows > 0) {
          const first = (json.issues as Issue[]).find((i) => i.severity === "Error");
          throw new Error(first ? `Not saved. ${first.message}` : "This record could not be saved.");
        }
        setToast({ ok: true, text: "Student saved" });
        if (!editing) {
          setRow(initial);
          setIssues([]);
        }
        router.refresh();
      }
    } catch (e) {
      setToast({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const blocked = issues.some((i) => i.severity === "Error");
  return (
    <div className="space-y-4">
      <div className="max-w-xl space-y-1">
        <Label htmlFor="program">Program</Label>
        <select id="program" disabled={editing} value={program} onChange={(e) => setProgram(e.target.value)} className="h-10 w-full rounded-md border border-input bg-card px-2 text-sm">
          {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CSV_COLUMNS.map((c) => (
          <div key={c} className="space-y-1">
            <Label htmlFor={c}>{COLUMN_LABELS[c]}</Label>
            {SELECTS[c] ? (
              <select id={c} value={row[c]} onChange={(e) => setRow({ ...row, [c]: e.target.value })} className="h-10 w-full rounded-md border border-input bg-card px-2 text-sm">
                <option value="">Choose</option>
                {SELECTS[c]!.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <Input id={c} type={DATES.includes(c) ? "date" : "text"} disabled={editing && c === "apaar_id"} value={row[c]} onChange={(e) => setRow({ ...row, [c]: e.target.value })} />
            )}
          </div>
        ))}
      </div>
      {issues.length > 0 && (
        <ul className="space-y-2 rounded-md border bg-card p-3 text-sm">
          {issues.map((i, n) => (
            <li key={n} className={i.severity === "Error" ? "text-red-900" : "text-amber-900"}>
              {i.message}
              {i.suggestion && <Button size="sm" variant="outline" className="ml-2 h-7" onClick={() => { setRow({ ...row, [i.suggestion!.field]: i.suggestion!.proposed }); setIssues(issues.filter((x) => x !== i)); }}>Use {i.suggestion.proposed}</Button>}
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Button variant="outline" disabled={busy} onClick={() => send(false)}>Check</Button>
        <Button disabled={busy || blocked} onClick={() => send(true)}>{busy ? "Saving…" : "Save record"}</Button>
      </div>
      {toast && (
        <div role={toast.ok ? "status" : "alert"} className={`fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border-l-4 bg-card p-4 font-medium shadow-xl ${toast.ok ? "border-emerald-600 text-emerald-900" : "border-red-600 text-red-900"}`}>
          {toast.text}
        </div>
      )}
    </div>
  );
}
