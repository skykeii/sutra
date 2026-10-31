"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/components/action-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WEBHOOK_EVENTS } from "@/lib/webhook-events";

export function WebhookForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>([...WEBHOOK_EVENTS]);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState("");
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault();
      setError("");
      try {
        const r = await postJson<{ secret: string }>("/api/app/webhooks", { action: "create", url, events });
        setSecret(r.secret);
        setUrl("");
        router.refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    }}>
      <Input aria-label="Webhook address" type="url" required placeholder="https://your-system.example/hooks/sutra" value={url} onChange={(e) => setUrl(e.target.value)} />
      <fieldset className="flex flex-wrap gap-3 text-sm">
        <legend className="sr-only">Events</legend>
        {WEBHOOK_EVENTS.map((ev) => (
          <label key={ev} className="flex items-center gap-1"><input type="checkbox" checked={events.includes(ev)} onChange={(e) => setEvents(e.target.checked ? [...events, ev] : events.filter((x) => x !== ev))} />{ev}</label>
        ))}
      </fieldset>
      <Button type="submit" disabled={!events.length}>Add webhook</Button>
      {secret && <p role="status" className="rounded-md bg-amber-50 p-3 text-sm text-amber-950">Signing secret (shown once): <code className="break-all text-xs">{secret}</code></p>}
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    </form>
  );
}
