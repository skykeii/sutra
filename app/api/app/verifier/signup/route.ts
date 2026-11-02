import { clientIp } from "@/lib/client-ip";
import { NextResponse } from "next/server";
import { z } from "zod";
import { appendAudit } from "@/lib/audit";
import { ApiError, assertSameOrigin, readJson, route } from "@/lib/http";
import { takeToken } from "@/lib/ratelimit";
import { createAdminSupabase } from "@/lib/supabase/admin";

const body = z.object({
  orgName: z.string().min(3).max(120),
  type: z.enum(["Employer", "Regulator"]),
  fullName: z.string().min(2).max(120),
  email: z.email().max(254),
  password: z.string().min(10).max(200),
});

export const POST = route(async (req) => {
  assertSameOrigin(req);
  const ip = clientIp(req.headers);
  if (!(await takeToken(`signup:${ip}`, 5, 5 / 3600))) throw new ApiError(429, "RATE_LIMITED", "Too many sign-ups from here. Please try later.");
  const input = body.parse(await readJson(req));
  const admin = createAdminSupabase();
  const { data: created, error } = await admin.auth.admin.createUser({ email: input.email, password: input.password, email_confirm: true });
  if (error || !created.user) throw new ApiError(400, "SIGNUP_FAILED", "We could not create this account. The email may already be in use.");
  const { data: org } = await admin.from("verifier_orgs").insert({ name: input.orgName, type: input.type, status: "Pending" }).select("id").single();
  await admin.from("profiles").insert({ user_id: created.user.id, role: "verifier", full_name: input.fullName, verifier_org_id: org?.id });
  await appendAudit(admin, { actorId: created.user.id, actorRole: "verifier", action: "verifier.signup", entity: "verifier_org", entityId: org?.id ?? null, meta: { type: input.type } });
  return NextResponse.json({ ok: true });
});
