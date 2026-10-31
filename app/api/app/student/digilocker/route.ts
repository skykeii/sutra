import { NextResponse } from "next/server";
import { z } from "zod";
import { digilockerAdapter } from "@/lib/adapters/digilocker";
import { appendAudit } from "@/lib/audit";
import { apiProfile } from "@/lib/auth/api";
import { ApiError, readJson, route } from "@/lib/http";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";

const body = z.object({ recordId: z.string().min(3).max(60) });

export const POST = route(async (req) => {
  const profile = await apiProfile(req, ["student"]);
  const { recordId } = body.parse(await readJson(req));
  const supabase = await createServerSupabase();
  const { data: cred } = await supabase.from("credentials").select("record_id, enrolments(student_id)").eq("record_id", recordId).maybeSingle();
  if (!cred) throw new ApiError(404, "NOT_FOUND", "That record was not found.");
  const studentId = (cred.enrolments as unknown as { student_id: string }).student_id;
  const admin = createAdminSupabase();
  await digilockerAdapter(admin).pushRecord({ studentId, recordId });
  await appendAudit(admin, { actorId: profile.userId, actorRole: profile.role, action: "digilocker.push", entity: "credential", entityId: recordId, meta: { simulated: true } });
  return NextResponse.json({ ok: true, simulated: true });
});
