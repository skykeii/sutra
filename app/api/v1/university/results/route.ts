import { NextResponse } from "next/server";
import { z } from "zod";
import { apiKeyOwner } from "@/lib/auth/api";
import { ApiError, readJson, route } from "@/lib/http";
import { ingestResults, resultRow } from "@/lib/results";
import { createAdminSupabase } from "@/lib/supabase/admin";

const body = z.object({ rows: z.array(resultRow).min(1).max(10_000) });

export const POST = route(async (req) => {
  const owner = await apiKeyOwner(req, "results:write");
  if (!owner.universityId) throw new ApiError(403, "API_KEY_SCOPE", "This endpoint needs a university key.");
  const { rows } = body.parse(await readJson(req));
  const out = await ingestResults(createAdminSupabase(), owner.universityId, { fileName: "api", rows }, { id: null, role: "api_key" });
  return NextResponse.json({ batch_id: out.batchId, rows: out.rows, digest: out.digest });
});
