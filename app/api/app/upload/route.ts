import { NextResponse } from "next/server";
import { apiProfile, INSTITUTION_ROLES } from "@/lib/auth/api";
import { readJson, route } from "@/lib/http";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { processUpload, uploadBody } from "@/lib/upload/process";

export const POST = route(async (req) => {
  const profile = await apiProfile(req, INSTITUTION_ROLES);
  const body = uploadBody.parse(await readJson(req));
  const outcome = await processUpload(createAdminSupabase(), {
    ...body,
    institutionId: profile.institutionId!,
    actor: { id: profile.userId, role: profile.role },
  });
  return NextResponse.json({ issues: outcome.issues, stats: outcome.stats, batchId: outcome.batchId ?? null, created: outcome.created, updated: outcome.updated });
});
