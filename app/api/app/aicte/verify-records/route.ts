import { NextResponse } from "next/server";
import { z } from "zod";
import { appendAudit } from "@/lib/audit";
import { AICTE_ROLES, apiProfile } from "@/lib/auth/api";
import { issueForEnrolment } from "@/lib/credentials/service";
import { readJson, route } from "@/lib/http";
import { createAdminSupabase } from "@/lib/supabase/admin";

const body = z.object({ enrolmentIds: z.array(z.uuid()).min(1).max(100) });

export const POST = route(async (req) => {
  const profile = await apiProfile(req, AICTE_ROLES);
  const { enrolmentIds } = body.parse(await readJson(req));
  const admin = createAdminSupabase();
  const { data: rows } = await admin.from("enrolments").select("id").in("id", enrolmentIds).in("validation_status", ["Clean", "Flagged"]).eq("enrolment_status", "Active");
  const issued: string[] = [];
  for (const { id } of rows ?? []) {
    await admin.from("enrolments").update({ validation_status: "Verified", updated_by: profile.userId }).eq("id", id);
    await appendAudit(admin, { actorId: profile.userId, actorRole: profile.role, action: "record.verify", entity: "enrolment", entityId: id });
    issued.push(await issueForEnrolment(admin, id, { id: profile.userId, role: profile.role }));
  }
  return NextResponse.json({ verified: issued.length, recordIds: issued });
});
