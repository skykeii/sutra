import { readFileSync } from "node:fs";
import { join } from "node:path";
import Papa from "papaparse";
import { adminClient, loadEnv, ROOT, runScript } from "./lib/run";
import { demoCookie } from "./lib/session";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
let failures = 0;
export function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "✔" : "✖"} ${label}${detail ? `: ${detail}` : ""}`);
  if (!ok) failures += 1;
}

const cookies = new Map<string, string>();
async function as(handle: string) {
  if (!cookies.has(handle)) cookies.set(handle, await demoCookie(handle));
  return cookies.get(handle)!;
}

async function call(handle: string | null, path: string, body?: unknown, method?: string): Promise<{ status: number; json: any; text: string; type: string }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const headers: Record<string, string> = {};
  if (handle) headers.cookie = await as(handle);
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, { method: method ?? (body !== undefined ? "POST" : "GET"), headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: "manual" });
  const type = res.headers.get("content-type") ?? "";
  const text = type.includes("json") || type.includes("html") || type.includes("csv") ? await res.text() : "";
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text, type };
}

const csvRows = (file: string) => Papa.parse<Record<string, string>>(readFileSync(join(ROOT, "demo-files", file), "utf8"), { header: true, skipEmptyLines: "greedy" }).data;

async function pages(handle: string | null, paths: string[]) {
  for (const path of paths) {
    const r = await call(handle, path);
    const crashed = /Application error|Internal Server Error/.test(r.text);
    check(`${handle ?? "public"} GET ${path}`, r.status === 200 && !crashed, r.status === 200 ? "" : `status ${r.status}`);
  }
}

async function upload() {
  console.log("\nUpload and validation");
  const db = adminClient();
  const { data: cse } = await db.from("programs").select("id").ilike("name", "%(CSE)").eq("institution_id", (await db.from("institutions").select("id").eq("name", "Deccan Institute of Technology").single()).data!.id).single();
  const { data: ece } = await db.from("programs").select("id").ilike("name", "%Electronics%").eq("institution_id", (await db.from("institutions").select("id").eq("name", "Deccan Institute of Technology").single()).data!.id).single();

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

async function main() {
  loadEnv();
  const section = process.argv[2];
  const phase = (name: string) => !section || section === name;

  if (phase("pages")) {
    console.log("Pages");
    await pages(null, ["/", "/login", "/docs/rules"]);
    await pages("admin.deccan", ["/institution", "/institution/upload", "/institution/students", "/institution/students/new", "/institution/issues", "/institution/history"]);
    await pages("aicte.admin", ["/aicte", "/aicte?state=Telangana&level=UG", "/aicte/alerts", "/aicte/quota", "/aicte/duplicates", "/search?q=abcdef"]);
    await pages("admin.deccan", ["/search?q=Ananya"]);
    const dash = await call("aicte.admin", "/aicte");
    check("dashboard shows the national KPIs", /Institutions reporting/.test(dash.text) && /22 \/ 24|22<!-- --> \/ <!-- -->24/.test(dash.text));
    const quota = await call("aicte.admin", "/aicte/quota");
    check("quota audit lists Vindhya", /Vindhya College/.test(quota.text));
    const dup = await call("aicte.admin", "/aicte/duplicates");
    check("AICTE sees both sides of the match", /Bharat Institute/.test(dup.text) && /Sabarmati Institute/.test(dup.text));
    const inst = await call("admin.deccan", "/institution");
    check("intake meter shows Deccan CSE", /58/.test(inst.text) && /B\.Tech Computer Science/.test(inst.text));
    const denied = await call("admin.deccan", "/aicte");
    check("institution user gets no AICTE data", !/Institutions reporting/.test(denied.text) && /NEXT_REDIRECT|\/institution/.test(denied.text), String(denied.status));
    const signedOut = await call(null, "/institution");
    check("signed-out user is redirected to login", signedOut.status === 307, String(signedOut.status));
  }
  if (phase("upload")) await upload();

  console.log(failures ? `\n✖ ${failures} check(s) failed` : "\n✔ All e2e checks passed");
  if (failures) process.exit(1);
}

runScript(main);
