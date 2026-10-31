"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Candidate { id: string; name: string; masked: string; program: string; institution: string }
type Position = "beside-id" | "below-name" | "footer";

const POSITIONS: { value: Position; label: string }[] = [
  { value: "beside-id", label: "Beside the Student ID" },
  { value: "below-name", label: "On its own line, below the ID" },
  { value: "footer", label: "In the footer" },
];

export function CertificateDesigner({ candidates, university }: { candidates: Candidate[]; university: string }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(candidates.slice(0, 3).map((c) => c.id)));
  const [apaarList, setApaarList] = useState("");
  const [position, setPosition] = useState<Position>("beside-id");
  const [showQr, setShowQr] = useState(true);
  const [fontSize, setFontSize] = useState(11);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sample = candidates.find((c) => selected.has(c.id)) ?? candidates[0];
  const apaarLine = "APAAR ID: 1234-5678-9012";

  const generate = async () => {
    setBusy(true);
    setError("");
    try {
      const apaarIds = apaarList.split(/[\s,]+/).map((v) => v.trim()).filter(Boolean);
      const res = await fetch("/api/app/university/certificates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrolmentIds: [...selected], apaarIds, layout: { position, showQr, fontSize } }),
      });
      if (!res.ok) throw new Error((await res.json()).error?.message ?? "Could not generate certificates.");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = "sutra_certificates.zip";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <div className="space-y-4">
        <fieldset className="space-y-2">
          <legend className="font-medium">Where should the APAAR ID go?</legend>
          {POSITIONS.map((p) => <label key={p.value} className="flex items-center gap-2 text-sm"><input type="radio" name="position" checked={position === p.value} onChange={() => setPosition(p.value)} />{p.label}</label>)}
        </fieldset>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showQr} onChange={(e) => setShowQr(e.target.checked)} />Add a verification QR code</label>
        <label className="block text-sm font-medium">Font size: {fontSize} pt
          <input type="range" min={8} max={16} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} className="mt-1 block w-48" />
        </label>
        <div>
          <p className="mb-1 font-medium">Choose students ({selected.size})</p>
          <div className="max-h-64 overflow-auto rounded-md border">
            {candidates.map((c) => (
              <label key={c.id} className="flex items-center gap-2 border-b p-2 text-sm last:border-0">
                <input type="checkbox" checked={selected.has(c.id)} onChange={(e) => { const next = new Set(selected); if (e.target.checked) next.add(c.id); else next.delete(c.id); setSelected(next); }} />
                <span>{c.name} <span className="text-xs text-muted-foreground">{c.masked}, {c.program}, {c.institution}</span></span>
              </label>
            ))}
          </div>
        </div>
        <label className="block text-sm font-medium">Or paste a list of APAAR IDs
          <textarea rows={3} value={apaarList} onChange={(e) => setApaarList(e.target.value)} placeholder="One per line" className="mt-1 w-full rounded-md border border-input bg-card p-2 text-sm font-normal" />
        </label>
        <Button disabled={busy} onClick={generate}><Download className="h-4 w-4" aria-hidden />{busy ? "Generating…" : "Generate ZIP of PDFs"}</Button>
        {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
      </div>
      <div>
        <p className="mb-1 font-medium">Live preview (sample template)</p>
        <div aria-label="Certificate preview" className="relative aspect-[842/595] rounded border-2 border-primary bg-white p-[4%] text-center text-primary">
          <p className="text-lg font-bold">{university}</p>
          <p className="text-sm">Certificate of Enrolment</p>
          <p className="mt-3 text-xs">This is to certify that</p>
          <p className="text-xl font-bold">{sample?.name ?? "Student Name"}</p>
          {position === "beside-id" && <p style={{ fontSize: fontSize * 0.9 }}>Student ID: STU-12345678 &nbsp; {apaarLine}</p>}
          {position === "below-name" && <><p className="text-xs">Student ID: STU-12345678</p><p className="font-semibold" style={{ fontSize: fontSize * 0.9 }}>{apaarLine}</p></>}
          {position === "footer" && <p className="text-xs">Student ID: STU-12345678</p>}
          <p className="mt-2 text-xs">is enrolled in</p>
          <p className="font-semibold">{sample?.program ?? "Program"}</p>
          <p className="text-xs">at {sample?.institution ?? "Institution"}</p>
          {position === "footer" && <p className="absolute inset-x-0 bottom-[6%] font-semibold" style={{ fontSize: fontSize * 0.9 }}>{apaarLine}</p>}
          <div className={cn("absolute bottom-[6%] right-[3%] flex h-[16%] aspect-square items-center justify-center border border-dashed text-[10px]", !showQr && "hidden")}>QR</div>
        </div>
      </div>
    </div>
  );
}
