import Link from "next/link";
import { SignupForm } from "@/app/(auth)/signup/signup-form";
import { Logo } from "@/components/layout/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Register as a verifier" };

export default function Page() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 p-4">
      <Link href="/" className="w-fit"><Logo /></Link>
      <Card>
        <CardHeader>
          <CardTitle>Register your organisation</CardTitle>
          <CardDescription>For employers and regulators. You can verify records once two AICTE admins approve your organisation.</CardDescription>
        </CardHeader>
        <CardContent><SignupForm /></CardContent>
      </Card>
    </main>
  );
}
