import Link from "next/link";
import { Portal } from "@/app/portal-demo/portal";
import { Logo } from "@/components/layout/logo";
import { SimulatedChip } from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SCHEMES } from "@/lib/scholarship";

export const metadata = { title: "Simulated scholarship portal" };

export default function Page() {
  return (
    <main className="mx-auto max-w-2xl space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/"><Logo /></Link>
        <SimulatedChip label="Simulated ePASS-style portal" />
      </div>
      <p className="rounded-md bg-blue-50 p-3 text-sm text-blue-950">This is not a government website. It stands in for a state scholarship portal, to show how one would use Sutra&apos;s API.</p>
      <Card>
        <CardHeader>
          <CardTitle>Apply for a scholarship</CardTitle>
          <CardDescription>The portal asks Sutra to check the student. The student approves first, and the portal then gets a short, verified answer.</CardDescription>
        </CardHeader>
        <CardContent><Portal schemes={SCHEMES} /></CardContent>
      </Card>
    </main>
  );
}
