import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { GENESIS_HASH, verifyChainChunk, type AuditChainEntry } from "@/lib/audit/chain";
import { verifyCredential, type SignedCredential } from "@/lib/credentials/vc";
import { hmacMatch, verifyPayload } from "@/lib/crypto";
import { DEMO_PASSWORD, demoEmail } from "@/lib/demo-accounts";
import { adminClient, loadEnv, needEnv, ROOT, runScript } from "./lib/run";
import { ELIGIBILITY_DEFAULTS } from "./seed/catalog";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "✔" : "✖"} ${label}${detail ? `: ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function main() {
  loadEnv();
  const db = adminClient();
  const count = async (table: string, filter?: (q: any) => any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    let q = db.from(table).select("*", { head: true, count: "exact" });
    if (filter) q = filter(q);
    const { count: n, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    return n ?? 0;
  };
  const within = async (label: string, table: string, min: number, max: number) => {
    const n = await count(table);
    check(label, n >= min && n <= max, `${n} (expected ${min}-${max})`);
  };

  console.log("Counts");
  await within("Registry", "mock_apaar_registry", 5000, 5000);
  await within("Universities", "universities", 4, 4);
  await within("Institutions", "institutions", 24, 24);
  await within("Programs", "programs", 66, 75);
  await within("Students", "students", 1800, 2400);
  await within("Enrolments", "enrolments", 2000, 2500);
  await within("Verifier orgs", "verifier_orgs", 4, 4);
  await within("University results", "university_results", 6000, 9500);
  await within("Credentials", "credentials", 500, 2000);
  await within("Audit entries", "audit_log", 300, 100000);
  await within("Anchors", "audit_anchors", 1, 100);
  const states = new Set(((await db.from("institutions").select("state")).data ?? []).map((r) => r.state));
  check("States", states.size === 10, String(states.size));

  const enrolled = await count("enrolments");
  const foreign = await count("students", (q) => q.or("is_nri.eq.true,oci_status.eq.holder,is_foreign_national.eq.true"));
  const lateral = await count("enrolments", (q) => q.eq("quota_type", "LATERAL"));
  const withdrawn = await count("enrolments", (q) => q.eq("enrolment_status", "Withdrawn"));
  const pct = (n: number) => `${((100 * n) / enrolled).toFixed(1)}%`;
  console.log(`  NRI/OCI/FN students ${foreign} (${pct(foreign)}), lateral ${pct(lateral)}, withdrawn ${pct(withdrawn)}`);

  console.log("\nSeat matrix");
  const programs = (await db.from("programs").select("id, name")).data ?? [];
  const validity = await Promise.all(programs.map((p) => db.rpc("seat_matrix_valid", { p_program: p.id })));
  check("Every matrix sums to approved intake", validity.every((r) => r.data === true), `${validity.filter((r) => r.data === true).length}/${programs.length}`);

  console.log("\nEditable config and planted fill");
  const rules = (await db.from("eligibility_rules").select("level, rule_type, program_id")).data ?? [];
  const expectedRules = new Set(ELIGIBILITY_DEFAULTS.map((r) => `${r.level}:${r.rule_type}`));
  check("Only the default eligibility rules exist", rules.length === expectedRules.size && rules.every((r) => !r.program_id && expectedRules.has(`${r.level}:${r.rule_type}`)), `${rules.length} of ${expectedRules.size}`);
  const deccanPrograms = (await db.from("v_intake_status").select("program_name, enrolled_regular, approved").eq("institution_name", "Deccan Institute of Technology")).data ?? [];
  for (const [match, enrolled, approved] of [["(CSE)", 58, 60], ["Electronics", 42, 60], ["Diploma in Mechanical", 24, 30]] as const) {
    const row = deccanPrograms.find((p) => p.program_name.includes(match));
    check(`Deccan ${match} is ${enrolled} of ${approved}`, row?.enrolled_regular === enrolled && row?.approved === approved, `${row?.enrolled_regular}/${row?.approved}`);
  }

  console.log("\nPlanted scenarios");
  const intake = (await db.from("v_intake_status").select("*").eq("institution_name", "Deccan Institute of Technology").ilike("program_name", "%CSE%").single()).data;
  check("1. Deccan CSE is 58 of 60", intake?.enrolled_regular === 58 && intake?.approved === 60, `${intake?.enrolled_regular}/${intake?.approved}`);
  const messy = readFileSync(join(ROOT, "demo-files", "messy_upload.csv"), "utf8").trim().split("\n").length - 1;
  check("8. messy_upload.csv has about 120 rows", messy === 120, String(messy));

  const cross = (await db.from("cross_matches").select("enrolment_a, enrolment_b").limit(1).single()).data;
  const pair = (await db.from("enrolments").select("institutions(state), enrolment_status").in("id", [cross?.enrolment_a, cross?.enrolment_b])).data ?? [];
  const pairStates = new Set(pair.map((p) => (p.institutions as unknown as { state: string }).state));
  check("2. Cross-match spans two states, both active", pairStates.size === 2 && pair.every((p) => p.enrolment_status === "Active"), [...pairStates].join(", "));

  const publicKey = needEnv("ED25519_PUBLIC_KEY_PEM");
  const valid = (await db.from("credentials").select("payload, status").eq("record_id", "SUTRA-DEMO-VALID").single()).data;
  const revoked = (await db.from("credentials").select("status").eq("record_id", "SUTRA-DEMO-REVOKED").single()).data;
  const forged = JSON.parse(readFileSync(join(ROOT, "demo-files", "forged_credential.json"), "utf8")) as SignedCredential;
  check("3. Stored credential verifies with the public key only", verifyCredential(valid?.payload as SignedCredential, publicKey));
  check("3. Forged credential fails verification", !verifyCredential(forged, publicKey));
  check("3. Revoked record is Revoked", revoked?.status === "Revoked");

  const arjunResult = (await db.from("university_results").select("percentage").eq("apaar_hash", hmacMatch("900000000004")).eq("semester", 4).single()).data;
  check("4. Arjun's Sem 4 university record is 54%", Number(arjunResult?.percentage) === 54, String(arjunResult?.percentage));

  const quota = (await db.from("v_quota_status").select("seats_allowed, enrolled, over_quota").eq("quota_type", "NON_CONVENOR").eq("over_quota", true)).data ?? [];
  check("5. A Non-Convenor quota is overfilled", quota.some((q) => q.enrolled === 21 && q.seats_allowed === 15), `${quota.length} over-quota row(s)`);
  const noAllotment = await count("enrolments", (q) => q.eq("quota_type", "CONVENOR").eq("enrolment_status", "Active").is("counselling_allotment_no", null));
  check("5. Convenor student without allotment", noAllotment === 1, String(noAllotment));

  const clusters = (await db.from("fraud_clusters").select("member_count").eq("cluster_type", "SHARED_MOBILE")).data ?? [];
  const members = clusters.reduce((sum, c) => sum + c.member_count, 0);
  check("6. 40 students share 3 mobile numbers", clusters.length === 3 && members === 40, `${members} students, ${clusters.length} numbers`);

  console.log("\nAudit chain (recomputed in TypeScript from Postgres rows)");
  let prev = GENESIS_HASH;
  let total = 0;
  let after = 0;
  for (;;) {
    const { data, error } = await db.from("v_audit_chain").select("*").gt("seq", after).order("seq").limit(500);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    const result = verifyChainChunk(data as AuditChainEntry[], prev);
    if (!result.ok) {
      check("7. Chain intact", false, `break at entry #${result.brokenAt}`);
      break;
    }
    prev = result.lastHash;
    total += result.count;
    after = data[data.length - 1]!.seq;
  }
  check("7. Chain intact", total >= 300, `${total} entries`);
  const anchor = (await db.from("audit_anchors").select("date, last_seq, last_hash, signature").limit(1).single()).data;
  check("7. Anchor signature verifies", !!anchor && verifyPayload({ date: anchor.date, last_seq: anchor.last_seq, last_hash: anchor.last_hash }, anchor.signature, publicKey));
  const tamperAttempt = await db.from("audit_log").update({ action: "x" }).eq("seq", 1).select();
  check("7. Direct audit_log update is refused", !!tamperAttempt.error);

  console.log("\nAccess control spot check (full RLS test arrives in Phase 6)");
  const asUser = async (handle: string) => {
    const client = createClient(needEnv("NEXT_PUBLIC_SUPABASE_URL"), needEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await client.auth.signInWithPassword({ email: demoEmail(handle), password: DEMO_PASSWORD });
    if (error) throw new Error(`Demo login failed for ${handle}: ${error.message}`);
    return client;
  };
  const anon = createClient(needEnv("NEXT_PUBLIC_SUPABASE_URL"), needEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
  const anonRead = await anon.from("students").select("id").limit(1);
  check("Anonymous visitors read no students", !!anonRead.error || anonRead.data?.length === 0);

  const deccan = await asUser("admin.deccan");
  const visible = (await deccan.from("institutions").select("name")).data ?? [];
  check("Institution sees only itself", visible.length === 1 && visible[0]?.name === "Deccan Institute of Technology", `${visible.length} institution(s)`);
  const others = (await deccan.from("enrolments").select("institution_id")).data ?? [];
  check("Institution sees only its own enrolments", others.length > 0 && new Set(others.map((r) => r.institution_id)).size === 1, `${others.length} rows`);
  for (const table of ["cross_matches", "fraud_clusters", "audit_log", "alerts", "mock_apaar_registry"]) {
    const res = await deccan.from(table).select("*").limit(1);
    check(`Institution cannot read ${table}`, !!res.error || res.data?.length === 0);
  }
  const creatorLeak = await deccan.from("students").select("created_by_institution_id").limit(1);
  check("Institution cannot read who created a student", !!creatorLeak.error);

  const sabarmati = await asUser("admin.sabarmati");
  const crossIssue = (await sabarmati.from("validation_issues").select("message").eq("rule_code", "CROSS_INST_DUP")).data ?? [];
  check("Institution B sees only the generic cross-match notice", crossIssue.length === 1 && !/bharat|karnataka/i.test(crossIssue[0]!.message), crossIssue[0]?.message);

  const student = await asUser("student1");
  const ownRows = (await student.from("students").select("name")).data ?? [];
  check("Student sees only their own record", ownRows.length === 1 && ownRows[0]?.name === "Ananya Reddy", `${ownRows.length} row(s)`);

  const aicte = await asUser("aicte.admin");
  check("AICTE can read cross-matches", ((await aicte.from("cross_matches").select("id")).data?.length ?? 0) >= 1);

  const demo = (await db.from("students").select("id").eq("apaar_hash", hmacMatch("900000000010")).single()).data!;
  const { data: demoUsed } = await db.from("consents").select("id").eq("student_id", demo.id).or("approved_at.not.is.null,consumed_at.not.is.null,receipt.not.is.null");
  check("The demo student (900000000010) has no approved, used or receipted consent", (demoUsed ?? []).length === 0, `${demoUsed?.length} found`);
  const { data: seededConsents } = await db.from("consents").select("id, consumed_at, receipt").eq("seeded", true);
  const { data: seededAccess } = await db.from("access_log").select("consent_id").eq("seeded", true);
  const logged = new Set((seededAccess ?? []).map((a) => a.consent_id));
  check("Every seeded used consent has its access entry", (seededConsents ?? []).filter((c) => c.consumed_at).every((c) => logged.has(c.id)));
  check("No seeded consent keeps a receipt from an earlier run", (seededConsents ?? []).every((c) => !c.receipt));
  console.log(failures ? `\n✖ ${failures} check(s) failed` : "\n✔ All seed checks passed");
  if (failures) process.exit(1);
}

runScript(main);
