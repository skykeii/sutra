import { appendAudit } from "@/lib/audit";
import { getSessionProfile } from "@/lib/auth/session";
import { credentialPdf } from "@/lib/credentials/service";
import type { SignedCredential } from "@/lib/credentials/vc";
import { ApiError, fileResponse, route } from "@/lib/http";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";

export const GET = route<{ params: Promise<{ recordId: string }> }>(async (_req, { params }) => {
  const profile = await getSessionProfile();
  if (!profile) throw new ApiError(401, "NOT_SIGNED_IN", "Please sign in.");
  const { recordId } = await params;
  // RLS decides access: the student, their institution, or AICTE.
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("credentials").select("payload, status").eq("record_id", recordId).maybeSingle();
  if (!data) throw new ApiError(404, "NOT_FOUND", "That record was not found.");
  await appendAudit(createAdminSupabase(), { actorId: profile.userId, actorRole: profile.role, action: "credential.download", entity: "credential", entityId: recordId });
  const pdf = await credentialPdf(recordId, data.payload as SignedCredential, data.status === "Revoked");
  return fileResponse(new Uint8Array(pdf), "application/pdf", `${recordId}.pdf`);
});
