import { BadgeCheck, CircleSlash, Clock, FileQuestion, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const STYLES: Record<string, { box: string; icon: ReactNode; text: string }> = {
  VALID: { box: "border-emerald-500 bg-emerald-50 text-emerald-900", icon: <BadgeCheck className="h-10 w-10" aria-hidden />, text: "The signature matches and this record has not been revoked." },
  TAMPERED: { box: "border-red-600 bg-red-50 text-red-900", icon: <ShieldAlert className="h-10 w-10" aria-hidden />, text: "This record was altered after signing, or AICTE never issued it. Do not rely on it." },
  REVOKED: { box: "border-red-600 bg-red-50 text-red-900", icon: <CircleSlash className="h-10 w-10" aria-hidden />, text: "AICTE has revoked this record." },
  EXPIRED: { box: "border-amber-500 bg-amber-50 text-amber-900", icon: <Clock className="h-10 w-10" aria-hidden />, text: "This record's validity period has ended." },
  NOT_FOUND: { box: "border-slate-400 bg-slate-50 text-slate-900", icon: <FileQuestion className="h-10 w-10" aria-hidden />, text: "No record with this ID exists. Check the link and try again." },
};

export interface VerdictFields { institution: string; program: string; years: string; status: string }

export function VerdictCard({ verdict, fields, reason, note }: { verdict: string; fields?: VerdictFields; reason?: string | null; note?: string }) {
  const style = STYLES[verdict] ?? STYLES.NOT_FOUND!;
  return (
    <section aria-label="Verification result" className={cn("rounded-lg border-2 p-5", style.box)}>
      <div className="flex items-center gap-4">
        {style.icon}
        <div>
          <p className="text-3xl font-bold tracking-tight">{verdict === "NOT_FOUND" ? "NOT FOUND" : verdict}</p>
          <p className="text-sm">{style.text}</p>
          {reason && <p className="mt-1 text-sm">Reason: {reason}</p>}
          {note && <p className="mt-1 text-sm font-medium">{note}</p>}
        </div>
      </div>
      {fields && (
        <dl className="mt-4 grid gap-3 border-t border-current/20 pt-4 sm:grid-cols-2">
          {([["Institution", fields.institution], ["Program", fields.program], ["Years", fields.years], ["Status", fields.status]] as const).map(([k, v]) => (
            <div key={k}><dt className="text-xs uppercase tracking-wide opacity-75">{k}</dt><dd className="font-medium">{v}</dd></div>
          ))}
        </dl>
      )}
    </section>
  );
}
