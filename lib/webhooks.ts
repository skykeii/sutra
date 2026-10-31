import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptField } from "@/lib/crypto";
import type { WebhookEvent } from "@/lib/webhook-events";

export { WEBHOOK_EVENTS, type WebhookEvent } from "@/lib/webhook-events";

// Blocks the obvious internal targets; localhost stays allowed in demo mode for the built-in sink.
export function isAllowedWebhookUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const internal = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\]|0\.)/.test(u.hostname);
    if (process.env.DEMO_MODE === "true") return u.protocol === "https:" || u.protocol === "http:";
    return u.protocol === "https:" && !internal;
  } catch {
    return false;
  }
}

export async function fireWebhook(admin: SupabaseClient, institutionId: string | null, event: WebhookEvent, payload: Record<string, unknown>): Promise<void> {
  if (!institutionId) return;
  const { data: hooks } = await admin.from("webhooks").select("id, url, secret_enc, events").eq("owner_id", institutionId).contains("events", [event]);
  await Promise.all(
    (hooks ?? []).map(async (hook) => {
      const body = JSON.stringify({ event, at: new Date().toISOString(), data: payload });
      let status: number | null = null;
      let ok = false;
      try {
        const signature = createHmac("sha256", decryptField(hook.secret_enc)).update(body).digest("hex");
        const res = await fetch(hook.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Signature": signature, "X-Sutra-Event": event },
          body,
          redirect: "error",
          signal: AbortSignal.timeout(4000),
        });
        status = res.status;
        ok = res.ok;
      } catch {
        ok = false;
      }
      await admin.from("webhook_deliveries").insert({ webhook_id: hook.id, event, status_code: status, ok });
    }),
  );
}
