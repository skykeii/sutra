import Link from "next/link";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <Logo />
      <h1 className="text-xl font-semibold">We could not find that page</h1>
      <p className="text-sm text-muted-foreground">The link may be out of date, or you may not have access to it.</p>
      <Button asChild><Link href="/">Back to Sutra</Link></Button>
    </main>
  );
}
