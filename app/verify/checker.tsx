"use client";

import { FlaskConical, Search, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/components/action-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VerdictCard, type VerdictFields } from "@/app/verify/verdict";

interface Result { verdict: string; fields?: VerdictFields; revokedReason?: string | null; recordId: string }

export function Checker() {
  const router = useRouter();
  const [lookup, setLookup] = useState("");
  const [json, setJson] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const check = async (text: string, label = "") => {
    setError("");
    setResult(null);
    try {
      const parsed: unknown = JSON.parse(text);
      setResult(await postJson<Result>("/api/app/public/verify-json", parsed));
      setNote(label);
    } catch (e) {
      setError(e instanceof SyntaxError ? "That is not valid JSON." : (e as Error).message);
    }
  };
  const fakeQr = async () => {
    const res = await fetch("/api/app/public/forged-sample");
    const text = await res.text();
    setJson(JSON.stringify(JSON.parse(text), null, 2));
    await check(text, "Fake QR test: one field was changed from \"B.Tech\" to \"MBBS\", keeping the real signature.");
  };

  return (
    <div className="space-y-6">
      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); const id = lookup.trim().split("/").pop(); if (id) router.push(`/verify/${encodeURIComponent(id)}`); }}>
        <Label htmlFor="lookup">Record ID or QR link</Label>
        <div className="flex gap-2">
          <Input id="lookup" value={lookup} onChange={(e) => setLookup(e.target.value)} placeholder="SUTRA-DEMO-VALID" />
          <Button type="submit"><Search className="h-4 w-4" aria-hidden />Check</Button>
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => router.push("/verify/SUTRA-DEMO-VALID")}>Try a valid record</Button>
        <Button variant="outline" onClick={() => router.push("/verify/SUTRA-DEMO-REVOKED")}>Try a revoked record</Button>
        <Button variant="outline" onClick={fakeQr}><FlaskConical className="h-4 w-4" aria-hidden />Fake QR test</Button>
      </div>

      <div className="space-y-2">
        <Label htmlFor="json">Verify by uploading credential JSON</Label>
        <textarea id="json" rows={6} value={json} onChange={(e) => setJson(e.target.value)} placeholder="Paste the credential JSON here" className="w-full rounded-md border border-input bg-card p-2 font-mono text-xs" />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => check(json)} disabled={!json.trim()}>Check JSON</Button>
          <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-input bg-card px-4 text-sm font-medium hover:bg-accent focus-within:ring-2 focus-within:ring-ring">
            <Upload className="h-4 w-4" aria-hidden />Choose a .json file
            <input type="file" accept=".json,application/json" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (f && f.size < 100_000) { const t = await f.text(); setJson(t); await check(t); } e.target.value = ""; }} />
          </label>
        </div>
      </div>

      {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-900">{error}</p>}
      {result && <VerdictCard verdict={result.verdict} fields={result.fields} reason={result.revokedReason} note={note} />}
    </div>
  );
}
