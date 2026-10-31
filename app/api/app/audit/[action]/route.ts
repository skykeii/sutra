import { NextResponse } from "next/server";
import { z } from "zod";
import { appendAudit } from "@/lib/audit";
import { runIntegrityCheck } from "@/lib/audit/verify";
import { AICTE_ROLES, apiProfile } from "@/lib/auth/api";
import { signPayload } from "@/lib/crypto";
import { ApiError, readJson, route } from "@/lib/http";
import { createAdminSupabase } from "@/lib/supabase/admin";

const tamperBody = z.object({ seq: z.number().int().positive().optional() });

export const POST = route<{ params: Promise<{ action: string }> }>(async (req, { params }) => {
  const { action } = await params;
  const profile = await apiProfile(req, AICTE_ROLES);
  const admin = createAdminSupabase();
  const actor = { actorId: profile.userId, actorRole: profile.role };

  if (action === "verify") {
    const result = await runIntegrityCheck(admin);
    await appendAudit(admin, { ...actor, action: "audit.verify", entity: "audit_log", meta: { ok: result.ok, entries: result.count } });
    return NextResponse.json(result);
  }

  if (action === "anchor") {
    const { data: head, error } = await admin.from("audit_log").select("seq, hash").order("seq", { ascending: false }).limit(1).single();
    if (error || !head) throw new Error("The audit log is empty.");
    const anchor = { date: new Date().toISOString().slice(0, 10), last_seq: head.seq, last_hash: head.hash };
    const { error: saveError } = await admin.from("audit_anchors").insert({ ...anchor, signature: signPayload(anchor) });
    if (saveError) throw new Error(saveError.message);
    await appendAudit(admin, { ...actor, action: "audit.anchor", entity: "audit_anchor", entityId: String(head.seq) });
    return NextResponse.json({ ok: true, anchor });
  }

  // Demo controls: off unless DEMO_MODE=true, and admin only.
  if (action === "tamper" || action === "restore") {
    if (process.env.DEMO_MODE !== "true") throw new ApiError(403, "DEMO_ONLY", "This control only works in demo mode.");
    if (profile.role !== "aicte_admin") throw new ApiError(403, "FORBIDDEN", "Only an AICTE admin can use this control.");
    if (action === "tamper") {
      const input = tamperBody.parse(await readJson(req));
      const { count } = await admin.from("audit_log").select("seq", { head: true, count: "exact" });
      const seq = input.seq ?? Math.max(1, Math.floor((count ?? 1) / 2));
      const { error } = await admin.rpc("demo_tamper_audit", { p_seq: seq });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, seq });
    }
    const { error } = await admin.rpc("demo_restore_audit");
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  }
  throw new ApiError(404, "NOT_FOUND", "Unknown action.");
});
