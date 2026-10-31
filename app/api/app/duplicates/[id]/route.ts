import { NextResponse } from "next/server";
import { z } from "zod";
import { appendAudit } from "@/lib/audit";
import { AICTE_ROLES, apiProfile } from "@/lib/auth/api";
import { route } from "@/lib/http";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const profile = await apiProfile(req, AICTE_ROLES);
  const { id } = await params;
  const admin = createAdminSupabase();
  const { error } = await admin.from("cross_matches").update({ status: "Resolved" }).eq("id", z.uuid().parse(id));
  if (error) throw new Error(error.message);
  await appendAudit(admin, { actorId: profile.userId, actorRole: profile.role, action: "cross_match.resolve", entity: "cross_match", entityId: id });
  return NextResponse.json({ ok: true });
});
