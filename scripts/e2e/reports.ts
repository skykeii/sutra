import { adminClient } from "../lib/run";
import { call, check, csvRows, pages } from "./helpers";

export async function reports() {
  console.log("\nReports and APIs");
  const db = adminClient();
  await pages("aicte.admin", ["/aicte/reports", "/aicte/reports?report=quota-audit&state=Uttar+Pradesh", "/aicte/reports?report=cross-duplicates"]);
  await pages("admin.deccan", ["/institution/reports", "/institution/integration"]);
  await pages("admin.jntuh", ["/university/certificates", "/university/results"]);
  await pages("verifier.navayuga", ["/verifier/requests"]);
  await pages(null, ["/docs", "/api/v1/openapi.json"]);

  const ids = ["institution-enrolment", "over-intake", "category", "state-trend", "submission", "quota-audit", "cross-duplicates", "scholarship-mismatches"];
  for (const id of ids) {
    for (const format of ["csv", "xlsx", "pdf"]) {
      const r = await call("aicte.admin", `/api/app/reports/${id}?format=${format}`);
      check(`${id} exports as ${format}`, r.status === 200 && r.bytes > 50, `${r.status}, ${r.bytes} bytes`);
    }
  }
  const auditCsv = await call("aicte.admin", "/api/app/reports/audit-log?format=csv");
  check("audit log exports as CSV", auditCsv.status === 200 && /prev_hash/.test(auditCsv.text));
  const deccanId = (await db.from("institutions").select("id").eq("name", "Deccan Institute of Technology").single()).data!.id;
  const bharatId = (await db.from("institutions").select("id").eq("name", "Bharat Institute of Engineering").single()).data!.id;
  const pack = await call("aicte.admin", `/api/app/reports/pack?institution=${deccanId}`);
  check("accreditation pack is a PDF", pack.status === 200 && pack.type.includes("pdf"), `${pack.bytes} bytes`);

  const scoped = await call("admin.deccan", `/api/app/reports/institution-enrolment?format=csv&institution=${bharatId}`);
  check("institution report ignores another college's filter", scoped.status === 200 && /Deccan/.test(scoped.text) && !/Bharat/.test(scoped.text));
  check("college cannot export the duplicates report", (await call("admin.deccan", "/api/app/reports/cross-duplicates?format=csv")).status === 403);
  check("college cannot export the audit log", (await call("admin.deccan", "/api/app/reports/audit-log?format=csv")).status === 403);
  check("signed-out export is refused", (await call(null, "/api/app/reports/over-intake?format=csv")).status === 401);
  const { count: exports } = await db.from("audit_log").select("seq", { head: true, count: "exact" }).eq("action", "report.export");
  check("exports are audited", (exports ?? 0) > 0, `${exports} entries`);

  const candidate = (await db.from("enrolments").select("id, institutions!inner(university_id), students(id)").eq("validation_status", "Verified").eq("enrolment_status", "Active").eq("institutions.university_id", (await db.from("universities").select("id").eq("code", "jntuh").single()).data!.id).limit(2)).data!;
  const zip = await call("admin.jntuh", "/api/app/university/certificates", { enrolmentIds: candidate.map((c) => c.id), layout: { position: "beside-id", showQr: true, fontSize: 11 } });
  check("certificate batch downloads as a ZIP", zip.status === 200 && zip.type.includes("zip"), `${zip.bytes} bytes`);
  const foreign = (await db.from("enrolments").select("id").eq("institution_id", bharatId).limit(1).single()).data!;
  check("university cannot print another university's students", (await call("admin.jntuh", "/api/app/university/certificates", { enrolmentIds: [foreign.id], layout: {} })).status === 404);

  const instKey = (await call("admin.deccan", "/api/app/keys", { action: "create", name: "ERP test" })).json?.key as string;
  check("institution key is created", !!instKey && instKey.startsWith("sutra_inst_"));
  check("staff cannot create keys", (await call("staff.deccan", "/api/app/keys", { action: "create", name: "No" })).status === 403);
  const stored = (await db.from("api_keys").select("key_hash, key_prefix").eq("name", "ERP test").limit(1).single()).data!;
  check("key is stored only as a hash", stored.key_hash !== instKey && !JSON.stringify(stored).includes(instKey));

  const header = (key: string) => ({ "x-api-key": key });
  const deccanEce = (await db.from("programs").select("id").ilike("name", "%Electronics%").eq("institution_id", deccanId).single()).data!.id;
  const rows = csvRows("clean_upload.csv").slice(0, 2);
  const dry = await call(null, "/api/v1/students/validate", { program_id: deccanEce, rows }, header(instKey));
  check("API dry run validates", dry.status === 200 && dry.json.stats.total === 2 && dry.json.issues.length === 0, JSON.stringify(dry.json?.stats));
  const enrolledBefore = (await db.from("v_intake_status").select("enrolled_regular").eq("program_id", deccanEce).single()).data!.enrolled_regular;
  const saved = await call(null, "/api/v1/students", { program_id: deccanEce, rows }, header(instKey));
  check("API saves records", saved.status === 200 && saved.json.created === 2, JSON.stringify(saved.json?.stats));
  const enrolledAfter = (await db.from("v_intake_status").select("enrolled_regular").eq("program_id", deccanEce).single()).data!.enrolled_regular;
  check("intake count moves after an API save", enrolledAfter === enrolledBefore + 2, `${enrolledBefore} to ${enrolledAfter}`);
  const again = await call(null, "/api/v1/students", { program_id: deccanEce, rows, update_existing: rows.map((r) => r.apaar_id) }, header(instKey));
  check("re-upload updates and bumps the version", again.json?.updated === 2, JSON.stringify({ created: again.json?.created, updated: again.json?.updated }));
  const { data: versions } = await db.from("enrolments").select("version").eq("upload_batch_id", again.json.batch_id);
  check("version is now 2", (versions ?? []).length === 2 && (versions ?? []).every((v) => v.version === 2));
  const tooMany = await call(null, "/api/v1/students/validate", { program_id: deccanEce, rows: Array.from({ length: 501 }, () => rows[0]) }, header(instKey));
  check("over 500 rows is refused", tooMany.status === 400, String(tooMany.status));
  const status = await call(null, `/api/v1/programs/${deccanEce}/intake-status`, undefined, header(instKey));
  check("intake status works", status.status === 200 && status.json.approved === 60 && status.json.quotas.length === 5);
  const otherProgram = (await db.from("programs").select("id").eq("institution_id", bharatId).limit(1).single()).data!.id;
  check("key cannot read another college's program", (await call(null, `/api/v1/programs/${otherProgram}/intake-status`, undefined, header(instKey))).status === 404);
  check("key cannot write to another college's program", (await call(null, "/api/v1/students", { program_id: otherProgram, rows }, header(instKey))).status === 404);
  check("wrong-scope key is refused", (await call(null, "/api/v1/university/results", { rows: [] }, header(instKey))).status === 403);

  const valid = await call(null, "/api/v1/credentials/SUTRA-DEMO-VALID");
  check("public credential API: VALID", valid.json?.status === "VALID" && valid.json?.signature_valid === true);
  check("public credential API: REVOKED", (await call(null, "/api/v1/credentials/SUTRA-DEMO-REVOKED")).json?.status === "REVOKED");
  check("public credential API has no personal fields", !/dob|mobile|email|apaar/i.test(valid.text));
  check("errors have the agreed shape", !!(await call(null, "/api/v1/credentials/NOPE")).json?.error?.code);

  const uniKey = (await call("admin.jntuh", "/api/app/keys", { action: "create", name: "Exam system" })).json?.key as string;
  const student = (candidate[0]!.students as unknown as { id: string }).id;
  const line = await call(null, `/api/v1/certificate-line/${student}`, undefined, header(uniKey));
  check("certificate line is formatted", /^APAAR ID: \d{4}-\d{4}-\d{4}$/.test(line.json?.line ?? "") && !!line.json?.qr_url, line.json?.line ? "format OK" : JSON.stringify(line.json));
  const uploaded = await call(null, "/api/v1/university/results", { rows: csvRows("university_results.csv").slice(0, 3) }, header(uniKey));
  check("university API publishes results", uploaded.status === 200 && uploaded.json.rows === 3);

  const verKey = (await call("verifier.navayuga", "/api/app/keys", { action: "create", name: "HR system" })).json?.key as string;
  const noToken = await call(null, "/api/v1/students/900000000009/verify", undefined, header(verKey));
  check("verifier API needs a consent token", noToken.status === 400, String(noToken.status));
  const seededUsed = (await db.from("consents").select("id").eq("seeded", true).not("consumed_at", "is", null).eq("grantee_type", "verifier_org").limit(1).single()).data!.id;
  const used = await call(null, "/api/v1/students/900000000009/verify", undefined, { ...header(verKey), "x-consent-token": seededUsed });
  check("used consent is refused", used.status === 403, String(used.status));

  const revoke = await db.from("api_keys").select("id").eq("name", "ERP test").limit(1).single();
  check("key can be revoked", (await call("admin.deccan", "/api/app/keys", { action: "revoke", id: revoke.data!.id })).status === 200);
  check("revoked key stops working", (await call(null, `/api/v1/programs/${deccanEce}/intake-status`, undefined, header(instKey))).status === 401);

  const hook = await call("admin.deccan", "/api/app/webhooks", { action: "create", url: "http://localhost:3000/api/demo/webhook-sink", events: ["over_intake"] });
  check("webhook registered, secret shown once", !!hook.json?.secret);
}
