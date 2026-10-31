import { PortalHome } from "@/components/layout/portal-home";

export const metadata = { title: "My record" };

export default function Page() {
  return <PortalHome title="My record" description="See your verified record, control who can access it and check your marks." />;
}
