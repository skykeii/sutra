import { NextResponse } from "next/server";
import { appendAudit } from "@/lib/audit";
import { checkRecord } from "@/lib/credentials/service";
import { ApiError, route } from "@/lib/http";
import { takeToken } from "@/lib/ratelimit";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const GET = route<{ params: Promise<{ recordId: string }> }>(async (req, { params }) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!(await takeToken(`verify:${ip}`, 30, 0.5))) throw new ApiError(429, "RATE_LIMITED", "Too many checks. Please wait a minute.");
  const recordId = decodeURIComponent((await params).recordId).slice(0, 60);
  const admin = createAdminSupabase();
  const result = await checkRecord(admin, recordId);
  await appendAudit(admin, { actorRole: "public", action: "credential.verify", entity: "credential", entityId: recordId, meta: { verdict: result.verdict, source: "api" } });
  if (result.verdict === "NOT_FOUND") throw new ApiError(404, "NOT_FOUND", "No record with this ID exists.");
  const { status: enrolmentStatus, ...fields } = result.fields ?? { status: null };
  return NextResponse.json({ record_id: recordId, status: result.verdict, signature_valid: result.signatureValid, revoked_reason: result.revokedReason ?? null, enrolment_status: enrolmentStatus, ...fields });
});
