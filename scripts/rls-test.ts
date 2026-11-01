import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DEMO_PASSWORD, demoEmail } from "@/lib/demo-accounts";
import { adminClient, needEnv } from "./lib/run";

type Check = (label: string, ok: boolean, detail?: string) => void;

function anonClient(): SupabaseClient {
  return createClient(needEnv("NEXT_PUBLIC_SUPABASE_URL"), needEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
}

async function asUser(handle: string): Promise<SupabaseClient> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email: demoEmail(handle), password: DEMO_PASSWORD });
  if (error) throw new Error(`Demo login failed for ${handle}: ${error.message}`);
  return client;
}

const empty = async (client: SupabaseClient, table: string) => {
  const res = await client.from(table).select("*").limit(1);
  return !!res.error || res.data?.length === 0;
};

// A write "fails" under RLS either with an error or by silently affecting zero rows.
const writeBlocked = (res: { error: unknown; data: unknown[] | null }) => !!res.error || !res.data?.length;

export async function rlsTest(check: Check): Promise<void> {
  const admin = adminClient();
  const id = async (name: string) => (await admin.from("institutions").select("id").eq("name", name).single()).data!.id as string;
  const deccanId = await id("Deccan Institute of Technology");
  const bharatId = await id("Bharat Institute of Engineering");

  const anon = anonClient();
  for (const table of ["students", "enrolments", "institutions", "credentials", "audit_log", "consents", "profiles", "mock_apaar_registry", "api_keys"]) {
    check(`Anonymous visitors read nothing from ${table}`, await empty(anon, table));
  }
  check("Anonymous visitors cannot read dashboard views", await empty(anon, "v_intake_status"));

  const deccan = await asUser("admin.deccan");
  const institutions = (await deccan.from("institutions").select("id")).data ?? [];
  check("College sees only itself in institutions", institutions.length === 1 && institutions[0]!.id === deccanId);
  check("College cannot read another college's enrolments", ((await deccan.from("enrolments").select("id").eq("institution_id", bharatId)).data ?? []).length === 0);
  check("College cannot read another college's programs", ((await deccan.from("programs").select("id").eq("institution_id", bharatId)).data ?? []).length === 0);
  check("College cannot read another college's issues", ((await deccan.from("validation_issues").select("id").eq("institution_id", bharatId)).data ?? []).length === 0);
  check("College cannot read another college's batches", ((await deccan.from("upload_batches").select("id").eq("institution_id", bharatId)).data ?? []).length === 0);
  // Some lateral entrants hold an earlier diploma at Deccan, and Deccan may rightly see those students.
  const deccanStudents = new Set((await admin.from("enrolments").select("student_id").eq("institution_id", deccanId).limit(1000)).data!.map((e) => e.student_id));
  const bharatStudents = (await admin.from("enrolments").select("student_id").eq("institution_id", bharatId).limit(200)).data!.map((e) => e.student_id).filter((s) => !deccanStudents.has(s)).slice(0, 20);
  check("College cannot read another college's students", ((await deccan.from("students").select("id").in("id", bharatStudents)).data ?? []).length === 0);
  const ownEnrolments = (await deccan.from("enrolments").select("institution_id")).data ?? [];
  check("College does read its own enrolments", ownEnrolments.length > 0 && ownEnrolments.every((e) => e.institution_id === deccanId), `${ownEnrolments.length} rows`);
  for (const table of ["cross_matches", "fraud_clusters", "audit_log", "alerts", "mock_apaar_registry", "revocations", "approvals", "audit_anchors"]) {
    check(`College cannot read ${table}`, await empty(deccan, table));
  }
  check("College cannot see who created a student", !!(await deccan.from("students").select("created_by_institution_id").limit(1)).error);
  const program = (await admin.from("programs").select("id, approved_intake").eq("institution_id", deccanId).limit(1).single()).data!;
  check("College cannot raise its own intake", writeBlocked(await deccan.from("programs").update({ approved_intake: 9999 }).eq("id", program.id).select()));
  check("Intake is unchanged", (await admin.from("programs").select("approved_intake").eq("id", program.id).single()).data!.approved_intake === program.approved_intake);
  const bharatEnrolment = (await admin.from("enrolments").select("id").eq("institution_id", bharatId).limit(1).single()).data!;
  check("College cannot edit another college's enrolment", writeBlocked(await deccan.from("enrolments").update({ fee_status: "Waived" }).eq("id", bharatEnrolment.id).select()));
  const anyProgram = (await admin.from("programs").select("id").eq("institution_id", bharatId).limit(1).single()).data!;
  const anyStudent = (await admin.from("students").select("id").limit(1).single()).data!;
  check("College cannot add an enrolment to another college", !!(await deccan.from("enrolments").insert({ student_id: anyStudent.id, institution_id: bharatId, program_id: anyProgram.id, admission_date: "2026-08-01", quota_type: "CONVENOR" })).error);
  check("College cannot delete enrolments", writeBlocked(await deccan.from("enrolments").delete().eq("institution_id", deccanId).select()));
  check("College cannot write to the audit log", !!(await deccan.rpc("append_audit", { p_actor_id: null, p_actor_role: "x", p_action: "x", p_entity: "x", p_entity_id: null })).error);
  check("College cannot use the tamper control", !!(await deccan.rpc("demo_tamper_audit", { p_seq: 1 })).error);

  const sabarmati = await asUser("admin.sabarmati");
  const notice = (await sabarmati.from("validation_issues").select("message").eq("rule_code", "CROSS_INST_DUP")).data ?? [];
  check("Second college gets only the generic notice", notice.length >= 1 && notice.every((n) => !/bharat|karnataka/i.test(n.message)));

  const university = await asUser("admin.jntuh");
  const results = (await university.from("university_results").select("university_id").limit(200)).data ?? [];
  const jntu = (await admin.from("universities").select("id").eq("code", "jntuh").single()).data!.id;
  check("University sees only its own results", results.length > 0 && results.every((r) => r.university_id === jntu));
  check("University cannot read student records", await empty(university, "students"));
  check("University cannot read enrolments", await empty(university, "enrolments"));

  const student = await asUser("student1");
  const own = (await student.from("students").select("name")).data ?? [];
  check("Student sees only their own record", own.length === 1 && own[0]!.name === "Ananya Reddy");
  const consents = (await student.from("consents").select("student_id")).data ?? [];
  check("Student sees only their own consents", new Set(consents.map((c) => c.student_id)).size <= 1);
  const ownResults = (await student.from("university_results").select("apaar_hash")).data ?? [];
  check("Student cannot read other students' results", new Set(ownResults.map((r) => r.apaar_hash)).size <= 1, `${ownResults.length} rows`);
  check("Student cannot read the audit log", await empty(student, "audit_log"));

  const verifier = await asUser("verifier.navayuga");
  for (const table of ["students", "enrolments", "credentials", "consents", "access_log", "university_results", "audit_log"]) {
    check(`Verifier has no direct access to ${table}`, await empty(verifier, table));
  }
  const portal = await asUser("portal.epass");
  for (const table of ["students", "enrolments", "university_results", "scholarship_requests", "consents"]) {
    check(`Scholarship portal has no direct access to ${table}`, await empty(portal, table));
  }

  const officer = await asUser("aicte.officer");
  check("AICTE officer can read everything needed", ((await officer.from("cross_matches").select("id")).data?.length ?? 0) >= 1 && ((await officer.from("audit_log").select("seq").limit(1)).data?.length ?? 0) === 1);
  check("AICTE officer cannot change intake directly", writeBlocked(await officer.from("programs").update({ approved_intake: 9999 }).eq("id", program.id).select()));
  check("AICTE officer cannot approve verifiers directly", writeBlocked(await officer.from("verifier_orgs").update({ status: "Approved" }).eq("status", "Pending").select()));
  check("AICTE officer cannot edit eligibility rules", writeBlocked(await officer.from("eligibility_rules").update({ params: { min: 1 } }).eq("level", "UG").select()));

  const aicte = await asUser("aicte.admin");
  check("Even an AICTE admin cannot edit the audit log", !!(await aicte.from("audit_log").update({ action: "x" }).eq("seq", 1)).error);
  check("Even an AICTE admin cannot delete from the audit log", !!(await aicte.from("audit_log").delete().eq("seq", 1)).error);
  check("Service role cannot edit the audit log", !!(await admin.from("audit_log").update({ action: "x" }).eq("seq", 1)).error);
  check("Service role cannot delete from the audit log", !!(await admin.from("audit_log").delete().eq("seq", 1)).error);
}
