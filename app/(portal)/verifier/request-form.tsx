"use client";

import Link from "next/link";
import { useState } from "react";
import { postJson } from "@/components/action-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function RequestForm() {
  const [lookup, setLookup] = useState("");
  const [purpose, setPurpose] = useState("Pre-employment verification");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="max-w-xl space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMessage(null);
        try {
          const r = await postJson<{ alreadyPending: boolean }>("/api/app/verifier/request", { lookup, purpose });
          setMessage({ ok: true, text: r.alreadyPending ? "You already have a request waiting for this student." : "Request sent. The student has been asked to approve it." });
          setLookup("");
        } catch (err) {
          setMessage({ ok: false, text: (err as Error).message });
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="lookup">APAAR ID or QR link</Label>
        <Input id="lookup" required value={lookup} onChange={(e) => setLookup(e.target.value)} placeholder="12-digit APAAR ID, or paste the link from the student's QR code" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="purpose">Why do you need this?</Label>
        <Input id="purpose" required value={purpose} onChange={(e) => setPurpose(e.target.value)} />
      </div>
      <Button type="submit" disabled={busy}>{busy ? "Sending…" : "Ask the student for consent"}</Button>
      {message && (
        <p role="status" className={`text-sm ${message.ok ? "text-emerald-800" : "text-red-800"}`}>
          {message.text} {message.ok && <Link className="underline" href="/verifier/requests">See my requests</Link>}
        </p>
      )}
    </form>
  );
}
