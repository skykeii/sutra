import { NextResponse } from "next/server";
import { z } from "zod";
import { apiKeyOwner } from "@/lib/auth/api";
import { ApiError, route } from "@/lib/http";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const GET = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const owner = await apiKeyOwner(req, "programs:read");
  const id = z.uuid().parse((await params).id);
  const admin = createAdminSupabase();
  const { data } = await admin.from("v_intake_status").select("*").eq("program_id", id).maybeSingle();
  if (!data || data.institution_id !== owner.institutionId) throw new ApiError(404, "NOT_FOUND", "That program was not found for your institution.");
  const { data: quotas } = await admin.from("v_quota_status").select("quota_type, seats_allowed, enrolled, over_quota").eq("program_id", id);
  return NextResponse.json({
    program: data.program_name,
    academic_year: data.academic_year,
    approved: data.approved,
    enrolled: data.enrolled_regular,
    supernumerary_cap: data.supernumerary_cap,
    enrolled_supernumerary: data.enrolled_supernumerary,
    fill_pct: data.fill_pct,
    quotas: quotas ?? [],
  });
});
