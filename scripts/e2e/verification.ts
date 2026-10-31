import { readFileSync } from "node:fs";
import { join } from "node:path";
import { adminClient, ROOT } from "../lib/run";
import { call, check, pages } from "./helpers";

export async function verification() {
  console.log("\nCredentials and consent");
  const db = adminClient();
  await pages(null, ["/verify", "/verify/SUTRA-DEMO-VALID", "/verify/SUTRA-DEMO-REVOKED", "/verify/NOPE-1", "/.well-known/aicte-public-key.json", "/api/v1/public-key", "/signup"]);
  check("valid record shows VALID", />VALID</.test((await call(null, "/verify/SUTRA-DEMO-VALID")).text));
  check("revoked record shows REVOKED", /REVOKED/.test((await call(null, "/verify/SUTRA-DEMO-REVOKED")).text));
  const forged = await call(null, "/api/app/public/verify-json", JSON.parse(readFileSync(join(ROOT, "demo-files", "forged_credential.json"), "utf8")));
  check("forged file shows TAMPERED", forged.json?.verdict === "TAMPERED", forged.json?.verdict);
  const validPayload = (await db.from("credentials").select("payload").eq("record_id", "SUTRA-DEMO-VALID").single()).data!.payload;
  check("genuine JSON shows VALID", (await call(null, "/api/app/public/verify-json", validPayload)).json?.verdict === "VALID");
  const sample = await call(null, "/api/app/public/forged-sample");
  check("Fake QR sample is rejected", (await call(null, "/api/app/public/verify-json", sample.json)).json?.verdict === "TAMPERED");
  check("public page shows no DOB, mobile or email", !/2006-03-14|@example\.com/.test((await call(null, "/verify/SUTRA-DEMO-VALID")).text));

  await pages("student1", ["/student", "/student/consents"]);
  await pages("verifier.navayuga", ["/verifier", "/verifier/requests"]);
  await pages("verifier.pending", ["/verifier"]);
  check("pending verifier sees the waiting screen", /Waiting for AICTE approval/.test((await call("verifier.pending", "/verifier")).text));
  const pendingTry = await call("verifier.pending", "/api/app/verifier/request", { lookup: "900000000010", purpose: "Hiring check" });
  check("pending verifier cannot request", pendingTry.status === 403, String(pendingTry.status));
  await pages("aicte.admin", ["/aicte/records", "/aicte/approvals"]);

  const asked = await call("verifier.navayuga", "/api/app/verifier/request", { lookup: "900000000010", purpose: "Hiring check" });
  check("verifier asks for consent", asked.status === 200, JSON.stringify(asked.json));
  const consentId = asked.json.consentId as string;
  const early = await call("verifier.navayuga", `/api/app/verifier/view/${consentId}`, {});
  check("no result before the student answers", early.status === 403, String(early.status));
  const stranger = await call("student1", `/api/app/student/consents/${consentId}`, { action: "otp" });
  check("another student cannot answer it", stranger.status === 404, String(stranger.status));
  const otp = await call("student10", `/api/app/student/consents/${consentId}`, { action: "otp" });
  check("OTP sent to the simulated inbox", otp.status === 200, JSON.stringify(otp.json));
  const wrong = await call("student10", `/api/app/student/consents/${consentId}`, { action: "approve", otp: "000000", days: 7 });
  check("wrong OTP refused", wrong.status === 400, String(wrong.status));
  const student10 = (await db.from("consents").select("student_id").eq("id", consentId).single()).data!.student_id;
  const sms = (await db.from("simulated_sms").select("message").eq("student_id", student10).order("created_at", { ascending: false }).limit(1).single()).data!.message as string;
  const code = /code is (\d{6})/.exec(sms)![1];
  const approved = await call("student10", `/api/app/student/consents/${consentId}`, { action: "approve", otp: code, days: 7 });
  check("student approves with OTP", approved.status === 200, JSON.stringify(approved.json));
  const view = await call("verifier.navayuga", `/api/app/verifier/view/${consentId}`, {});
  const fields = Object.keys(view.json?.result ?? {}).sort().join(",");
  check("verifier gets minimal fields only", fields === "institution,program,status,verified,years", fields);
  check("second view is flagged as already used", (await call("verifier.navayuga", `/api/app/verifier/view/${consentId}`, {})).json?.alreadyViewed === true);
  const other = await call("verifier.meridian", `/api/app/verifier/view/${consentId}`, {});
  check("another verifier cannot use this consent", other.status === 404, String(other.status));
  const receipt = await call("verifier.navayuga", `/api/app/verifier/receipt/${consentId}`);
  check("receipt PDF downloads", receipt.status === 200 && receipt.type.includes("pdf"));
  await pages(null, [`/verify/receipt/${consentId}`]);
  check("access is logged for the student", !!(await db.from("access_log").select("fields_returned").eq("student_id", student10).limit(1).single()).data);

  const pdf = await call("student1", "/api/app/credentials/SUTRA-DEMO-VALID/pdf");
  check("credential PDF downloads for its owner", pdf.status === 200 && pdf.type.includes("pdf"));
  check("another student cannot download it", (await call("student3", "/api/app/credentials/SUTRA-DEMO-VALID/pdf")).status === 404);
  check("DigiLocker push is simulated", (await call("student1", "/api/app/student/digilocker", { recordId: "SUTRA-DEMO-VALID" })).json?.simulated === true);

  const { data: clean } = await db.from("enrolments").select("id").eq("validation_status", "Clean").eq("enrolment_status", "Active").limit(1).single();
  const verified = await call("aicte.officer", "/api/app/aicte/verify-records", { enrolmentIds: [clean!.id] });
  check("AICTE verifying issues a credential", verified.json?.verified === 1, JSON.stringify(verified.json));
  const recordId = verified.json.recordIds[0] as string;
  check("new credential is VALID", />VALID</.test((await call(null, `/verify/${recordId}`)).text));
  check("officer cannot propose a revocation", (await call("aicte.officer", "/api/app/approvals", { action_type: "REVOKE_RECORD", payload: { record_id: recordId, reason: "Test reason" } })).status === 403);
  check("admin proposes revocation", (await call("aicte.admin", "/api/app/approvals", { action_type: "REVOKE_RECORD", payload: { record_id: recordId, reason: "Test reason" } })).status === 200);
  const approval = (await db.from("approvals").select("id").eq("status", "Pending").eq("action_type", "REVOKE_RECORD").order("created_at", { ascending: false }).limit(1).single()).data!;
  check("the proposer cannot approve it", (await call("aicte.admin", `/api/app/approvals/${approval.id}`, { approve: true })).status === 403);
  check("a different admin can approve it", (await call("aicte.admin2", `/api/app/approvals/${approval.id}`, { approve: true })).status === 200);
  check("public page flips to REVOKED", /REVOKED/.test((await call(null, `/verify/${recordId}`)).text));

  const anyStudent = (await db.from("students").select("id").limit(1).single()).data!;
  check("officer cannot reveal PII", (await call("aicte.officer", "/api/app/reveal", { studentId: anyStudent.id, field: "mobile" })).status === 403);
  check("admin reveal works", (await call("aicte.admin", "/api/app/reveal", { studentId: anyStudent.id, field: "mobile" })).status === 200);

  const orgId = (await db.from("verifier_orgs").select("id").eq("status", "Pending").limit(1).single()).data!.id;
  check("admin proposes approving a verifier", (await call("aicte.admin", "/api/app/approvals", { action_type: "APPROVE_VERIFIER", payload: { org_id: orgId } })).status === 200);
}
