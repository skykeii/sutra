import { BadgeCheck, ShieldAlert } from "lucide-react";
import { notFound } from "next/navigation";
import { verifyPayload } from "@/lib/crypto";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { fmtDateTime } from "@/components/shared";

export const metadata = { title: "Receipt check" };
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data } = await createAdminSupabase().from("consents").select("receipt").eq("id", id).maybeSingle();
  const receipt = data?.receipt as { payload: { verifier: string; verified_at: string }; signature: string } | null;
  if (!receipt) notFound();
  const valid = verifyPayload(receipt.payload, receipt.signature);
  return (
    <main className={`rounded-lg border-2 p-5 ${valid ? "border-emerald-500 bg-emerald-50 text-emerald-900" : "border-red-600 bg-red-50 text-red-900"}`}>
      <div className="flex items-center gap-4">
        {valid ? <BadgeCheck className="h-10 w-10" aria-hidden /> : <ShieldAlert className="h-10 w-10" aria-hidden />}
        <div>
          <h1 className="text-2xl font-bold">{valid ? "Genuine receipt" : "Receipt failed its signature check"}</h1>
          {valid && <p className="text-sm">Sutra issued this to {receipt.payload.verifier} on {fmtDateTime(receipt.payload.verified_at)}. The student&apos;s details stay private on this page.</p>}
        </div>
      </div>
    </main>
  );
}
