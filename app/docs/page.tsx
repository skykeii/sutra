import Link from "next/link";
import { Swagger } from "@/app/docs/swagger";
import { Logo } from "@/components/layout/logo";
import { PageHeader } from "@/components/shared";

export const metadata = { title: "API documentation" };

export default function Page() {
  return (
    <main className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <Link href="/" className="inline-block"><Logo /></Link>
      <PageHeader title="API documentation" description="Choose Authorize, paste your API key, then use Try it out." />
      <p className="text-sm"><Link className="text-primary underline" href="/docs/rules">Validation rules</Link> explain every check the API can return.</p>
      <div className="rounded-lg border bg-white"><Swagger /></div>
    </main>
  );
}
