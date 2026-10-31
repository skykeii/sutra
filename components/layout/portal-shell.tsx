import { LogOut } from "lucide-react";
import Link from "next/link";
import { logout } from "@/app/(auth)/actions";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { ROLE_LABEL } from "@/lib/auth/roles";
import type { SessionProfile } from "@/lib/auth/session";
import type { NavItem } from "@/lib/nav";

export function PortalShell({ profile, nav, children }: { profile: SessionProfile; nav: NavItem[]; children: React.ReactNode }) {
  const demoMode = process.env.DEMO_MODE === "true";
  return (
    <div className="min-h-screen md:grid md:grid-cols-[15rem_1fr]">
      <aside className="bg-primary p-4 text-primary-foreground">
        <Link href="/" className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron">
          <Logo inverted />
        </Link>
        <nav className="mt-6 flex gap-1 overflow-x-auto md:flex-col" aria-label="Portal">
          {nav.map((item) =>
            item.ready ? (
              <Link key={item.href} href={item.href} className="whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium hover:bg-white/10">
                {item.label}
              </Link>
            ) : (
              <span key={item.href} aria-disabled className="cursor-not-allowed whitespace-nowrap rounded-md px-3 py-2 text-sm text-white/70">
                {item.label}
              </span>
            ),
          )}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-col">
        {demoMode && profile.role === "aicte_admin" && (
          <p className="bg-saffron/15 px-6 py-2 text-sm">Demo mode: MFA is enforced for AICTE admins in production.</p>
        )}
        <header className="flex items-center justify-between gap-4 border-b bg-card px-6 py-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{profile.fullName}</p>
            <p className="text-sm text-muted-foreground">{ROLE_LABEL[profile.role]}</p>
          </div>
          <form action={logout}>
            <Button variant="outline" size="sm" type="submit">
              <LogOut className="h-4 w-4" aria-hidden />
              Sign out
            </Button>
          </form>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
