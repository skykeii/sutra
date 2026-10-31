import { NextResponse } from "next/server";
import { apiProfile } from "@/lib/auth/api";
import { readJson, route } from "@/lib/http";
import { ingestResults, resultsBody } from "@/lib/results";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const POST = route(async (req) => {
  const profile = await apiProfile(req, ["university_admin"]);
  const outcome = await ingestResults(createAdminSupabase(), profile.universityId!, resultsBody.parse(await readJson(req)), { id: profile.userId, role: profile.role });
  return NextResponse.json(outcome);
});
