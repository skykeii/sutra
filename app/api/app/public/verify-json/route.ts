import { NextResponse } from "next/server";
import { appendAudit } from "@/lib/audit";
import { checkUploaded } from "@/lib/credentials/service";
import type { SignedCredential } from "@/lib/credentials/vc";
import { ApiError, readJson, route } from "@/lib/http";
import { takeToken } from "@/lib/ratelimit";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const POST = route(async (req) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!(await takeToken(`verify:${ip}`, 30, 0.5))) throw new ApiError(429, "RATE_LIMITED", "Too many checks. Please wait a minute.");
  const vc = (await readJson(req, 100_000)) as SignedCredential;
  if (typeof vc !== "object" || vc === null || !vc.proof) throw new ApiError(400, "NOT_A_CREDENTIAL", "This does not look like a Sutra credential.");
  const admin = createAdminSupabase();
  const result = await checkUploaded(admin, vc);
  await appendAudit(admin, { actorRole: "public", action: "credential.verify", entity: "credential", entityId: result.verdict === "VALID" || result.verdict === "REVOKED" || result.verdict === "EXPIRED" ? result.recordId : null, meta: { verdict: result.verdict, source: "json" } });
  return NextResponse.json(result);
});
