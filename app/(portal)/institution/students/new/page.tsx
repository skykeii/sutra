import { StudentForm } from "@/app/(portal)/institution/students/student-form";
import { PageHeader } from "@/components/shared";
import { requireRole } from "@/lib/auth/session";
import { createServerSupabase } from "@/lib/supabase/server";
import { emptyRow } from "@/lib/validation/columns";

export const metadata = { title: "Add a student" };

export default async function Page() {
  await requireRole(["institution_admin", "institution_staff"]);
  const supabase = await createServerSupabase();
  const { data: programs } = await supabase.from("programs").select("id, name").order("name");
  const initial = { ...emptyRow(), nationality: "Indian", admission_category: "Regular", quota_type: "CONVENOR", is_nri: "false", oci_status: "none", is_foreign_national: "false", fee_status: "Pending", enrolment_status: "Active" };
  return (
    <div className="space-y-4">
      <PageHeader title="Add one student" description="The same checks as a file upload run on this record." />
      <StudentForm programs={programs ?? []} initial={initial} />
    </div>
  );
}
