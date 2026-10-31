import { Download } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import QRCode from "qrcode";
import { ActionButton } from "@/components/action-button";
import { DataTable, EmptyState, fmtDateTime, KpiCard, PageHeader, Section, SimulatedChip, StatusBadge } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/session";
import { verifyUrl } from "@/lib/credentials/service";
import { maskApaar } from "@/lib/mask";
import { decryptField } from "@/lib/crypto";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata = { title: "My record" };

export default async function Page() {
  await requireRole(["student"]);
  const supabase = await createServerSupabase();
  const { data: studentId } = await supabase.rpc("app_student_id");
  const [student, enrolments, consents, access, scholarships, marks, pushed] = await Promise.all([
    supabase.from("students").select("name, apaar_id_enc").eq("id", studentId ?? "").maybeSingle(),
    supabase.from("enrolments").select("id, admission_date, enrolment_status, validation_status, quota_type, institutions(name), programs(name, duration_years), credentials(record_id, status)").eq("student_id", studentId ?? "").order("admission_date", { ascending: false }),
    supabase.from("consents").select("id", { head: true, count: "exact" }).eq("student_id", studentId ?? "").is("approved_at", null).is("denied_at", null),
    supabase.from("access_log").select("id, grantee, purpose, fields_returned, at").eq("student_id", studentId ?? "").order("at", { ascending: false }).limit(5),
    supabase.from("scholarship_requests").select("id", { head: true, count: "exact" }),
    supabase.from("marksheet_submissions").select("outcome").eq("student_id", studentId ?? "").order("created_at", { ascending: false }).limit(1),
    supabase.from("simulated_digilocker").select("record_id").eq("student_id", studentId ?? ""),
  ]);
  if (!student.data) return <EmptyState>We could not find a student record for your account yet. Your institution adds it when they submit their data.</EmptyState>;
  const pushedSet = new Set((pushed.data ?? []).map((p) => p.record_id));
  const cards = await Promise.all((enrolments.data ?? []).map(async (e) => {
    const cred = (e.credentials as unknown as { record_id: string; status: string }[]).find((c) => c.status === "Valid") ?? (e.credentials as unknown as { record_id: string; status: string }[])[0];
    return { ...e, cred, qr: cred ? await QRCode.toDataURL(verifyUrl(cred.record_id), { margin: 1, width: 180 }) : null };
  }));
  return (
    <div className="space-y-5">
      <PageHeader title={student.data.name} description={`APAAR ID ${maskApaar(decryptField(student.data.apaar_id_enc))}`} />
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard label="Requests waiting for you" value={consents.count ?? 0} tone={consents.count ? "amber" : undefined} hint="See Access and consents" />
        <KpiCard label="Scholarship requests" value={scholarships.count ?? 0} />
        <KpiCard label="Latest marksheet check" value={marks.data?.[0]?.outcome ?? "None yet"} tone={marks.data?.[0]?.outcome === "Mismatch" ? "red" : undefined} />
      </div>
      {cards.map((e) => {
        const program = e.programs as unknown as { name: string; duration_years: number };
        const year = Number(e.admission_date.slice(0, 4));
        return (
          <Section key={e.id} title={program.name} description={`${(e.institutions as unknown as { name: string }).name}, ${year} to ${year + program.duration_years}`} actions={<span className="flex gap-1"><StatusBadge status={e.enrolment_status} /><StatusBadge status={e.validation_status} /></span>}>
            {e.cred && e.qr ? (
              <div className="flex flex-wrap items-center gap-5">
                <Image src={e.qr} alt={`QR code for record ${e.cred.record_id}`} width={140} height={140} unoptimized className="rounded border" />
                <div className="space-y-2">
                  <p className="text-sm">Record <Link className="font-medium text-primary underline" href={`/verify/${e.cred.record_id}`}>{e.cred.record_id}</Link> <StatusBadge status={e.cred.status} /></p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button asChild variant="outline" size="sm"><a href={`/api/app/credentials/${e.cred.record_id}/pdf`}><Download className="h-4 w-4" aria-hidden />Download credential</a></Button>
                    {pushedSet.has(e.cred.record_id)
                      ? <span className="text-sm">Added to DigiLocker</span>
                      : <ActionButton size="sm" variant="outline" url="/api/app/student/digilocker" body={{ recordId: e.cred.record_id }} disabled={e.cred.status !== "Valid"}>Add to DigiLocker (simulated)</ActionButton>}
                    <SimulatedChip label="Simulated: requires AICTE issuer onboarding" />
                  </div>
                </div>
              </div>
            ) : <p className="text-sm text-muted-foreground">Your signed credential appears here once AICTE verifies this record.</p>}
          </Section>
        );
      })}
      <Section title="Who accessed my record" actions={<Button asChild variant="outline" size="sm"><Link href="/student/consents">Manage access</Link></Button>}>
        <DataTable rows={access.data ?? []} rowKey={(r) => r.id} empty="Nobody has accessed your record yet." columns={[
          { key: "grantee", header: "Organisation" }, { key: "purpose", header: "Purpose" },
          { key: "fields", header: "What they saw", render: (r) => r.fields_returned.join(", ") },
          { key: "at", header: "When", render: (r) => fmtDateTime(r.at) },
        ]} />
      </Section>
    </div>
  );
}
