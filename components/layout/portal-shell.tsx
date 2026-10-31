import { Bell, LogOut, Search, ShieldCheck, ShieldAlert, UserCog } from "lucide-react";
import Link from "next/link";
import { logout, markNotificationsRead } from "@/app/(auth)/actions";
import { Logo } from "@/components/layout/logo";
import { fmtDateTime } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { ROLE_LABEL } from "@/lib/auth/roles";
import type { SessionProfile } from "@/lib/auth/session";
import { navFor } from "@/lib/nav";
import { createServerSupabase } from "@/lib/supabase/server";

export async function PortalShell({ profile, children }: { profile: SessionProfile; children: React.ReactNode }) {
  const demoMode = process.env.DEMO_MODE === "true";
  const supabase = await createServerSupabase();
  const isAicte = profile.role === "aicte_admin" || profile.role === "aicte_officer";
  const canSearch = isAicte || profile.role === "institution_admin" || profile.role === "institution_staff";
  const { data: notifications } = await supabase.from("notifications").select("id, title, body, link, read_at, created_at").order("created_at", { ascending: false }).limit(8);
  const unread = (notifications ?? []).filter((n) => !n.read_at).length;
  const { data: integrity } = isAicte ? await supabase.from("app_cache").select("value").eq("key", "integrity").maybeSingle() : { data: null };
  const check = integrity?.value as { ok?: boolean; count?: number } | undefined;

  return (
    <div className="min-h-screen md:grid md:grid-cols-[15rem_1fr]">
      <aside className="bg-primary p-4 text-primary-foreground md:min-h-screen">
        <Link href="/" className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron">
          <Logo inverted />
        </Link>
        <nav className="mt-6 flex gap-1 overflow-x-auto md:flex-col" aria-label="Portal">
          {navFor(profile.role).map((item) => (
            <Link key={item.href} href={item.href} className="whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron">
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-col">
        {demoMode && profile.role === "aicte_admin" && <p className="bg-saffron/15 px-6 py-2 text-sm">Demo mode: MFA is enforced for AICTE admins in production.</p>}
        <header className="flex flex-wrap items-center gap-3 border-b bg-card px-4 py-3 md:px-6">
          {canSearch && (
            <form action="/search" method="get" role="search" className="flex min-w-48 flex-1 items-center gap-2">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <input name="q" aria-label="Search" placeholder={isAicte ? "Search by APAAR hash prefix" : "Search students by name"} className="h-9 w-full max-w-md rounded-md border border-input bg-card px-3 text-sm" />
            </form>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {isAicte && (
              <Link href="/aicte/audit" title="Audit chain integrity, from the most recent check" className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${check?.ok === false ? "bg-red-100 text-red-900" : check?.ok ? "bg-emerald-100 text-emerald-900" : "bg-slate-200 text-slate-800"}`}>
                {check?.ok === false ? <ShieldAlert className="h-3.5 w-3.5" aria-hidden /> : <ShieldCheck className="h-3.5 w-3.5" aria-hidden />}
                Integrity: {check?.ok === false ? "tampering found" : check?.ok ? "✓ chain intact" : "not checked yet"}
              </Link>
            )}
            <details className="relative">
              <summary aria-label={`Notifications, ${unread} unread`} className="flex h-9 cursor-pointer list-none items-center gap-1 rounded-md border px-2.5">
                <Bell className="h-4 w-4" aria-hidden />
                {unread > 0 && <span className="rounded-full bg-red-600 px-1.5 text-xs font-semibold text-white">{unread}</span>}
              </summary>
              <div className="absolute right-0 z-30 mt-1 w-80 max-w-[85vw] rounded-md border bg-card p-2 shadow-lg">
                {notifications?.length ? (
                  <>
                    <ul className="max-h-80 space-y-1 overflow-auto">
                      {notifications.map((n) => (
                        <li key={n.id} className={`rounded p-2 text-sm ${n.read_at ? "" : "bg-accent"}`}>
                          <Link href={n.link ?? "#"} className="font-medium hover:underline">{n.title}</Link>
                          {n.body && <p className="text-xs text-muted-foreground">{n.body}</p>}
                          <p className="text-xs text-muted-foreground">{fmtDateTime(n.created_at)}</p>
                        </li>
                      ))}
                    </ul>
                    <form action={markNotificationsRead} className="mt-1"><Button type="submit" variant="ghost" size="sm" className="w-full">Mark all as read</Button></form>
                  </>
                ) : <p className="p-2 text-sm text-muted-foreground">No notifications yet.</p>}
              </div>
            </details>
            <details className="relative">
              <summary className="flex h-9 cursor-pointer list-none items-center gap-2 rounded-md border px-3 text-sm">
                <span className="max-w-40 truncate font-medium">{profile.fullName}</span>
              </summary>
              <div className="absolute right-0 z-30 mt-1 w-56 space-y-1 rounded-md border bg-card p-2 shadow-lg">
                <p className="px-2 text-xs text-muted-foreground">{ROLE_LABEL[profile.role]}</p>
                <Button asChild variant="ghost" size="sm" className="w-full justify-start"><Link href="/settings/security"><UserCog className="h-4 w-4" aria-hidden />Security settings</Link></Button>
                <form action={logout}><Button variant="ghost" size="sm" type="submit" className="w-full justify-start"><LogOut className="h-4 w-4" aria-hidden />Sign out</Button></form>
              </div>
            </details>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
