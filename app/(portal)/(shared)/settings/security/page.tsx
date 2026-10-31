import { redirect } from "next/navigation";
import { MfaPanel } from "@/app/(portal)/(shared)/settings/security/mfa";
import { firstParam, PageHeader, Section } from "@/components/shared";
import { getSessionProfile } from "@/lib/auth/session";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata = { title: "Security settings" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");
  const required = firstParam((await searchParams).required) === "1";
  const supabase = await createServerSupabase();
  const [{ data: factors }, { data: level }] = await Promise.all([supabase.auth.mfa.listFactors(), supabase.auth.mfa.getAuthenticatorAssuranceLevel()]);
  const verified = factors?.totp?.find((f) => f.status === "verified")?.id ?? null;
  return (
    <div className="space-y-4">
      <PageHeader title="Security settings" description="Protect your account with a code from an authenticator app." />
      {required && <p role="alert" className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">AICTE admins must complete two-factor sign-in to continue.</p>}
      {profile.role === "aicte_admin" && process.env.DEMO_MODE === "true" && <p className="rounded-md bg-saffron/15 p-3 text-sm">Demo mode: MFA is enforced for AICTE admins in production.</p>}
      <Section title="Two-factor sign-in"><MfaPanel verifiedFactorId={verified} level={level?.currentLevel ?? null} /></Section>
    </div>
  );
}
