import { PortalHome } from "@/components/layout/portal-home";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata = { title: "Verifier" };

export default async function Page() {
  const profile = await requireRole(["verifier"]);
  const supabase = await createServerSupabase();
  const { data: org } = await supabase.from("verifier_orgs").select("name, status").eq("id", profile.verifierOrgId ?? "").maybeSingle();

  if (org?.status !== "Approved") {
    return (
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Waiting for AICTE approval</CardTitle>
          <CardDescription>
            {org?.name ?? "Your organisation"} can verify student records once AICTE approves it. Two AICTE admins review each request.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return <PortalHome title={org.name} description="Verify a student's record with the student's consent." />;
}
