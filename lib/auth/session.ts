import "server-only";
import { redirect } from "next/navigation";
import { ROLE_HOME, type AppRole } from "@/lib/auth/roles";
import { createServerSupabase } from "@/lib/supabase/server";

export interface SessionProfile {
  userId: string;
  email: string;
  role: AppRole;
  fullName: string;
  institutionId: string | null;
  universityId: string | null;
  verifierOrgId: string | null;
  portalId: string | null;
}

export async function getSessionProfile(): Promise<SessionProfile | null> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("role, full_name, institution_id, university_id, verifier_org_id, portal_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) return null;
  return {
    userId: user.id,
    email: user.email ?? "",
    role: data.role as AppRole,
    fullName: data.full_name,
    institutionId: data.institution_id,
    universityId: data.university_id,
    verifierOrgId: data.verifier_org_id,
    portalId: data.portal_id,
  };
}

/** AICTE admins need a second factor, except in demo mode where the portal shows a banner instead. */
export async function mfaSatisfied(profile: SessionProfile): Promise<boolean> {
  if (profile.role !== "aicte_admin" || process.env.DEMO_MODE === "true") return true;
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return data?.currentLevel === "aal2";
}

export async function requireRole(allowed: AppRole[]): Promise<SessionProfile> {
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");
  if (!allowed.includes(profile.role)) redirect(ROLE_HOME[profile.role]);
  if (!(await mfaSatisfied(profile))) redirect("/settings/security?required=1");
  return profile;
}
