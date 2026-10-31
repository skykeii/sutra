import { NextResponse } from "next/server";
import { z } from "zod";
import { apiProfile } from "@/lib/auth/api";
import { decideApproval } from "@/lib/approvals";
import { readJson, route } from "@/lib/http";
import { createAdminSupabase } from "@/lib/supabase/admin";

const body = z.object({ approve: z.boolean() });

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const profile = await apiProfile(req, ["aicte_admin"]);
  const { approve } = body.parse(await readJson(req));
  await decideApproval(createAdminSupabase(), z.uuid().parse((await params).id), approve, profile.userId, profile.role);
  return NextResponse.json({ ok: true });
});
