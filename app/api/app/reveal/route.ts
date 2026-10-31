import { NextResponse } from "next/server";
import { z } from "zod";
import { appendAudit } from "@/lib/audit";
import { apiProfile } from "@/lib/auth/api";
import { decryptField } from "@/lib/crypto";
import { ApiError, readJson, route } from "@/lib/http";
import { createAdminSupabase } from "@/lib/supabase/admin";

const COLUMNS = { mobile: "mobile_enc", email: "email_enc", passport: "passport_no_enc", apaar: "apaar_id_enc" } as const;
const body = z.object({ studentId: z.uuid(), field: z.enum(["mobile", "email", "passport", "apaar"]) });

// AICTE admin only, and every reveal is audited by field name, never by value.
export const POST = route(async (req) => {
  const profile = await apiProfile(req, ["aicte_admin"]);
  const { studentId, field } = body.parse(await readJson(req));
  const admin = createAdminSupabase();
  const column = COLUMNS[field];
  const { data } = await admin.from("students").select(column).eq("id", studentId).maybeSingle();
  const stored = (data as Record<string, string | null> | null)?.[column];
  if (!stored) throw new ApiError(404, "NOT_FOUND", "There is no value to show.");
  await appendAudit(admin, { actorId: profile.userId, actorRole: profile.role, action: "pii.reveal", entity: "student", entityId: studentId, meta: { field } });
  return NextResponse.json({ value: decryptField(stored) }, { headers: { "Cache-Control": "no-store" } });
});
