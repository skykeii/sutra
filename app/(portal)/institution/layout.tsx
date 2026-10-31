import { PortalShell } from "@/components/layout/portal-shell";
import { requireRole } from "@/lib/auth/session";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole(["institution_admin", "institution_staff"]);
  return <PortalShell profile={profile}>{children}</PortalShell>;
}
