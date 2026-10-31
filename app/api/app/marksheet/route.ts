import { NextResponse } from "next/server";
import { apiProfile } from "@/lib/auth/api";
import { ApiError, readJson, route } from "@/lib/http";
import { checkMarksheet, marksheetBody } from "@/lib/results";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";

export const POST = route(async (req) => {
  const profile = await apiProfile(req, ["student", "institution_admin", "institution_staff"]);
  const input = marksheetBody.parse(await readJson(req));
  const supabase = await createServerSupabase();
  let studentId: string | null = null;
  if (profile.role === "student") {
    studentId = (await supabase.rpc("app_student_id")).data;
  } else {
    // RLS confirms this enrolment belongs to the signed-in institution.
    const { data } = await supabase.from("enrolments").select("student_id").eq("id", input.enrolmentId ?? "").maybeSingle();
    studentId = data?.student_id ?? null;
  }
  if (!studentId) throw new ApiError(404, "NO_RECORD", "We could not find that student.");
  return NextResponse.json(await checkMarksheet(createAdminSupabase(), studentId, input.semester, input.claimed_pct, { id: profile.userId, role: profile.role }));
});
