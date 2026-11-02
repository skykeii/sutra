import { NextResponse } from "next/server";
import { z } from "zod";
import { appendAudit } from "@/lib/audit";
import { apiKeyOwner } from "@/lib/auth/api";
import { formatApaarLine } from "@/lib/certificates";
import { verifyUrl } from "@/lib/credentials/service";
import { decryptField } from "@/lib/crypto";
import { ApiError, route } from "@/lib/http";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const GET = route<{ params: Promise<{ studentId: string }> }>(async (req, { params }) => {
  const owner = await apiKeyOwner(req, "certificate:read");
  if (!owner.universityId) throw new ApiError(403, "API_KEY_SCOPE", "This endpoint needs a university key.");
  const studentId = z.uuid().parse((await params).studentId);
  const admin = createAdminSupabase();
  const { data: colleges } = await admin.from("institutions").select("id").eq("university_id", owner.universityId);
  // A lateral entrant also has an earlier diploma enrolment, so every enrolment is checked for a credential.
  const { data: enrolments } = await admin
    .from("enrolments")
    .select("id, students(apaar_id_enc), credentials(record_id, status)")
    .eq("student_id", studentId)
    .in("institution_id", (colleges ?? []).map((c) => c.id));
  const enrolment = enrolments?.[0];
  if (!enrolment) throw new ApiError(404, "NOT_FOUND", "That student is not at one of your affiliated colleges.");
  const credential = enrolments.flatMap((e) => e.credentials as unknown as { record_id: string; status: string }[]).find((c) => c.status === "Valid");
  await appendAudit(admin, { actorRole: "api_key", action: "certificate.line", entity: "student", entityId: studentId });
  return NextResponse.json({
    line: formatApaarLine(decryptField((enrolment.students as unknown as { apaar_id_enc: string }).apaar_id_enc)),
    qr_url: credential ? verifyUrl(credential.record_id) : null,
  });
});
