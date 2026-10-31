"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";

export async function postJson<T = Record<string, unknown>>(url: string, body: unknown = {}): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error?.message ?? "That did not work. Please try again.");
  return json as T;
}

/** Posts to an app route, then refreshes the server-rendered page around it. */
export function ActionButton({ url, body, children, confirm: confirmText, done, ...props }: ButtonProps & { url: string; body?: unknown; confirm?: string; done?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        {...props}
        disabled={busy || props.disabled}
        onClick={async () => {
          if (confirmText && !window.confirm(confirmText)) return;
          setBusy(true);
          setMessage(null);
          try {
            await postJson(url, body);
            if (done) setMessage({ ok: true, text: done });
            router.refresh();
          } catch (e) {
            setMessage({ ok: false, text: (e as Error).message });
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Working…" : children}
      </Button>
      {message && <span role="status" className={`text-xs ${message.ok ? "text-emerald-800" : "text-red-800"}`}>{message.text}</span>}
    </span>
  );
}
