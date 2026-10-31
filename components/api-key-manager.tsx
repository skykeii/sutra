"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActionButton, postJson } from "@/components/action-button";
import { StatusBadge } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface KeyRow { id: string; name: string | null; key_prefix: string; scopes: string[]; revoked_at: string | null; last_used_at: string | null }

export function ApiKeyManager({ keys, canManage = true }: { keys: KeyRow[]; canManage?: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [error, setError] = useState("");
  return (
    <div className="space-y-3">
      {keys.length === 0 ? <p className="text-sm text-muted-foreground">No API keys yet.</p> : (
        <ul className="divide-y rounded-md border">
          {keys.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 p-2 text-sm">
              <span><span className="font-medium">{k.name}</span> <code className="text-xs">{k.key_prefix}…</code> <span className="text-xs text-muted-foreground">{k.scopes.join(", ")}</span></span>
              <span className="flex items-center gap-2">
                <StatusBadge status={k.revoked_at ? "Revoked" : "Active"} />
                {canManage && !k.revoked_at && <ActionButton size="sm" variant="outline" url="/api/app/keys" body={{ action: "revoke", id: k.id }} confirm="Revoke this key? Anything using it will stop working.">Revoke</ActionButton>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {created && (
        <div role="status" className="rounded-md bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-medium">Copy this key now. It will not be shown again.</p>
          <code className="mt-1 block break-all text-xs">{created}</code>
        </div>
      )}
      {canManage ? (
        <form className="flex flex-wrap gap-2" onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          try {
            const r = await postJson<{ key: string }>("/api/app/keys", { action: "create", name });
            setCreated(r.key);
            setName("");
            router.refresh();
          } catch (err) {
            setError((err as Error).message);
          }
        }}>
          <Input aria-label="Key name" required minLength={2} placeholder="Name, such as ERP system" value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" />
          <Button type="submit">Create key</Button>
        </form>
      ) : <p className="text-sm text-muted-foreground">Only your institution&apos;s admin can create or revoke keys.</p>}
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    </div>
  );
}
