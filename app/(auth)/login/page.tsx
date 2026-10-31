import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/app/(auth)/login/login-form";
import { Logo } from "@/components/layout/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLE_HOME } from "@/lib/auth/roles";
import { getSessionProfile } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  const profile = await getSessionProfile();
  if (profile) redirect(ROLE_HOME[profile.role]);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center gap-6 p-4">
      <Link href="/" className="w-fit">
        <Logo />
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>Sign in to Sutra</CardTitle>
          <CardDescription>One sign-in for AICTE, institutions, universities, verifiers and students.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm showDemo={process.env.DEMO_MODE === "true"} />
        </CardContent>
      </Card>
    </main>
  );
}
