import { firstParam } from "@/components/shared";
import { ReportsView } from "@/components/reports-view";
import { requireRole } from "@/lib/auth/session";

export const metadata = { title: "Reports" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await requireRole(["institution_admin", "institution_staff"]);
  const sp = await searchParams;
  return (
    <ReportsView
      path="/institution/reports"
      isAicte={false}
      filters={{ report: firstParam(sp.report), program: firstParam(sp.program) || undefined, institution: profile.institutionId! }}
      packInstitution={profile.institutionId!}
      fields={[{ name: "program", label: "Program", placeholder: "e.g. CSE" }]}
    />
  );
}
