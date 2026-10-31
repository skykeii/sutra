import { PortalShell } from "@/components/layout/portal-shell";
import { requireRole } from "@/lib/auth/session";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole(["aicte_admin", "aicte_officer"]);
  return <PortalShell profile={profile}>{children}</PortalShell>;
}
