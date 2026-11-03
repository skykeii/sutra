import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fetchAll, chunked } from "@/lib/db";
import { adminClient, loadEnv, ROOT, runScript } from "./lib/run";

// Returns the database to the seeded state between rehearsals. The audit log is kept: it is append-only by design.
async function main() {
  loadEnv();
  const db = adminClient();
  const clear = async (table: string, apply: (q: any) => any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const { error } = await apply(db.from(table).delete());
    if (error) throw new Error(`Could not clear ${table}: ${error.message}`);
  };
  const notSeeded = (q: { eq: (c: string, v: boolean) => unknown }) => q.eq("seeded", false);
  const everything = (q: { not: (c: string, o: string, v: null) => unknown }) => q.not("id", "is", null);

  await db.rpc("demo_restore_audit");
  await clear("simulated_digilocker", everything);
  await clear("marksheet_submissions", everything);
  await clear("notifications", everything);
  await clear("simulated_sms", everything);
  await clear("webhook_deliveries", everything);
  await clear("access_log", notSeeded);
  await clear("scholarship_requests", notSeeded);
  await clear("consents", notSeeded);
  const { data: credentials } = await db.from("credentials").select("record_id").eq("seeded", false);
  for (const part of chunked((credentials ?? []).map((c) => c.record_id))) await clear("revocations", (q) => q.in("record_id", part));
  await clear("credentials", notSeeded);
  await clear("cross_matches", notSeeded);
  await clear("alerts", notSeeded);
  await clear("approvals", notSeeded);
  await clear("fraud_clusters", notSeeded);
  await clear("webhooks", notSeeded);
  await clear("api_keys", (q) => q.is("portal_id", null));

  console.log("Restoring seeded rows");
  const seeded = spawnSync(process.execPath, ["--import", "tsx", join(ROOT, "scripts", "seed.ts")], { cwd: ROOT, stdio: ["ignore", "ignore", "inherit"] });
  if (seeded.status !== 0) throw new Error("Re-seeding failed");

  const { data: batches } = await db.from("upload_batches").select("id").eq("seeded", false);
  for (const part of chunked((batches ?? []).map((b) => b.id))) await clear("enrolments", (q) => q.in("upload_batch_id", part));
  // Seeded rows either point at a seeded batch or are earlier PassedOut diplomas, so anything else came from testing.
  await clear("enrolments", (q) => q.is("upload_batch_id", null).neq("enrolment_status", "PassedOut"));
  await clear("upload_batches", notSeeded);

  const { data: resultBatches } = await db.from("university_result_batches").select("id").eq("seeded", false);
  for (const part of chunked((resultBatches ?? []).map((b) => b.id))) await clear("university_results", (q) => q.in("batch_id", part));
  await clear("university_result_batches", notSeeded);

  const enrolled = new Set((await fetchAll<{ student_id: string }>((from, to) => db.from("enrolments").select("student_id").range(from, to))).map((e) => e.student_id));
  const students = await fetchAll<{ id: string }>((from, to) => db.from("students").select("id").range(from, to));
  for (const part of chunked(students.filter((s) => !enrolled.has(s.id)).map((s) => s.id))) await clear("students", (q) => q.in("id", part));

  const { data: orgs } = await db.from("verifier_orgs").select("id").eq("seeded", false);
  for (const org of orgs ?? []) {
    const { data: members } = await db.from("profiles").select("user_id").eq("verifier_org_id", org.id);
    for (const m of members ?? []) await db.auth.admin.deleteUser(m.user_id);
  }
  await clear("verifier_orgs", notSeeded);
  await db.from("app_cache").delete().eq("key", "integrity");
  console.log("✔ Demo data reset");
}

runScript(main);
