import Link from "next/link";
import { Logo } from "@/components/layout/logo";
import { DataTable, PageHeader } from "@/components/shared";

export const metadata = { title: "Privacy" };

const PRINCIPLES = [
  { principle: "Consent", how: "A verifier or scholarship portal sees a record only after the student approves with a one-time code and chooses how long access lasts.", where: "/student/consents" },
  { principle: "Purpose limitation", how: "Each consent records its purpose, and each access is logged against it. Approval lasts only for the chosen time and allows one view.", where: "Consent records, access log" },
  { principle: "Data minimisation", how: "Verifier and portal responses are built from an allow-list tied to the consent scope. Public pages show validity, institution, program, years and status only. Scholarship portals never get the full marksheet.", where: "/verify, /api/v1/scholarship/verify" },
  { principle: "Access", how: "Students can see their record, who accessed it, what was seen, and when.", where: "/student" },
  { principle: "Correction and withdrawal", how: "Institutions correct records through re-upload, which keeps a version history. Students can take back consent at any time.", where: "/institution/students, /student/consents" },
  { principle: "Security safeguards", how: "Row-level security on every table. Encryption (AES-256-GCM) for mobile, email, passport and APAAR ID. Keyed hashes for matching across institutions. Signed credentials. Two-person approval for sensitive actions. Multi-factor sign-in for AICTE admins.", where: "Throughout" },
  { principle: "Breach logging", how: "Every sensitive action enters a tamper-evident, append-only hash chain, with signed daily anchors published for anyone to check.", where: "/aicte/audit, /transparency" },
  { principle: "AI safety", how: "The AI features receive only aggregates, counts and rule codes, never student data or text from uploads. Ask the Data can only choose from a fixed list of approved queries.", where: "/aicte/ask" },
];

export default function Page() {
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
      <Link href="/" className="inline-block"><Logo /></Link>
      <PageHeader title="Privacy" description="How Sutra's features map to the principles of India's Digital Personal Data Protection Act, 2023. This is a design summary, not legal advice." />
      <DataTable rows={PRINCIPLES} rowKey={(r) => r.principle} columns={[
        { key: "principle", header: "Principle", render: (r) => <span className="font-medium">{r.principle}</span> },
        { key: "how", header: "How Sutra does it" },
        { key: "where", header: "Where to see it", render: (r) => <code className="text-xs">{r.where}</code> },
      ]} />
      <p className="text-sm text-muted-foreground">This demo uses only synthetic data. The APAAR registry, DigiLocker and ePASS connections are simulated.</p>
    </main>
  );
}
