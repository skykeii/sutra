import Link from "next/link";
import { Logo } from "@/components/layout/logo";
import { Pipeline } from "@/components/layout/pipeline";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center gap-8 p-6">
      <Logo />
      <div className="space-y-3">
        <h1 className="text-4xl font-bold tracking-tight text-primary">One thread. Every verified student.</h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          Sutra links a student&apos;s APAAR identity, admission, marks and verified records, so AICTE sees real student-level data instead of aggregates.
        </p>
      </div>
      <Pipeline />
      <div>
        <Button asChild size="lg">
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">Simulated integrations: APAAR registry, DigiLocker and ePASS run as labelled mock services in this demo.</p>
    </main>
  );
}
