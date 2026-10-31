import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { appendAudit } from "@/lib/audit";
import { apiProfile } from "@/lib/auth/api";
import { encryptField } from "@/lib/crypto";
import { ApiError, readJson, route } from "@/lib/http";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { fireWebhook, isAllowedWebhookUrl, WEBHOOK_EVENTS } from "@/lib/webhooks";

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), url: z.url().max(500), events: z.array(z.enum(WEBHOOK_EVENTS)).min(1) }),
  z.object({ action: z.literal("delete"), id: z.uuid() }),
  z.object({ action: z.literal("test"), id: z.uuid() }),
]);

export const POST = route(async (req) => {
  const profile = await apiProfile(req, ["institution_admin"]);
  const input = body.parse(await readJson(req));
  const admin = createAdminSupabase();
  const owner = profile.institutionId!;
  const actor = { actorId: profile.userId, actorRole: profile.role };
  if (input.action === "create") {
    if (!isAllowedWebhookUrl(input.url)) throw new ApiError(400, "BAD_URL", "Webhook addresses must use https and cannot point at private networks.");
    const secret = randomBytes(24).toString("hex");
    const { data, error } = await admin.from("webhooks").insert({ owner_id: owner, url: input.url, events: input.events, secret_enc: encryptField(secret) }).select("id").single();
    if (error) throw new Error(error.message);
    await appendAudit(admin, { ...actor, action: "webhook.create", entity: "webhook", entityId: data.id, meta: { events: input.events } });
    return NextResponse.json({ secret }, { headers: { "Cache-Control": "no-store" } });
  }
  const { data: hook } = await admin.from("webhooks").select("id, events").eq("id", input.id).eq("owner_id", owner).maybeSingle();
  if (!hook) throw new ApiError(404, "NOT_FOUND", "That webhook was not found.");
  if (input.action === "test") {
    await fireWebhook(admin, owner, hook.events[0], { test: true });
    return NextResponse.json({ ok: true });
  }
  await admin.from("webhooks").delete().eq("id", hook.id);
  await appendAudit(admin, { ...actor, action: "webhook.delete", entity: "webhook", entityId: hook.id });
  return NextResponse.json({ ok: true });
});
