import { AskBox } from "@/app/(portal)/aicte/ask/ask-box";
import { PageHeader, Section } from "@/components/shared";
import { activeProvider } from "@/lib/ai/provider";
import { CATALOG } from "@/lib/ask/catalog";
import { requireRole } from "@/lib/auth/session";

export const metadata = { title: "Ask the Data" };

export default async function Page() {
  await requireRole(["aicte_admin", "aicte_officer"]);
  return (
    <div className="space-y-5">
      <PageHeader title="Ask the Data" description="Ask in plain language. The answer comes from a fixed list of approved, audited queries." />
      <Section title="Your question"><AskBox examples={CATALOG.map((c) => c.example)} provider={activeProvider()} /></Section>
    </div>
  );
}
