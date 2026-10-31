import { BadgeCheck, Building2, GraduationCap, Landmark, ScrollText, ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/layout/logo";
import { Pipeline } from "@/components/layout/pipeline";
import { Button } from "@/components/ui/button";

const ROLES = [
  { icon: Landmark, title: "AICTE", text: "Watch admissions live, catch excess enrolment, and review alerts, quotas and fraud patterns." },
  { icon: Building2, title: "Institutions", text: "Upload student data, fix problems with suggested corrections, and track intake against approval." },
  { icon: GraduationCap, title: "Universities", text: "Publish signed results and issue certificates carrying the APAAR ID." },
  { icon: BadgeCheck, title: "Employers and regulators", text: "Verify a record with the student's consent, and get a signed receipt." },
  { icon: UserRound, title: "Students", text: "See your record, control who can access it, and see who already has." },
];

const LINKS = [
  { href: "/verify", label: "Verify a record" },
  { href: "/transparency", label: "Transparency" },
  { href: "/docs", label: "API documentation" },
  { href: "/portal-demo", label: "Simulated scholarship portal" },
  { href: "/privacy", label: "Privacy" },
];

export default function LandingPage() {
  return (
    <div>
      <header className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-6xl px-4 py-10 md:px-6 md:py-16">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Logo inverted />
            <Button asChild variant="outline" className="text-foreground"><Link href="/login">Sign in</Link></Button>
          </div>
          <h1 className="mt-10 max-w-3xl text-4xl font-bold tracking-tight md:text-5xl">One thread. Every verified student.</h1>
          <p className="mt-4 max-w-2xl text-lg text-white/85">
            Sutra links each student&apos;s APAAR identity, admission, marks and verified records, so AICTE sees student-level data, checked automatically, in real time.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild size="lg" className="bg-saffron text-saffron-foreground hover:bg-saffron/90"><Link href="/login">Sign in</Link></Button>
            <Button asChild size="lg" variant="outline" className="text-foreground"><Link href="/verify">Verify a record</Link></Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-10 px-4 py-10 md:px-6">
        <section aria-labelledby="flow">
          <h2 id="flow" className="mb-4 text-xl font-semibold">From upload to authorised verification</h2>
          <Pipeline />
        </section>
        <section aria-labelledby="roles">
          <h2 id="roles" className="mb-4 text-xl font-semibold">Built for everyone in the chain</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ROLES.map(({ icon: Icon, title, text }) => (
              <li key={title}>
                <Link href="/login" className="block h-full rounded-lg border bg-card p-4 shadow-sm hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Icon className="h-6 w-6 text-primary" aria-hidden />
                  <h3 className="mt-2 font-semibold">{title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{text}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="trust" className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border bg-card p-4">
            <ShieldCheck className="h-6 w-6 text-primary" aria-hidden />
            <h2 id="trust" className="mt-2 font-semibold">Tamper-evident by design</h2>
            <p className="mt-1 text-sm text-muted-foreground">Credentials are digitally signed. Every sensitive action enters a hash chain whose signed daily checkpoints are public.</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <ScrollText className="h-6 w-6 text-primary" aria-hidden />
            <h2 className="mt-2 font-semibold">Simulated integrations</h2>
            <p className="mt-1 text-sm text-muted-foreground">The APAAR registry, DigiLocker and ePASS connections are labelled mock services in this demo. All student data is synthetic.</p>
          </div>
        </section>
      </main>
      <footer className="border-t">
        <nav aria-label="Public pages" className="mx-auto flex max-w-6xl flex-wrap gap-4 px-4 py-6 text-sm md:px-6">
          {LINKS.map((l) => <Link key={l.href} href={l.href} className="text-primary underline">{l.label}</Link>)}
          <Link href="/signup" className="text-primary underline">Register as a verifier</Link>
        </nav>
      </footer>
    </div>
  );
}
