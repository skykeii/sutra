import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptField } from "@/lib/crypto";
import type { WebhookEvent } from "@/lib/webhook-events";
import { publicOnlyLookup, signWebhook, webhookUrlProblem } from "@/lib/webhook-guard";

export { WEBHOOK_EVENTS, type WebhookEvent } from "@/lib/webhook-events";

const DELIVERY_TIMEOUT_MS = 5000;

// No redirects are followed, and the response body is never read, which caps its size at nothing.
function post(url: string, headers: Record<string, string>, body: string): Promise<number> {
  const target = new URL(url);
  const send = target.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const request = send(
      target,
      {
        method: "POST",
        headers: { ...headers, "Content-Length": String(Buffer.byteLength(body)) },
        // Plain http only ever passes the guard for the local development sink.
        lookup: target.protocol === "https:" ? publicOnlyLookup : undefined,
        signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      },
      (response) => {
        resolve(response.statusCode ?? 0);
        response.destroy();
      },
    );
    request.on("error", reject);
    request.end(body);
  });
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
        if (!(await webhookUrlProblem(hook.url))) {
          status = await post(hook.url, { "Content-Type": "application/json", "X-Signature": signWebhook(decryptField(hook.secret_enc), body), "X-Sutra-Event": event, "X-Webhook-Id": hook.id }, body);
          ok = status >= 200 && status < 300;
        }
      } catch {
        ok = false;
      }
      await admin.from("webhook_deliveries").insert({ webhook_id: hook.id, event, status_code: status, ok });
    }),
  );
}
