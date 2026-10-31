import { NextResponse } from "next/server";
import { apiProfile } from "@/lib/auth/api";
import { proposalSchema, proposeApproval } from "@/lib/approvals";
import { readJson, route } from "@/lib/http";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const POST = route(async (req) => {
  const profile = await apiProfile(req, ["aicte_admin"]);
  await proposeApproval(createAdminSupabase(), proposalSchema.parse(await readJson(req)), profile.userId, profile.role);
  return NextResponse.json({ ok: true });
});
