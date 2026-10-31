import { z } from "zod";
import { appendAudit } from "@/lib/audit";
import { AICTE_ROLES, apiProfile, INSTITUTION_ROLES } from "@/lib/auth/api";
import { ApiError, fileResponse, route } from "@/lib/http";
import { accreditationPdf } from "@/lib/reports/render";
import { REPORT_BY_ID } from "@/lib/reports/templates";
import { createAdminSupabase } from "@/lib/supabase/admin";

const PACK = ["institution-enrolment", "quota-audit", "category", "submission", "over-intake"];

export const GET = route(async (req) => {
  const profile = await apiProfile(req, [...AICTE_ROLES, ...INSTITUTION_ROLES]);
  const asked = req.nextUrl.searchParams.get("institution");
  const institutionId = AICTE_ROLES.includes(profile.role) ? z.uuid().parse(asked) : profile.institutionId!;
  const admin = createAdminSupabase();
  const { data: institution } = await admin.from("institutions").select("name, aicte_id, state").eq("id", institutionId).maybeSingle();
  if (!institution) throw new ApiError(404, "NOT_FOUND", "That institution was not found.");
  const sections = await Promise.all(PACK.map(async (id) => {
    const template = REPORT_BY_ID.get(id)!;
    return { template, rows: await template.rows(admin, { institution: institutionId }) };
  }));
  await appendAudit(admin, { actorId: profile.userId, actorRole: profile.role, action: "report.export", entity: "report", entityId: "accreditation-pack", meta: { institution_id: institutionId, format: "pdf" } });
  return fileResponse(new Uint8Array(await accreditationPdf(institution, sections)), "application/pdf", `sutra_accreditation_${institution.aicte_id}.pdf`);
});
