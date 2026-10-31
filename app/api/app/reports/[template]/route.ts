import { z } from "zod";
import { appendAudit } from "@/lib/audit";
import { AICTE_ROLES, apiProfile, INSTITUTION_ROLES } from "@/lib/auth/api";
import { ApiError, fileResponse, route } from "@/lib/http";
import { reportCsv, reportPdf, reportXlsx } from "@/lib/reports/render";
import { REPORT_BY_ID } from "@/lib/reports/templates";
import { createAdminSupabase } from "@/lib/supabase/admin";

const query = z.object({
  format: z.enum(["pdf", "xlsx", "csv"]).default("csv"),
  state: z.string().max(60).optional(),
  year: z.string().max(10).optional(),
  program: z.string().max(100).optional(),
  institution: z.uuid().optional(),
});

export const GET = route<{ params: Promise<{ template: string }> }>(async (req, { params }) => {
  const profile = await apiProfile(req, [...AICTE_ROLES, ...INSTITUTION_ROLES]);
  const template = REPORT_BY_ID.get((await params).template);
  if (!template) throw new ApiError(404, "NOT_FOUND", "That report does not exist.");
  const isAicte = AICTE_ROLES.includes(profile.role);
  if (template.aicteOnly && !isAicte) throw new ApiError(403, "FORBIDDEN", "This report is for AICTE only.");
  const input = query.parse(Object.fromEntries([...req.nextUrl.searchParams].filter(([, v]) => v !== "")));
  // Institutions always get their own data, whatever filter is sent.
  const filters = { ...input, institution: isAicte ? input.institution : profile.institutionId! };
  const admin = createAdminSupabase();
  const rows = await template.rows(admin, filters);
  await appendAudit(admin, { actorId: profile.userId, actorRole: profile.role, action: "report.export", entity: "report", entityId: template.id, meta: { format: input.format, rows: rows.length, state: input.state ?? null, year: input.year ?? null } });
  const name = `sutra_${template.id}_${new Date().toISOString().slice(0, 10)}`;
  if (input.format === "csv") return fileResponse(reportCsv(template.columns, rows), "text/csv; charset=utf-8", `${name}.csv`);
  if (input.format === "xlsx") return fileResponse(new Uint8Array(reportXlsx(template.title, template.columns, rows)), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `${name}.xlsx`);
  const scope = [input.state, input.year, input.program].filter(Boolean).join(", ") || (isAicte ? "All institutions" : "Your institution");
  return fileResponse(new Uint8Array(await reportPdf(template, rows, scope)), "application/pdf", `${name}.pdf`);
});
