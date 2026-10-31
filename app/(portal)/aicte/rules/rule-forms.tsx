"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/components/action-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const RULE_LABELS: Record<string, string> = { MIN_QUALIFYING_PCT: "Minimum qualifying marks (%)", MAX_AGE: "Maximum age at admission", REQUIRED_STREAM: "Required stream" };

export function RuleValue({ id, level, programId, ruleType, value, canEdit }: { id: string; level: string | null; programId: string | null; ruleType: string; value: string; canEdit: boolean }) {
  const router = useRouter();
  const [current, setCurrent] = useState(value);
  const [error, setError] = useState("");
  if (!canEdit) return <span>{value}</span>;
  const send = async (body: unknown) => {
    setError("");
    try {
      await postJson("/api/app/aicte/rules", body);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Input aria-label={RULE_LABELS[ruleType]} value={current} onChange={(e) => setCurrent(e.target.value)} className="h-8 w-28" />
      <Button size="sm" variant="outline" disabled={current === value} onClick={() => send({ action: "save", id, level, program_id: programId, rule_type: ruleType, value: current })}>Save</Button>
      <Button size="sm" variant="ghost" onClick={() => send({ action: "delete", id })}>Remove</Button>
      {error && <span role="alert" className="text-xs text-red-800">{error}</span>}
    </span>
  );
}

export function AddRule({ programs }: { programs: { id: string; label: string }[] }) {
  const router = useRouter();
  const [target, setTarget] = useState("level:UG");
  const [ruleType, setRuleType] = useState("MIN_QUALIFYING_PCT");
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const selectClass = "h-10 rounded-md border border-input bg-card px-2 text-sm";
  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => {
      e.preventDefault();
      setError("");
      const [kind, id] = target.split(":");
      try {
        await postJson("/api/app/aicte/rules", { action: "save", level: kind === "level" ? id : null, program_id: kind === "program" ? id : null, rule_type: ruleType, value });
        setValue("");
        router.refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    }}>
      <label className="text-sm font-medium">Applies to<br />
        <select value={target} onChange={(e) => setTarget(e.target.value)} className={`${selectClass} max-w-xs`}>
          {["UG", "PG", "Diploma", "PGDM"].map((l) => <option key={l} value={`level:${l}`}>All {l} programs</option>)}
          {programs.map((p) => <option key={p.id} value={`program:${p.id}`}>{p.label}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium">Rule<br />
        <select value={ruleType} onChange={(e) => setRuleType(e.target.value)} className={selectClass}>
          {Object.entries(RULE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium">Value<br /><Input required value={value} onChange={(e) => setValue(e.target.value)} className="w-32" /></label>
      <Button type="submit">Add rule</Button>
      {error && <p role="alert" className="w-full text-sm text-red-800">{error}</p>}
    </form>
  );
}
