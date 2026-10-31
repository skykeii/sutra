"use client";

import { Radio, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { StatusBadge } from "@/components/shared";
import { createBrowserSupabase } from "@/lib/supabase/browser";

async function connect(tables: string[], onEvent: (table: string, row: Record<string, unknown>) => void): Promise<() => void> {
  const client = createBrowserSupabase();
  const res = await fetch("/api/app/realtime-token");
  const { token } = (await res.json()) as { token: string | null };
  if (token) await client.realtime.setAuth(token);
  let channel = client.channel(`sutra-live-${Math.random().toString(36).slice(2)}`);
  for (const table of tables) {
    channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, (payload) => onEvent(table, payload.new as Record<string, unknown>));
  }
  channel.subscribe();
  return () => { void client.removeChannel(channel); };
}

/** Re-renders the server component page whenever watched tables change, with no manual refresh. */
export function LiveRefresh({ tables }: { tables: string[] }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    void connect(tables, () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 800);
    }).then((fn) => {
      if (cancelled) fn();
      else { stop = fn; setConnected(true); }
    }).catch(() => setConnected(false));
    return () => { cancelled = true; stop?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Radio className={`h-3.5 w-3.5 ${connected ? "text-emerald-600" : ""}`} aria-hidden />{connected ? "Live" : "Connecting…"}</span>;
}

export interface FeedAlert {
  id: string;
  code: string;
  severity: string;
  title: string;
  message: string;
  created_at: string;
}

export function LiveAlertFeed({ initial }: { initial: FeedAlert[] }) {
  const [alerts, setAlerts] = useState(initial);
  const [toast, setToast] = useState<FeedAlert | null>(null);
  useEffect(() => setAlerts(initial), [initial]);
  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    void connect(["alerts"], (_table, row) => {
      if (!row.id || row.status !== "Open") return;
      const alert = row as unknown as FeedAlert;
      setAlerts((list) => (list.some((a) => a.id === alert.id) ? list : [alert, ...list].slice(0, 15)));
      setToast(alert);
    }).then((fn) => {
      if (cancelled) fn();
      else stop = fn;
    }).catch(() => undefined);
    return () => { cancelled = true; stop?.(); };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <>
      {alerts.length === 0 ? <p className="text-sm text-muted-foreground">No open alerts. New ones appear here as they happen.</p> : (
        <ul className="max-h-96 space-y-2 overflow-auto" aria-live="polite">
          {alerts.map((a) => (
            <li key={a.id} className="rounded-md border p-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <Link href="/aicte/alerts" className="font-medium hover:underline">{a.title}</Link>
                <StatusBadge status={a.severity} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{a.message}</p>
            </li>
          ))}
        </ul>
      )}
      {toast && (
        <div role="alert" className="fixed bottom-4 right-4 z-50 flex max-w-sm items-start gap-3 rounded-lg border-l-4 border-red-600 bg-card p-4 shadow-xl">
          <div>
            <p className="font-semibold">New alert: {toast.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{toast.message}</p>
          </div>
          <button type="button" aria-label="Dismiss" onClick={() => setToast(null)} className="rounded p-1 hover:bg-accent"><X className="h-4 w-4" aria-hidden /></button>
        </div>
      )}
    </>
  );
}
