import Link from "next/link";
import { Logo } from "@/components/layout/logo";
import { DataTable, PageHeader, StatusBadge } from "@/components/shared";
import { RULES } from "@/lib/validation/rules";

export const metadata = { title: "Validation rules" };

export default function Page() {
  return (
    <main className="mx-auto max-w-5xl space-y-4 p-6">
      <Link href="/"><Logo /></Link>
      <PageHeader title="Validation rules" description="Generated from the rule engine. Errors hold a row back; warnings let it through and flag it for AICTE review." />
      <DataTable
        rows={RULES}
        rowKey={(r) => r.code}
        columns={[
          { key: "code", header: "Code", render: (r) => <code className="text-xs">{r.code}</code> },
          { key: "title", header: "Rule" },
          { key: "severity", header: "Severity", render: (r) => <StatusBadge status={r.severity} /> },
          { key: "alert", header: "Alerts AICTE", render: (r) => (r.alertsAicte ? "Yes" : "No") },
          { key: "description", header: "What it checks" },
        ]}
      />
    </main>
  );
}
