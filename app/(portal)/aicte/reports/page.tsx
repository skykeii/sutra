import { firstParam } from "@/components/shared";
import { ReportsView } from "@/components/reports-view";
import { requireRole } from "@/lib/auth/session";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata = { title: "Reports" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole(["aicte_admin", "aicte_officer"]);
  const sp = await searchParams;
  const supabase = await createServerSupabase();
  const { data: institutions } = await supabase.from("institutions").select("id, name, state").order("name");
  const institution = firstParam(sp.institution) || undefined;
  const filters = { report: firstParam(sp.report), state: firstParam(sp.state) || undefined, year: firstParam(sp.year) || undefined, program: firstParam(sp.program) || undefined, institution };
  return (
    <ReportsView
      path="/aicte/reports"
      isAicte
      filters={filters}
      packInstitution={institution ?? ""}
      fields={[
        { name: "state", label: "State", options: [...new Set((institutions ?? []).map((i) => i.state))].sort().map((v) => ({ value: v, label: v })) },
        { name: "year", label: "Year", options: [{ value: "2026-27", label: "2026-27" }] },
        { name: "program", label: "Program", placeholder: "e.g. CSE" },
        { name: "institution", label: "Institution", options: (institutions ?? []).map((i) => ({ value: i.id, label: i.name })) },
      ]}
    />
  );
}
