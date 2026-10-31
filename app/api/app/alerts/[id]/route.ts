import { NextResponse } from "next/server";
import { z } from "zod";
import { appendAudit } from "@/lib/audit";
import { AICTE_ROLES, apiProfile } from "@/lib/auth/api";
import { readJson, route } from "@/lib/http";
import { createAdminSupabase } from "@/lib/supabase/admin";

const body = z.object({ status: z.enum(["Acknowledged", "Resolved"]) });

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const profile = await apiProfile(req, AICTE_ROLES);
  const { id } = await params;
  const { status } = body.parse(await readJson(req));
  const admin = createAdminSupabase();
  const { error } = await admin.from("alerts").update({ status }).eq("id", z.uuid().parse(id));
  if (error) throw new Error(error.message);
  await appendAudit(admin, { actorId: profile.userId, actorRole: profile.role, action: "alert.update", entity: "alert", entityId: id, meta: { status } });
  return NextResponse.json({ ok: true });
});
