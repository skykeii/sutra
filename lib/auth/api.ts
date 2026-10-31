import "server-only";
import type { NextRequest } from "next/server";
import { sha256Hex } from "@/lib/crypto";
import { appendAudit } from "@/lib/audit";
import type { AppRole } from "@/lib/auth/roles";
import { getSessionProfile, mfaSatisfied, type SessionProfile } from "@/lib/auth/session";
import { ApiError, assertSameOrigin } from "@/lib/http";
import { takeToken } from "@/lib/ratelimit";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const AICTE_ROLES: AppRole[] = ["aicte_admin", "aicte_officer"];
export const INSTITUTION_ROLES: AppRole[] = ["institution_admin", "institution_staff"];

export async function apiProfile(req: NextRequest, allowed: AppRole[]): Promise<SessionProfile> {
  if (req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req);
  const profile = await getSessionProfile();
  if (!profile) throw new ApiError(401, "NOT_SIGNED_IN", "Please sign in.");
  if (!allowed.includes(profile.role)) throw new ApiError(403, "FORBIDDEN", "Your role does not allow this.");
  if (!(await mfaSatisfied(profile))) throw new ApiError(403, "MFA_REQUIRED", "Please complete two-factor sign-in first.");
  return profile;
}

export interface ApiKeyOwner {
  id: string;
  prefix: string;
  institutionId: string | null;
  universityId: string | null;
  verifierOrgId: string | null;
  portalId: string | null;
  scopes: string[];
}

export async function apiKeyOwner(req: NextRequest, scope: string): Promise<ApiKeyOwner> {
  const key = req.headers.get("x-api-key");
  if (!key || key.length > 200) throw new ApiError(401, "API_KEY_REQUIRED", "Send your key in the X-API-Key header.");
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("api_keys")
    .select("id, key_prefix, institution_id, university_id, verifier_org_id, portal_id, scopes, revoked_at")
    .eq("key_hash", sha256Hex(key))
    .maybeSingle();
  if (!data || data.revoked_at) throw new ApiError(401, "API_KEY_INVALID", "This API key is not valid.");
  if (!(data.scopes as string[]).includes(scope)) throw new ApiError(403, "API_KEY_SCOPE", `This API key does not have the ${scope} scope.`);
  if (!(await takeToken(`apikey:${data.id}`, 120, 2))) throw new ApiError(429, "RATE_LIMITED", "Too many requests for this API key. Please slow down.");
  await admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  await appendAudit(admin, { actorRole: "api_key", action: "api.call", entity: "api_key", entityId: data.id, meta: { path: req.nextUrl.pathname.replace(/\d{12}/g, "{apaar_id}"), method: req.method, scope } });
  return {
    id: data.id,
    prefix: data.key_prefix,
    institutionId: data.institution_id,
    universityId: data.university_id,
    verifierOrgId: data.verifier_org_id,
    portalId: data.portal_id,
    scopes: data.scopes,
  };
}
