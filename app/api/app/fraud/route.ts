import { NextResponse } from "next/server";
import { z } from "zod";
import { appendAudit } from "@/lib/audit";
import { AICTE_ROLES, apiProfile } from "@/lib/auth/api";
import { runDetection } from "@/lib/fraud";
import { readJson, route } from "@/lib/http";
import { createAdminSupabase } from "@/lib/supabase/admin";

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("run") }),
  z.object({ action: z.literal("status"), id: z.uuid(), status: z.enum(["Open", "Under review", "Cleared", "Escalated"]) }),
]);

export const POST = route(async (req) => {
  const profile = await apiProfile(req, AICTE_ROLES);
  const input = body.parse(await readJson(req));
  const admin = createAdminSupabase();
  if (input.action === "run") return NextResponse.json(await runDetection(admin, { id: profile.userId, role: profile.role }));
  const { error } = await admin.from("fraud_clusters").update({ status: input.status }).eq("id", input.id);
  if (error) throw new Error(error.message);
  await appendAudit(admin, { actorId: profile.userId, actorRole: profile.role, action: "fraud.status", entity: "fraud_cluster", entityId: input.id, meta: { status: input.status } });
  return NextResponse.json({ ok: true });
});
