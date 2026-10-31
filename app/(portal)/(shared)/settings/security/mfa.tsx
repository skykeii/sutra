"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/components/action-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Enrolment { factorId: string; qr: string; secret: string }

export function MfaPanel({ verifiedFactorId, level }: { verifiedFactorId: string | null; level: string | null }) {
  const router = useRouter();
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const codeField = (factorId: string, label: string) => (
    <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void run(async () => { await postJson("/api/app/mfa", { action: "verify", factorId, code }); setCode(""); setEnrolment(null); router.refresh(); }); }}>
      <label className="text-sm font-medium">{label}
        <Input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className="mt-1 w-36" />
      </label>
      <Button type="submit" disabled={busy || code.length !== 6}>Confirm</Button>
    </form>
  );
  return (
    <div className="space-y-4">
      {verifiedFactorId ? (
        <>
          <p className="text-sm">Two-factor sign-in is on. {level === "aal2" ? "This session has passed the second step." : "Enter a code to complete this session."}</p>
          {level !== "aal2" && codeField(verifiedFactorId, "Code from your authenticator app")}
          {level === "aal2" && <Button variant="outline" disabled={busy} onClick={() => run(async () => { await postJson("/api/app/mfa", { action: "remove", factorId: verifiedFactorId }); router.refresh(); })}>Turn off two-factor sign-in</Button>}
        </>
      ) : enrolment ? (
        <div className="space-y-3">
          <p className="text-sm">Scan this with an authenticator app, or enter the key by hand.</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- Supabase returns this QR as a data URL */}
          <img src={enrolment.qr} alt="Two-factor setup QR code" width={180} height={180} className="rounded border bg-white" />
          <code className="block break-all text-xs">{enrolment.secret}</code>
          {codeField(enrolment.factorId, "Then enter the 6-digit code")}
        </div>
      ) : (
        <Button disabled={busy} onClick={() => run(async () => setEnrolment(await postJson<Enrolment>("/api/app/mfa", { action: "enroll" })))}>Turn on two-factor sign-in</Button>
      )}
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    </div>
  );
}
