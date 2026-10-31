import { NextResponse } from "next/server";
import { z } from "zod";
import { apiKeyOwner } from "@/lib/auth/api";
import { readJson, route } from "@/lib/http";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { processUpload, uploadBody } from "@/lib/upload/process";
import { API_MAX_ROWS } from "@/lib/validation/columns";

const body = z.object({
  program_id: z.uuid(),
  rows: uploadBody.shape.rows.max(API_MAX_ROWS, `At most ${API_MAX_ROWS} rows per call.`),
  update_existing: z.array(z.string().max(20)).max(API_MAX_ROWS).optional(),
});

export const POST = route(async (req) => {
  const owner = await apiKeyOwner(req, "students:write");
  const input = body.parse(await readJson(req));
  const outcome = await processUpload(createAdminSupabase(), {
    programId: input.program_id,
    fileName: "api",
    rows: input.rows,
    updateApaars: input.update_existing,
    commit: true,
    institutionId: owner.institutionId!,
    actor: { id: null, role: "api_key" },
  });
  return NextResponse.json({ batch_id: outcome.batchId, created: outcome.created, updated: outcome.updated, stats: outcome.stats, issues: outcome.issues });
});
