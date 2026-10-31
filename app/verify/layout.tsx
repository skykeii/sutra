import Link from "next/link";
import { Logo } from "@/components/layout/logo";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 md:p-6">
      <Link href="/" className="inline-block"><Logo /></Link>
      {children}
    </div>
  );
}
