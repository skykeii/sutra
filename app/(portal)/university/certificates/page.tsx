import { CertificateDesigner } from "@/app/(portal)/university/certificates/designer";
import { EmptyState, PageHeader, Section } from "@/components/shared";
import { appendAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/session";
import { decryptField } from "@/lib/crypto";
import { maskApaar } from "@/lib/mask";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const metadata = { title: "Certificates" };

export default async function Page() {
  const profile = await requireRole(["university_admin"]);
  const admin = createAdminSupabase();
  const { data: university } = await admin.from("universities").select("name").eq("id", profile.universityId!).single();
  const { data: colleges } = await admin.from("institutions").select("id").eq("university_id", profile.universityId!);
  const { data } = await admin
    .from("enrolments")
    .select("id, institutions(name), programs(name), students(name, apaar_id_enc)")
    .in("institution_id", (colleges ?? []).map((c) => c.id))
    .eq("validation_status", "Verified")
    .eq("enrolment_status", "Active")
    .limit(60);
  await appendAudit(admin, { actorId: profile.userId, actorRole: profile.role, action: "certificate.view_candidates", entity: "university", entityId: profile.universityId, meta: { count: data?.length ?? 0 } });
  const candidates = (data ?? []).map((e) => {
    const s = e.students as unknown as { name: string; apaar_id_enc: string };
    return { id: e.id, name: s.name, masked: maskApaar(decryptField(s.apaar_id_enc)), program: (e.programs as unknown as { name: string }).name, institution: (e.institutions as unknown as { name: string }).name };
  });
  return (
    <div className="space-y-5">
      <PageHeader title="Certificates with APAAR ID" description="Add the APAAR ID beside the Student ID, preview the layout, and generate a batch of PDFs. Your own software can also get the line from the API." />
      <Section title="Design and generate">
        {candidates.length ? <CertificateDesigner candidates={candidates} university={university?.name ?? "University"} /> : <EmptyState>No verified students at your affiliated colleges yet.</EmptyState>}
      </Section>
    </div>
  );
}
