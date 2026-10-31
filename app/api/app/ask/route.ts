import { NextResponse } from "next/server";
import { z } from "zod";
import { aiEnabled } from "@/lib/ai/client";
import { CATALOG, CATALOG_BY_ID } from "@/lib/ask/catalog";
import { selectQuery, summarise } from "@/lib/ask/match";
import { appendAudit } from "@/lib/audit";
import { AICTE_ROLES, apiProfile } from "@/lib/auth/api";
import { ApiError, readJson, route } from "@/lib/http";
import { takeToken } from "@/lib/ratelimit";
import { createAdminSupabase } from "@/lib/supabase/admin";

const body = z.object({ question: z.string().trim().min(3).max(300) });

export const POST = route(async (req) => {
  const profile = await apiProfile(req, AICTE_ROLES);
  if (!(await takeToken(`ask:${profile.userId}`, 30, 0.5))) throw new ApiError(429, "RATE_LIMITED", "Too many questions. Please wait a minute.");
  const { question } = body.parse(await readJson(req));
  const admin = createAdminSupabase();
  const selection = await selectQuery(admin, question);
  await appendAudit(admin, { actorId: profile.userId, actorRole: profile.role, action: "ask.query", entity: "ask", entityId: selection?.queryId ?? "no_match", meta: { query_id: selection?.queryId ?? null, ai: aiEnabled() } });
  if (!selection) {
    return NextResponse.json({ answered: false, message: "I can't answer that yet.", suggestions: CATALOG.slice(0, 8).map((c) => c.example) });
  }
  const entry = CATALOG_BY_ID.get(selection.queryId)!;
  const result = await entry.run(admin, selection.params);
  return NextResponse.json({ answered: true, queryId: entry.id, title: entry.title, params: selection.params, summary: await summarise(admin, entry.title, selection.params, result), ...result });
});
