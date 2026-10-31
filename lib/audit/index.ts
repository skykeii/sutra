import type { SupabaseClient } from "@supabase/supabase-js";

export interface AuditEvent {
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  // Never raw PII: counts, rule codes, and masked values only.
  meta?: Record<string, unknown>;
  at?: string;
}

export async function appendAudit(admin: SupabaseClient, event: AuditEvent): Promise<void> {
  const { error } = await admin.rpc("append_audit", {
    p_actor_id: event.actorId ?? null,
    p_actor_role: event.actorRole ?? null,
    p_action: event.action,
    p_entity: event.entity,
    p_entity_id: event.entityId ?? null,
    p_meta: event.meta ?? {},
    p_at: event.at ?? new Date().toISOString(),
  });
  if (error) throw new Error(`Audit write failed: ${error.message}`);
}
