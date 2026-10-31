import { z } from "zod";
import { appendAudit } from "@/lib/audit";
import { apiProfile } from "@/lib/auth/api";
import { baseUrl } from "@/lib/credentials/service";
import { ApiError, fileResponse, route } from "@/lib/http";
import { A4, brandHeader, drawQr, keyValues, newPdf, pageFooter } from "@/lib/pdf";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const GET = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const profile = await apiProfile(req, ["verifier"]);
  const id = z.uuid().parse((await params).id);
  const admin = createAdminSupabase();
  const { data: consent } = await admin.from("consents").select("grantee_id, receipt").eq("id", id).maybeSingle();
  if (!consent || consent.grantee_id !== profile.verifierOrgId || !consent.receipt) throw new ApiError(404, "NOT_FOUND", "There is no receipt for this request yet.");
  const { payload, signature } = consent.receipt as { payload: { verifier: string; purpose: string; verified_at: string; result: Record<string, unknown> }; signature: string };
  const { doc, fonts } = await newPdf("Sutra verification receipt");
  const page = doc.addPage([A4.w, A4.h]);
  brandHeader(page, fonts, "Verification Receipt", `Receipt ${id}`);
  const label = (k: string) => k.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  const y = keyValues(page, fonts, [
    ["Verified for", payload.verifier],
    ["Purpose", payload.purpose],
    ["When", payload.verified_at.slice(0, 19).replace("T", " ") + " UTC"],
    ...Object.entries(payload.result).map(([k, v]): [string, string] => [label(k), k === "verified" ? (v ? "Verified" : "On record, not yet verified") : String(v)]),
  ], A4.h - 160);
  await drawQr(doc, page, `${baseUrl()}/verify/receipt/${id}`, 36, y - 160, 140);
  page.drawText("Scan to confirm this receipt is genuine.", { x: 190, y: y - 80, size: 11, font: fonts.bold });
  page.drawText(`Signature: ${signature.slice(0, 64)}...`, { x: 36, y: y - 190, size: 8, font: fonts.regular, maxWidth: 520 });
  pageFooter(page, fonts, "Issued with the student's consent. Only the fields shown were shared.");
  await appendAudit(admin, { actorId: profile.userId, actorRole: profile.role, action: "verify.receipt", entity: "consent", entityId: id });
  return fileResponse(new Uint8Array(await doc.save()), "application/pdf", `sutra_receipt_${id}.pdf`);
});
