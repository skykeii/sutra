import type { SupabaseClient } from "@supabase/supabase-js";
import { appendAudit } from "@/lib/audit";
import { fireWebhook, type WebhookEvent } from "@/lib/webhooks";

export interface AlertInput {
  code: string;
  severity?: "Error" | "Warning" | "Info";
  institutionId?: string | null;
  programId?: string | null;
  title: string;
  message: string;
  meta?: Record<string, unknown>;
  webhook?: { event: WebhookEvent; payload: Record<string, unknown> };
}

// Alert messages reach AICTE only. Keep them to institution names and counts, never student data.
export async function raiseAlert(admin: SupabaseClient, alert: AlertInput): Promise<void> {
  const { error } = await admin.from("alerts").insert({
    code: alert.code,
    severity: alert.severity ?? "Error",
    institution_id: alert.institutionId ?? null,
    program_id: alert.programId ?? null,
    title: alert.title,
    message: alert.message,
    meta: alert.meta ?? {},
  });
  if (error) throw new Error(`Could not raise alert: ${error.message}`);
  await appendAudit(admin, { actorRole: "system", action: "alert.raise", entity: "alert", entityId: alert.code, meta: { rule_code: alert.code, institution_id: alert.institutionId ?? null } });

  const { data: staff } = await admin.from("profiles").select("user_id").in("role", ["aicte_admin", "aicte_officer"]);
  if (staff?.length) {
    await admin.from("notifications").insert(staff.map((s) => ({ user_id: s.user_id, title: alert.title, body: alert.message, link: "/aicte/alerts" })));
  }
  if (alert.webhook) await fireWebhook(admin, alert.institutionId ?? null, alert.webhook.event, alert.webhook.payload);
}
