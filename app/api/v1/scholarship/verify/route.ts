import { NextResponse } from "next/server";
import { apiKeyOwner } from "@/lib/auth/api";
import { ApiError, readJson, route } from "@/lib/http";
import { processScholarship, scholarshipBody } from "@/lib/scholarship";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const POST = route(async (req) => {
  const owner = await apiKeyOwner(req, "scholarship:verify");
  if (!owner.portalId) throw new ApiError(403, "API_KEY_SCOPE", "This endpoint needs a scholarship portal key.");
  return NextResponse.json(await processScholarship(createAdminSupabase(), owner.portalId, scholarshipBody.parse(await readJson(req))));
});
