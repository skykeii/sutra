"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/components/action-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ConsentDecision({ id }: { id: string }) {
  const router = useRouter();
  const [sent, setSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [days, setDays] = useState(7);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const act = async (body: Record<string, unknown>, after?: () => void) => {
    setBusy(true);
    setError("");
    try {
      await postJson(`/api/app/student/consents/${id}`, body);
      after?.();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      {!sent ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} onClick={() => act({ action: "otp" }, () => setSent(true))}>Approve with a code</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => act({ action: "deny" })}>Deny</Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-medium">Code from the simulated SMS inbox
            <Input inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} className="mt-1 h-9 w-32" />
          </label>
          <label className="text-xs font-medium">Access lasts
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="mt-1 block h-9 rounded-md border border-input bg-card px-2 text-sm">
              {[1, 7, 30].map((d) => <option key={d} value={d}>{d === 1 ? "1 day" : `${d} days`}</option>)}
            </select>
          </label>
          <Button size="sm" className="h-9" disabled={busy || otp.length !== 6} onClick={() => act({ action: "approve", otp, days })}>Confirm</Button>
          <Button size="sm" variant="ghost" className="h-9" disabled={busy} onClick={() => act({ action: "otp" })}>Send a new code</Button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    </div>
  );
}
