"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/components/action-button";
import { MAX_UPLOAD_BYTES } from "@/lib/validation/columns";

export function ResultsUploader() {
  const router = useRouter();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const onFile = async (file: File) => {
    setBusy(true);
    setMessage(null);
    try {
      if (!/\.csv$/i.test(file.name)) throw new Error("Please choose a .csv file.");
      if (file.size > MAX_UPLOAD_BYTES) throw new Error("This file is larger than the 5 MB limit.");
      const Papa = (await import("papaparse")).default;
      const { data } = Papa.parse<Record<string, string>>(await file.text(), { header: true, skipEmptyLines: "greedy" });
      const out = await postJson<{ rows: number; digest: string }>("/api/app/university/results", { fileName: file.name, rows: data });
      setMessage({ ok: true, text: `Published and signed ${out.rows} results. Digest ${out.digest.slice(0, 16)}…` });
      router.refresh();
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Columns: <code>apaar_id, semester, percentage, sgpa, result_status</code> (Pass, Fail or Detained).</p>
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-md border-2 border-dashed p-8 text-center focus-within:ring-2 focus-within:ring-ring">
        <Upload className="h-6 w-6 text-muted-foreground" aria-hidden />
        <span className="font-medium">{busy ? "Publishing…" : "Choose a results CSV"}</span>
        <input type="file" accept=".csv" className="sr-only" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }} />
      </label>
      {message && <p role="status" className={`rounded-md p-3 text-sm ${message.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-900"}`}>{message.text}</p>}
    </div>
  );
}
