import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DEMO_PASSWORD, demoEmail } from "@/lib/demo-accounts";
import { applySafeFixes } from "@/lib/validation/fixes";
import { coerceRow } from "@/lib/validation/columns";
import { adminClient, needEnv } from "../lib/run";
import { call, check, csvRows } from "./helpers";

async function listen(handle: string, table: string): Promise<{ client: SupabaseClient; events: unknown[]; ready: boolean }> {
  const client = createClient(needEnv("NEXT_PUBLIC_SUPABASE_URL"), needEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: demoEmail(handle), password: DEMO_PASSWORD });
  if (error) throw new Error(error.message);
  await client.realtime.setAuth(data.session!.access_token);
  const events: unknown[] = [];
  const ready = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), 15_000);
    client.channel(`e2e-${handle}-${table}`).on("postgres_changes", { event: "INSERT", schema: "public", table }, (p) => events.push(p.new)).subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timer);
        resolve(true);
      }
    });
  });
  return { client, events, ready };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function scenarios() {
  console.log("\nDemo scenarios, end to end");
  const db = adminClient();
  const deccan = (await db.from("institutions").select("id").eq("name", "Deccan Institute of Technology").single()).data!.id;
  const cse = (await db.from("programs").select("id").ilike("name", "%(CSE)").eq("institution_id", deccan).single()).data!.id;
  const rows = csvRows("messy_upload.csv");

  // Scenario 8: fixable messy upload.
  const first = await call("admin.deccan", "/api/app/upload", { programId: cse, fileName: "messy_upload.csv", rows });
  const numbered = rows.map((r, i) => ({ ...coerceRow(r), rowNumber: i + 2 }));
  const fixed = applySafeFixes(numbered, first.json.issues);
  check("8. Apply all safe fixes applies 300 fixes", fixed.applied.length >= 300, String(fixed.applied.length));
  const plain = fixed.rows.map(({ rowNumber: _rowNumber, ...r }) => r);
  const second = await call("admin.deccan", "/api/app/upload", { programId: cse, fileName: "messy_upload.csv", rows: plain });
  check("8. Format and DOB issues are gone after the fixes", !second.json.stats.byRule.FIELD_FORMAT && !second.json.stats.byRule.APAAR_DOB_MISMATCH, JSON.stringify(second.json.stats.byRule));
  check("8. Issues a person must decide remain", (second.json.stats.byRule.APAAR_NOT_FOUND ?? 0) === 1 && (second.json.stats.byRule.FORMULA_INJECTION ?? 0) === 1);

  // Scenario 1: live alert with no refresh, seen only by AICTE.
  const aicte = await listen("aicte.admin", "alerts");
  const college = await listen("admin.sabarmati", "alerts");
  check("1. AICTE live feed connects", aicte.ready);
  await sleep(1500);
  const submit = await call("admin.deccan", "/api/app/upload", { programId: cse, fileName: "messy_upload.csv", rows, commit: true });
  check("1. Upload adds 2 and holds back the rest", submit.json?.created === 2, `created ${submit.json?.created}`);
  for (let i = 0; i < 30 && !aicte.events.length; i++) await sleep(500);
  check("1. Live alert reaches AICTE with no refresh", aicte.events.some((e) => (e as { code: string }).code === "OVER_INTAKE"), `${aicte.events.length} live events`);
  await sleep(2000);
  check("1. Another college receives no alert events", college.events.length === 0, `${college.events.length} events`);
  await aicte.client.removeAllChannels();
  await college.client.removeAllChannels();
  const meter = await call("admin.deccan", "/institution");
  check("1. Intake meter shows 60 of 60 and the warning", /AICTE has been alerted/.test(meter.text) && /bg-red-600/.test(meter.text));
  const { data: delivery } = await db.from("webhook_deliveries").select("ok").eq("event", "over_intake").eq("ok", true).limit(1).maybeSingle();
  check("1. Webhook delivered", !!delivery);

  // Scenario 2: student at two colleges.
  const issue = await call("admin.sabarmati", "/institution/issues?rule=CROSS_INST_DUP");
  check("2. College sees only the generic notice", /Sabarmati|cross|Possible|keyed hash/i.test(issue.text) && !/Bharat Institute/.test(issue.text));
  check("2. AICTE sees both institutions", /Bharat Institute/.test((await call("aicte.admin", "/aicte/duplicates")).text));

  // Live re-upload of a known student to another college raises a new match.
  const reg = (await db.from("mock_apaar_registry").select("apaar_id, name, dob, gender").eq("apaar_id", "900000000010").single()).data!;
  const hit = await call("admin.deccan", "/api/app/upload", { programId: (await db.from("programs").select("id").ilike("name", "%Electronics%").eq("institution_id", deccan).single()).data!.id, fileName: "single-entry", rows: [{ apaar_id: reg.apaar_id, name: reg.name, dob: reg.dob, gender: reg.gender, nationality: "Indian", admission_date: "2026-08-01", admission_category: "Regular", quota_type: "NON_CONVENOR", is_nri: "false", oci_status: "none", is_foreign_national: "false", fee_status: "Paid", enrolment_status: "Active", prev_qualification: "Class 12", prev_pass_year: "2024" }] });
  const crossIssue = hit.json?.issues?.find((i: { code: string }) => i.code === "CROSS_INST_DUP");
  check("2. Keyed-hash match fires on a live upload", crossIssue?.message === "Possible existing enrolment elsewhere. Please contact AICTE.", crossIssue?.message);

  // Scenario 5: quota abuse.
  const vindhya = (await db.from("v_quota_status").select("enrolled, seats_allowed").eq("quota_type", "NON_CONVENOR").eq("over_quota", true)).data ?? [];
  check("5. Non-Convenor overflow is visible", vindhya.some((v) => v.enrolled === 21 && v.seats_allowed === 15));

  // Scenario 6: ghost cluster.
  check("6. Ghost cluster is on the fraud page", /Shared mobile/.test((await call("aicte.admin", "/aicte/fraud")).text));
}
