"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/components/action-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function useProposal() {
  const router = useRouter();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const send = async (body: unknown, reset: () => void) => {
    setBusy(true);
    setMessage(null);
    try {
      await postJson("/api/app/approvals", body);
      setMessage({ ok: true, text: "Sent. A different AICTE admin must now approve it." });
      reset();
      router.refresh();
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const note = message && <p role="status" className={`text-sm ${message.ok ? "text-emerald-800" : "text-red-800"}`}>{message.text}</p>;
  return { send, busy, note };
}

export function RevokeForm() {
  const [recordId, setRecordId] = useState("");
  const [reason, setReason] = useState("");
  const { send, busy, note } = useProposal();
  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void send({ action_type: "REVOKE_RECORD", payload: { record_id: recordId.trim(), reason } }, () => { setRecordId(""); setReason(""); }); }}>
      <Input aria-label="Record ID" placeholder="Record ID, such as SUTRA-1A2B3C4D5E" required value={recordId} onChange={(e) => setRecordId(e.target.value)} />
      <Input aria-label="Reason" placeholder="Reason" required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      <Button type="submit" variant="outline" disabled={busy}>Propose revocation</Button>
      {note}
    </form>
  );
}

export function IntakeForm({ programs }: { programs: { id: string; label: string }[] }) {
  const [programId, setProgramId] = useState(programs[0]?.id ?? "");
  const [intake, setIntake] = useState("");
  const [reason, setReason] = useState("");
  const { send, busy, note } = useProposal();
  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void send({ action_type: "CHANGE_INTAKE", payload: { program_id: programId, new_intake: Number(intake), reason } }, () => { setIntake(""); setReason(""); }); }}>
      <select aria-label="Program" value={programId} onChange={(e) => setProgramId(e.target.value)} className="h-10 w-full rounded-md border border-input bg-card px-2 text-sm">
        {programs.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
      <Input aria-label="New approved intake" type="number" min={1} placeholder="New approved intake" required value={intake} onChange={(e) => setIntake(e.target.value)} />
      <Input aria-label="Reason" placeholder="Reason" required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      <Button type="submit" variant="outline" disabled={busy}>Propose intake change</Button>
      {note}
    </form>
  );
}
