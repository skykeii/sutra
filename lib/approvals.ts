import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { appendAudit } from "@/lib/audit";
import { notifyStudent } from "@/lib/consent";
import { ApiError } from "@/lib/http";
import { fireWebhook } from "@/lib/webhooks";

export const proposalSchema = z.discriminatedUnion("action_type", [
  z.object({ action_type: z.literal("CHANGE_INTAKE"), payload: z.object({ program_id: z.uuid(), new_intake: z.number().int().min(1).max(5000), reason: z.string().min(3).max(300) }) }),
  z.object({ action_type: z.literal("REVOKE_RECORD"), payload: z.object({ record_id: z.string().min(3).max(60), reason: z.string().min(3).max(300) }) }),
  z.object({ action_type: z.literal("APPROVE_VERIFIER"), payload: z.object({ org_id: z.uuid() }) }),
]);

export type Proposal = z.infer<typeof proposalSchema>;

async function describe(admin: SupabaseClient, p: Proposal): Promise<Record<string, unknown>> {
  if (p.action_type === "CHANGE_INTAKE") {
    const { data } = await admin.from("programs").select("name, institutions(name)").eq("id", p.payload.program_id).maybeSingle();
    if (!data) throw new ApiError(404, "NOT_FOUND", "That program was not found.");
    return { ...p.payload, program_name: data.name, institution: (data.institutions as unknown as { name: string }).name };
  }
  if (p.action_type === "REVOKE_RECORD") {
    const { data } = await admin.from("credentials").select("status").eq("record_id", p.payload.record_id).maybeSingle();
    if (!data) throw new ApiError(404, "NOT_FOUND", "That record ID was not found.");
    if (data.status === "Revoked") throw new ApiError(409, "ALREADY_REVOKED", "That record is already revoked.");
    return p.payload;
  }
  const { data } = await admin.from("verifier_orgs").select("name, status").eq("id", p.payload.org_id).maybeSingle();
  if (!data) throw new ApiError(404, "NOT_FOUND", "That organisation was not found.");
  if (data.status === "Approved") throw new ApiError(409, "ALREADY_APPROVED", "That organisation is already approved.");
  return { ...p.payload, org_name: data.name };
}

export async function proposeApproval(admin: SupabaseClient, p: Proposal, actorId: string, actorRole: string): Promise<void> {
  const payload = await describe(admin, p);
  const { data, error } = await admin.from("approvals").insert({ action_type: p.action_type, payload, requested_by: actorId }).select("id").single();
  if (error) throw new Error(error.message);
  await appendAudit(admin, { actorId, actorRole, action: "approval.request", entity: "approval", entityId: data.id, meta: { action_type: p.action_type } });
}

async function execute(admin: SupabaseClient, action: string, payload: Record<string, unknown>, approverId: string) {
  if (action === "CHANGE_INTAKE") {
    const programId = String(payload.program_id);
    const next = Number(payload.new_intake);
    const { data: program } = await admin.from("programs").select("approved_intake").eq("id", programId).single();
    const { data: convenor } = await admin.from("seat_matrix").select("id, seats_allowed").eq("program_id", programId).eq("quota_type", "CONVENOR").single();
    const delta = next - (program?.approved_intake ?? 0);
    if (!convenor || convenor.seats_allowed + delta < 0) throw new ApiError(409, "MATRIX_CONFLICT", "The seat matrix cannot absorb this change. Adjust the quotas first.");
    await admin.from("seat_matrix").update({ seats_allowed: convenor.seats_allowed + delta }).eq("id", convenor.id);
    await admin.from("programs").update({ approved_intake: next }).eq("id", programId);
    const { data: valid } = await admin.rpc("seat_matrix_valid", { p_program: programId });
    if (!valid) throw new ApiError(409, "MATRIX_CONFLICT", "Seat matrix no longer adds up to the approved intake.");
    return;
  }
  if (action === "REVOKE_RECORD") {
    const recordId = String(payload.record_id);
    const reason = String(payload.reason);
    const { data: cred } = await admin.from("credentials").select("enrolment_id, enrolments(institution_id, students(apaar_hash))").eq("record_id", recordId).single();
    await admin.from("credentials").update({ status: "Revoked", revoked_reason: reason }).eq("record_id", recordId);
    await admin.from("revocations").insert({ record_id: recordId, reason, revoked_by: approverId });
    await admin.from("enrolments").update({ validation_status: "Revoked", updated_by: approverId }).eq("id", cred?.enrolment_id ?? "");
    const enrolment = cred?.enrolments as unknown as { institution_id: string; students: { apaar_hash: string } } | undefined;
    if (enrolment) {
      await notifyStudent(admin, enrolment.students.apaar_hash, "Your credential was revoked", reason, "/student");
      await fireWebhook(admin, enrolment.institution_id, "credential_revoked", { record_id: recordId, reason });
    }
    return;
  }
  await admin.from("verifier_orgs").update({ status: "Approved", approved_by: approverId }).eq("id", String(payload.org_id));
}

export async function decideApproval(admin: SupabaseClient, id: string, approve: boolean, actorId: string, actorRole: string): Promise<void> {
  const { data: row } = await admin.from("approvals").select("*").eq("id", id).maybeSingle();
  if (!row) throw new ApiError(404, "NOT_FOUND", "That request was not found.");
  if (row.status !== "Pending") throw new ApiError(409, "ALREADY_DECIDED", "That request has already been decided.");
  if (row.requested_by === actorId) throw new ApiError(403, "SAME_PERSON", "A different AICTE admin must decide a request you made.");
  if (approve) await execute(admin, row.action_type, row.payload, actorId);
  else if (row.action_type === "APPROVE_VERIFIER") await admin.from("verifier_orgs").update({ status: "Rejected" }).eq("id", String(row.payload.org_id));
  const { error } = await admin.from("approvals").update({ status: approve ? "Approved" : "Rejected", approved_by: actorId }).eq("id", id);
  if (error) throw new Error(error.message);
  await appendAudit(admin, { actorId, actorRole, action: approve ? "approval.approve" : "approval.reject", entity: "approval", entityId: id, meta: { action_type: row.action_type, maker_checker: true } });
}
