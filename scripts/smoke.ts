import { readFileSync } from "node:fs";
import { join } from "node:path";
import Papa from "papaparse";
import { verifyFullChain } from "@/lib/audit/verify";
import { verifyCredential, type SignedCredential } from "@/lib/credentials/vc";
import { signPayload, verifyPayload } from "@/lib/crypto";
import { fetchAll } from "@/lib/db";
import { numberRows, validateBatch, type ValidationContext } from "@/lib/validation";
import { coerceRow } from "@/lib/validation/columns";
import { adminClient, loadEnv, needEnv, ROOT, runScript } from "./lib/run";
import { rlsTest } from "./rls-test";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "✔" : "✖"} ${label}${detail ? `: ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function main() {
  loadEnv();
  const db = adminClient();

  console.log("Seed counts");
  const floors: [string, number][] = [["mock_apaar_registry", 5000], ["universities", 4], ["institutions", 24], ["programs", 66], ["students", 1800], ["enrolments", 2000], ["university_results", 6000], ["credentials", 500], ["audit_log", 300], ["audit_anchors", 1]];
  for (const [table, floor] of floors) {
    const { count, error } = await db.from(table).select("*", { head: true, count: "exact" });
    check(table, !error && (count ?? 0) >= floor, `${count} (at least ${floor})`);
  }

  console.log("\nValidation on messy_upload.csv");
  const raw = Papa.parse<Record<string, string>>(readFileSync(join(ROOT, "demo-files", "messy_upload.csv"), "utf8"), { header: true, skipEmptyLines: "greedy" }).data;
  const rows = numberRows(raw.map(coerceRow));
  const apaars = rows.map((r) => r.apaar_id.trim()).filter((a) => /^\d{12}$/.test(a));
  const registry = new Map<string, { name: string; dob: string; gender: string }>();
  for (let i = 0; i < apaars.length; i += 200) {
    const { data } = await db.from("mock_apaar_registry").select("apaar_id, name, dob, gender").in("apaar_id", apaars.slice(i, i + 200));
    data?.forEach((p) => registry.set(p.apaar_id, { name: p.name, dob: p.dob, gender: p.gender }));
  }
  const ctx: ValidationContext = {
    program: { level: "UG", approvedIntake: 60, supernumeraryCap: 3, seatMatrix: { CONVENOR: 33, NON_CONVENOR: 15, NRI: 6, LATERAL: 6, SUPERNUMERARY: 3 } },
    counts: { regular: 58, supernumerary: 1, byQuota: { CONVENOR: 33, NON_CONVENOR: 15, NRI: 5, LATERAL: 5, SUPERNUMERARY: 1 } },
    registry,
    existingInProgram: new Set(["900000000001"]),
    updateApaars: new Set(),
    crossInstitution: new Set(),
    fuzzyRows: new Set(),
    qualifyingMarks: new Map(apaars.map((a) => [a, 70])),
    eligibility: { minPct: 45, maxAge: 30 },
  };
  const result = validateBatch(rows, ctx);
  check("120 rows read", rows.length === 120, String(rows.length));
  check("300+ issues found", result.issues.length >= 300, String(result.issues.length));
  check("most are auto-fixable", result.stats.fixable >= 250, String(result.stats.fixable));
  check("OVER_INTAKE fires", (result.stats.byRule.OVER_INTAKE ?? 0) > 0, String(result.stats.byRule.OVER_INTAKE));

  console.log("\nSigning");
  const signature = signPayload({ smoke: true, n: 1 });
  check("sign and verify", verifyPayload({ n: 1, smoke: true }, signature));
  check("a changed payload fails", !verifyPayload({ n: 2, smoke: true }, signature));
  const publicKey = needEnv("ED25519_PUBLIC_KEY_PEM");
  const valid = (await db.from("credentials").select("payload").eq("record_id", "SUTRA-DEMO-VALID").single()).data;
  check("stored credential verifies with the public key alone", verifyCredential(valid?.payload as SignedCredential, publicKey));
  check("forged_credential.json fails", !verifyCredential(JSON.parse(readFileSync(join(ROOT, "demo-files", "forged_credential.json"), "utf8")), publicKey));

  console.log("\nAudit chain");
  const chain = await verifyFullChain(db);
  check("chain intact", chain.ok, chain.ok ? `${chain.count} entries` : `broken at entry #${chain.brokenAt}`);

  console.log("\nNo raw PII in logs");
  const PII = /@example\.com|\b[6-9]\d{9}\b|\b\d{12}\b/;
  const audit = await fetchAll<{ seq: number; meta: unknown; entity_id: string | null }>((from, to) => db.from("audit_log").select("seq, meta, entity_id").order("seq").range(from, to));
  // The log is append-only, so entries written before a fix stay. They are listed in app_cache and reported on every run, never hidden.
  const { data: known } = await db.from("app_cache").select("value").eq("key", "audit_known_exposures").maybeSingle();
  const exempt = new Set(((known?.value as { seqs?: number[] } | null)?.seqs) ?? []);
  // UUIDs and record IDs can contain long digit runs by chance, so they are removed before scanning.
  const withoutIds = (text: string) => text.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "").replace(/SUTRA-[0-9A-F]{10}/g, "");
  const leaks = audit.filter((a) => PII.test(withoutIds(`${JSON.stringify(a.meta)} ${a.entity_id ?? ""}`)));
  const fresh = leaks.filter((l) => !exempt.has(l.seq));
  check("audit log holds no new emails, mobiles or APAAR IDs", fresh.length === 0, fresh.length ? `entries ${fresh.slice(0, 5).map((l) => l.seq).join(", ")}` : `${audit.length} entries scanned`);
  if (leaks.length > fresh.length) console.log(`! ${leaks.length - fresh.length} older entries hold a synthetic APAAR ID in an API path (seq ${leaks.filter((l) => exempt.has(l.seq)).map((l) => l.seq).join(", ")}). See DEMO.md.`);
  const issues = await fetchAll<{ message: string; suggestion: unknown }>((from, to) => db.from("validation_issues").select("message, suggestion").range(from, to));
  const issueLeaks = issues.filter((i) => PII.test(`${i.message}${JSON.stringify(i.suggestion)}`));
  check("validation issues hold no raw values", issueLeaks.length === 0, `${issues.length} issues scanned`);
  const alerts = await fetchAll<{ message: string; meta: unknown }>((from, to) => db.from("alerts").select("message, meta").range(from, to));
  check("alerts hold no raw values", alerts.every((a) => !PII.test(`${a.message}${JSON.stringify(a.meta)}`)), `${alerts.length} alerts scanned`);

  console.log("\nRow-level security");
  await rlsTest(check);

  console.log(failures ? `\n✖ ${failures} smoke check(s) failed` : "\n✔ Smoke test passed");
  if (failures) process.exit(1);
}

runScript(main);
