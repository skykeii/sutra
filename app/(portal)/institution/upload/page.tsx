import { UploadWizard } from "@/app/(portal)/institution/upload/wizard";
import { EmptyState, PageHeader } from "@/components/shared";
import { requireRole } from "@/lib/auth/session";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata = { title: "Upload students" };

export default async function Page() {
  await requireRole(["institution_admin", "institution_staff"]);
  const supabase = await createServerSupabase();
  const { data: programs } = await supabase.from("programs").select("id, name, academic_year, approved_intake").order("name");
  return (
    <div className="space-y-4">
      <PageHeader title="Upload students" description="Add a file, fix what the checks find, then submit it to AICTE. A re-upload of a student updates their record." />
      {programs?.length ? <UploadWizard programs={programs} /> : <EmptyState>Your institution has no programs yet. AICTE sets these up.</EmptyState>}
    </div>
  );
}
