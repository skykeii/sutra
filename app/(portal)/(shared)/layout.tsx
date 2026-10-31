import { redirect } from "next/navigation";
import { PortalShell } from "@/components/layout/portal-shell";
import { getSessionProfile } from "@/lib/auth/session";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");
  return <PortalShell profile={profile}>{children}</PortalShell>;
}
