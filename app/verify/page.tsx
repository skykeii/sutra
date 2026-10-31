import { Checker } from "@/app/verify/checker";
import { PageHeader } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Verify a record" };

export default function Page() {
  return (
    <main className="space-y-5">
      <PageHeader title="Verify a student record" description="Anyone can check a Sutra record. This page shows only whether it is valid, the institution, program, years and status." />
      <Card><CardContent className="pt-5"><Checker /></CardContent></Card>
    </main>
  );
}
