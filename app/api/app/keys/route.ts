import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { appendAudit } from "@/lib/audit";
import { apiProfile } from "@/lib/auth/api";
import type { SessionProfile } from "@/lib/auth/session";
import { sha256Hex } from "@/lib/crypto";
import { ApiError, readJson, route } from "@/lib/http";
import { createAdminSupabase } from "@/lib/supabase/admin";

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), name: z.string().trim().min(2).max(60) }),
  z.object({ action: z.literal("revoke"), id: z.uuid() }),
]);

function ownerOf(profile: SessionProfile) {
  if (profile.role === "institution_admin") return { column: "institution_id", id: profile.institutionId!, tag: "inst", scopes: ["students:write", "programs:read"] };
  if (profile.role === "university_admin") return { column: "university_id", id: profile.universityId!, tag: "univ", scopes: ["results:write", "certificate:read"] };
  return { column: "verifier_org_id", id: profile.verifierOrgId!, tag: "verify", scopes: ["verify:read"] };
}

export const POST = route(async (req) => {
  const profile = await apiProfile(req, ["institution_admin", "university_admin", "verifier"]);
  const input = body.parse(await readJson(req));
  const admin = createAdminSupabase();
  const owner = ownerOf(profile);
  if (input.action === "create") {
    if (profile.role === "verifier") {
      const { data: org } = await admin.from("verifier_orgs").select("status").eq("id", owner.id).single();
      if (org?.status !== "Approved") throw new ApiError(403, "NOT_APPROVED", "AICTE has not approved your organisation yet.");
    }
    const key = `sutra_${owner.tag}_${randomBytes(24).toString("hex")}`;
    const { data, error } = await admin.from("api_keys").insert({ [owner.column]: owner.id, name: input.name, key_prefix: key.slice(0, 16), key_hash: sha256Hex(key), scopes: owner.scopes }).select("id").single();
    if (error) throw new Error(error.message);
    await appendAudit(admin, { actorId: profile.userId, actorRole: profile.role, action: "api_key.create", entity: "api_key", entityId: data.id, meta: { scopes: owner.scopes } });
    return NextResponse.json({ key }, { headers: { "Cache-Control": "no-store" } });
  }
  const { data, error } = await admin.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", input.id).eq(owner.column, owner.id).select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new ApiError(404, "NOT_FOUND", "That key was not found.");
  await appendAudit(admin, { actorId: profile.userId, actorRole: profile.role, action: "api_key.revoke", entity: "api_key", entityId: input.id });
  return NextResponse.json({ ok: true });
});
