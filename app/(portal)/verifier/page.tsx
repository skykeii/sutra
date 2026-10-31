import { RequestForm } from "@/app/(portal)/verifier/request-form";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, Section } from "@/components/shared";
import { requireRole } from "@/lib/auth/session";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata = { title: "Verify a student" };

export default async function Page() {
  const profile = await requireRole(["verifier"]);
  const supabase = await createServerSupabase();
  const { data: org } = await supabase.from("verifier_orgs").select("name, status, type, scope").eq("id", profile.verifierOrgId ?? "").maybeSingle();

  if (org?.status !== "Approved") {
    return (
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>{org?.status === "Rejected" ? "AICTE did not approve this organisation" : "Waiting for AICTE approval"}</CardTitle>
          <CardDescription>{org?.name ?? "Your organisation"} can verify student records once AICTE approves it. Two AICTE admins review each request.</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return (
    <div className="space-y-5">
      <PageHeader title={org.name} description={`Approved ${org.type.toLowerCase()}. You will see: ${org.scope.join(", ")}.`} />
      <Section title="Verify a student" description="The student approves each request. You then get one view of the result and a signed receipt.">
        <RequestForm />
      </Section>
    </div>
  );
}
