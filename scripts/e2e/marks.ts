import { adminClient, needEnv } from "../lib/run";
import { call, check, csvRows, pages } from "./helpers";

async function approveAs(handle: string, consentId: string) {
  const db = adminClient();
  await call(handle, `/api/app/student/consents/${consentId}`, { action: "otp" });
  const studentId = (await db.from("consents").select("student_id").eq("id", consentId).single()).data!.student_id;
  const sms = (await db.from("simulated_sms").select("message").eq("student_id", studentId).order("created_at", { ascending: false }).limit(1).single()).data!.message as string;
  return call(handle, `/api/app/student/consents/${consentId}`, { action: "approve", otp: /code is (\d{6})/.exec(sms)![1], days: 7 });
}

async function consentFor(requestId: string) {
  return (await adminClient().from("scholarship_requests").select("consent_id").eq("id", requestId).single()).data!.consent_id as string;
}

export async function marks() {
  console.log("\nMarks and scholarship");
  const db = adminClient();
  await pages("admin.jntuh", ["/university", "/university/results"]);
  await pages("aicte.admin", ["/aicte/rules"]);
  await pages("student4", ["/student/marksheet", "/student/scholarships"]);
  await pages("admin.deccan", ["/institution/marksheet", "/institution/marksheet?q=Arjun"]);
  await pages(null, ["/portal-demo"]);
  check("portal page is labelled simulated", /Simulated ePASS-style portal/.test((await call(null, "/portal-demo")).text));

  const published = await call("admin.jntuh", "/api/app/university/results", { fileName: "university_results.csv", rows: csvRows("university_results.csv") });
  check("university publishes a signed batch", published.status === 200 && published.json.rows > 0, `${published.json?.rows} rows`);
  const { data: batch } = await db.from("university_result_batches").select("signature").eq("id", published.json.batchId).single();
  check("batch has a signature", !!batch?.signature);
  check("a college cannot publish results", (await call("admin.deccan", "/api/app/university/results", { fileName: "x.csv", rows: csvRows("university_results.csv") })).status === 403);

  const mismatch = await call("student4", "/api/app/marksheet", { semester: 4, claimed_pct: 78 });
  check("78% claim against 54% is a mismatch", mismatch.json?.outcome === "Mismatch" && mismatch.json?.verified === 54, JSON.stringify(mismatch.json));
  const { data: alert } = await db.from("alerts").select("message").eq("code", "MARKS_MISMATCH").eq("seeded", false).limit(1).maybeSingle();
  check("MARKS_MISMATCH reaches AICTE with no student data", !!alert && !/Arjun|78|54%/.test(alert.message), alert?.message);
  check("correct claim matches", (await call("student4", "/api/app/marksheet", { semester: 4, claimed_pct: 54 })).json?.outcome === "Match");
  check("unpublished semester is NotFound", (await call("student4", "/api/app/marksheet", { semester: 8, claimed_pct: 60 })).json?.outcome === "NotFound");

  const portalKey = needEnv("SCHOLARSHIP_PORTAL_API_KEY");
  const api = (body: unknown, key = portalKey) => call(null, "/api/v1/scholarship/verify", body, { "x-api-key": key });
  check("scholarship API refuses no key", (await call(null, "/api/v1/scholarship/verify", { apaar_id: "900000000005", scheme: "X scheme" })).status === 401);
  check("scholarship API refuses a bad key", (await api({ apaar_id: "900000000005", scheme: "X scheme" }, "sutra_bad")).status === 401);

  const scheme = "Post-Matric Merit Scholarship";
  const first = await api({ apaar_id: "900000000005", scheme });
  check("first call waits for consent", first.json?.status === "Pending", JSON.stringify(first.json));
  const stillWaiting = await api({ apaar_id: "900000000005", scheme, request_id: first.json.request_id });
  check("no data before consent", stillWaiting.json?.status === "Pending" && !stillWaiting.json?.result);
  check("student approves the portal", (await approveAs("student5", await consentFor(first.json.request_id))).status === 200);
  const done = await api({ apaar_id: "900000000005", scheme, request_id: first.json.request_id });
  const fields = Object.keys(done.json?.result ?? {}).sort().join(",");
  check("success returns only the minimal fields", fields === "aggregate_pct,enrolment_status,institution,latest_semester,program,result_status,verified", fields);
  check("full marksheet is not returned", !/semester_1|"percentage"|"sgpa"/.test(done.text));
  check("student's access log records the portal", ((await db.from("access_log").select("id").like("purpose", "Scholarship:%").eq("seeded", false)).data?.length ?? 0) >= 1);

  const dup = await api({ apaar_id: "900000000007", scheme });
  check("second claim is denied as a duplicate", dup.json?.denial_reason === "Duplicate claim detected", dup.json?.denial_reason);

  const detained = await api({ apaar_id: "900000000006", scheme: "Technical Education Fee Reimbursement" });
  await approveAs("student6", await consentFor(detained.json.request_id));
  const detainedDone = await api({ apaar_id: "900000000006", scheme: "Technical Education Fee Reimbursement", request_id: detained.json.request_id });
  check("detained student is denied", detainedDone.json?.denial_reason === "Student detained in Sem 4", detainedDone.json?.denial_reason);

  const arjun = await call(null, "/api/app/portal-demo", { apaar_id: "900000000004", scheme });
  check("portal demo creates a request", arjun.json?.status === "Pending", JSON.stringify(arjun.json));
  await approveAs("student4", await consentFor(arjun.json.request_id));
  const arjunDone = await call(null, "/api/app/portal-demo", { apaar_id: "900000000004", scheme, request_id: arjun.json.request_id });
  check("marks mismatch is denied on the portal", arjunDone.json?.denial_reason === "Marks mismatch", arjunDone.json?.denial_reason);
  const { data: ineligible } = await db.from("alerts").select("id").eq("code", "SCHOLARSHIP_INELIGIBLE").eq("seeded", false).limit(1).maybeSingle();
  check("SCHOLARSHIP_INELIGIBLE alert raised", !!ineligible);

  const ruleSave = await call("aicte.officer", "/api/app/aicte/rules", { action: "save", level: "UG", program_id: null, rule_type: "MAX_AGE", value: "28" });
  check("officer cannot edit rules", ruleSave.status === 403);
}
