"use client";

import { useState } from "react";
import { postJson } from "@/components/action-button";

export function Reveal({ studentId, field, masked, canReveal }: { studentId: string; field: "mobile" | "email"; masked: string; canReveal: boolean }) {
  const [value, setValue] = useState<string | null>(null);
  const [error, setError] = useState(false);
  return (
    <span className="whitespace-nowrap">
      {value ?? masked}
      {canReveal && !value && masked && (
        <button
          type="button"
          className="ml-2 text-xs text-primary underline"
          title="This is recorded in the audit trail"
          onClick={async () => {
            try {
              setValue((await postJson<{ value: string }>("/api/app/reveal", { studentId, field })).value);
            } catch {
              setError(true);
            }
          }}
        >
          Reveal
        </button>
      )}
      {error && <span className="ml-2 text-xs text-red-800">Could not reveal</span>}
    </span>
  );
}
