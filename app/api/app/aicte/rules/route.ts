import { NextResponse } from "next/server";
import { z } from "zod";
import { appendAudit } from "@/lib/audit";
import { apiProfile } from "@/lib/auth/api";
import { readJson, route } from "@/lib/http";
import { createAdminSupabase } from "@/lib/supabase/admin";

const body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    id: z.uuid().optional(),
    level: z.enum(["UG", "PG", "Diploma", "PGDM"]).nullable(),
    program_id: z.uuid().nullable(),
    rule_type: z.enum(["MIN_QUALIFYING_PCT", "MAX_AGE", "REQUIRED_STREAM"]),
    value: z.string().trim().min(1).max(60),
  }),
  z.object({ action: z.literal("delete"), id: z.uuid() }),
]);

const params = (type: string, value: string) => {
  if (type === "REQUIRED_STREAM") return { stream: value };
  const n = z.coerce.number().min(0).max(100).parse(value);
  return type === "MAX_AGE" ? { max: n } : { min: n };
};

export const POST = route(async (req) => {
  const profile = await apiProfile(req, ["aicte_admin"]);
  const input = body.parse(await readJson(req));
  const admin = createAdminSupabase();
  if (input.action === "delete") {
    const { error } = await admin.from("eligibility_rules").delete().eq("id", input.id);
    if (error) throw new Error(error.message);
  } else {
    const row = { level: input.level, program_id: input.program_id, rule_type: input.rule_type, params: params(input.rule_type, input.value) };
    const { error } = input.id ? await admin.from("eligibility_rules").update(row).eq("id", input.id) : await admin.from("eligibility_rules").insert(row);
    if (error) throw new Error(error.message);
  }
  await appendAudit(admin, { actorId: profile.userId, actorRole: profile.role, action: `eligibility.${input.action}`, entity: "eligibility_rule", entityId: input.id ?? null, meta: input.action === "save" ? { rule_type: input.rule_type, level: input.level } : {} });
  return NextResponse.json({ ok: true });
});
