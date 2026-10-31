import { adminClient, loadEnv, runScript } from "./lib/run";
import { call, check, csvRows, pages, state } from "./e2e/helpers";
import { ai } from "./e2e/ai";
import { marks } from "./e2e/marks";
import { reports } from "./e2e/reports";
import { security } from "./e2e/security";
import { verification } from "./e2e/verification";

async function upload() {
  console.log("\nUpload and validation");
  const db = adminClient();
  const deccan = (await db.from("institutions").select("id").eq("name", "Deccan Institute of Technology").single()).data!.id;
  const { data: cse } = await db.from("programs").select("id").ilike("name", "%(CSE)").eq("institution_id", deccan).single();
  const { data: ece } = await db.from("programs").select("id").ilike("name", "%Electronics%").eq("institution_id", deccan).single();

  const clean = await call("admin.deccan", "/api/app/upload", { programId: ece!.id, fileName: "clean_upload.csv", rows: csvRows("clean_upload.csv") });
  check("clean_upload.csv has no issues", clean.status === 200 && clean.json.issues.length === 0, JSON.stringify(clean.json?.stats?.byRule ?? clean.json));

  const messy = await call("admin.deccan", "/api/app/upload", { programId: cse!.id, fileName: "messy_upload.csv", rows: csvRows("messy_upload.csv") });
  const stats = messy.json?.stats;
  check("messy_upload.csv finds 300+ issues", (stats?.errors ?? 0) + (stats?.warnings ?? 0) >= 300, JSON.stringify(stats?.byRule));
  check("most messy issues are auto-fixable", stats?.fixable > 250, `${stats?.fixable} fixable`);
  check("OVER_INTAKE fires for the extra rows", (stats?.byRule?.OVER_INTAKE ?? 0) === 6, String(stats?.byRule?.OVER_INTAKE));

  const other = await call("admin.sabarmati", "/api/app/upload", { programId: cse!.id, fileName: "x.csv", rows: csvRows("clean_upload.csv") });
  check("another institution cannot upload to this program", other.status === 404, String(other.status));
  const anon = await call(null, "/api/app/upload", { programId: cse!.id, fileName: "x.csv", rows: csvRows("clean_upload.csv") });
  check("anonymous upload is refused", anon.status === 401, String(anon.status));
  const badType = await call("admin.deccan", "/api/app/upload", { programId: cse!.id, fileName: "malware.exe", rows: csvRows("clean_upload.csv") });
  check("non csv/xlsx file names are refused", badType.status === 400, String(badType.status));

  const submit = await call("admin.deccan", "/api/app/upload", { programId: cse!.id, fileName: "messy_upload.csv", rows: csvRows("messy_upload.csv"), commit: true });
  check("submit saves only admissible rows", submit.status === 200 && submit.json.created === 2, `created ${submit.json?.created}, blocked ${submit.json?.stats?.blockedRows}`);
  const { data: alert } = await db.from("alerts").select("code").eq("code", "OVER_INTAKE").eq("seeded", false).limit(1).maybeSingle();
  check("AICTE alert raised", !!alert);
  const { data: delivery } = await db.from("webhook_deliveries").select("ok, status_code").eq("event", "over_intake").limit(1).maybeSingle();
  check("signed webhook delivered", delivery?.ok === true, JSON.stringify(delivery));
  const { data: stored } = await db.from("validation_issues").select("message, suggestion").eq("batch_id", submit.json.batchId);
  const blob = JSON.stringify(stored);
  const raw = csvRows("messy_upload.csv")[0]!;
  check("stored issues contain no raw values", !blob.includes(raw.apaar_id!) && !blob.includes(raw.mobile!) && !blob.includes(raw.email!));
  await pages("admin.deccan", [`/institution/history/${submit.json.batchId}`]);
}

async function basePages() {
  console.log("Pages");
  await pages(null, ["/", "/login", "/docs/rules"]);
  await pages("admin.deccan", ["/institution", "/institution/upload", "/institution/students", "/institution/students/new", "/institution/issues", "/institution/history", "/search?q=Ananya"]);
  await pages("aicte.admin", ["/aicte", "/aicte?state=Telangana&level=UG", "/aicte/alerts", "/aicte/quota", "/aicte/duplicates", "/search?q=abcdef"]);
  const dash = await call("aicte.admin", "/aicte");
  check("dashboard shows the national KPIs", /Institutions reporting/.test(dash.text) && /22 \/ 24|22<!-- --> \/ <!-- -->24/.test(dash.text));
  check("quota audit lists Vindhya", /Vindhya College/.test((await call("aicte.admin", "/aicte/quota")).text));
  const dup = await call("aicte.admin", "/aicte/duplicates");
  check("AICTE sees both sides of the match", /Bharat Institute/.test(dup.text) && /Sabarmati Institute/.test(dup.text));
  const inst = await call("admin.deccan", "/institution");
  check("intake meter shows Deccan CSE", /58/.test(inst.text) && /B\.Tech Computer Science/.test(inst.text));
  const denied = await call("admin.deccan", "/aicte");
  check("institution user gets no AICTE data", !/Institutions reporting/.test(denied.text), String(denied.status));
  check("signed-out user is redirected to login", (await call(null, "/institution")).status === 307);
}

const SECTIONS: Record<string, () => Promise<void>> = { pages: basePages, upload, verify: verification, security, marks, reports, ai };

async function main() {
  loadEnv();
  const wanted = process.argv[2];
  for (const [name, run] of Object.entries(SECTIONS)) if (!wanted || wanted === name) await run();
  console.log(state.failures ? `\n✖ ${state.failures} check(s) failed` : "\n✔ All e2e checks passed");
  if (state.failures) process.exit(1);
}

runScript(main);
