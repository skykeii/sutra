import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { faker, fakerEN_IN } from "@faker-js/faker";
import { appendAudit, type AuditEvent } from "@/lib/audit";
import { issueCredential } from "@/lib/credentials/vc";
import { canonicalJSON, encryptField, hmacMatch, sha256Hex, signPayload } from "@/lib/crypto";
import { DEMO_PASSWORD, demoEmail } from "@/lib/demo-accounts";
import { adminClient, ENV_PATH, FriendlyError, loadEnv, needEnv, ROOT, runScript } from "./lib/run";
import {
  DEMO_STUDENTS,
  ELIGIBILITY_DEFAULTS,
  INSTITUTIONS,
  PROGRAM_TEMPLATES,
  QUOTA_LABELS,
  UNIVERSITIES,
  VERIFIER_ORGS,
  type ProgramTemplate,
  type SeedUser,
} from "./seed/catalog";

type Row = Record<string, unknown>;
type Quota = "CONVENOR" | "NON_CONVENOR" | "NRI" | "SUPERNUMERARY" | "LATERAL";

const ACADEMIC_YEAR = "2026-27";
const DAY = 86_400_000;
const REF_DATE = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
const COHORT_2024_SHARE = 0.72;
const RESULTS_STUDENT_TARGET = 1500;

// Same logical record, same id on every run: this is what makes the seed idempotent.
function uid(...parts: (string | number)[]): string {
  const h = createHash("sha256").update(`sutra:${parts.join(":")}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const daysAgo = (n: number, jitterMinutes = 0) => new Date(REF_DATE.getTime() - n * DAY + jitterMinutes * 60_000).toISOString();

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function main() {
  loadEnv();
  needEnv("NEXT_PUBLIC_SUPABASE_URL");
  needEnv("SUPABASE_SERVICE_ROLE_KEY");
  needEnv("HMAC_MATCH_KEY");
  needEnv("FIELD_ENC_KEY");
  needEnv("ED25519_PRIVATE_KEY_PEM");
  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  // Signed into each credential, so it must be the public address, not whichever machine ran the seed.
  const publicUrl = process.env.DEMO_PUBLIC_URL ?? "https://sutra-ochre.vercel.app";
  const db = adminClient();

  const probe = await db.from("universities").select("id", { head: true, count: "exact" });
  if (probe.error) {
    throw new FriendlyError(`Could not read the database with SUPABASE_SERVICE_ROLE_KEY (${probe.error.message}). Run npm run migrate first and check the key.`);
  }

  async function upsert(table: string, rows: Row[], onConflict = "id") {
    for (const part of chunks(rows, 500)) {
      const { error } = await db.from(table).upsert(part, { onConflict });
      if (error) throw new Error(`Seeding ${table} failed: ${error.message}`);
    }
    console.log(`• ${table}: ${rows.length}`);
  }

  async function pruneTo(table: string, keep: { id: string }[]) {
    const wanted = new Set(keep.map((r) => r.id));
    const { data, error } = await db.from(table).select("id");
    if (error) throw new Error(`Reading ${table} failed: ${error.message}`);
    for (const part of chunks((data ?? []).map((r) => r.id as string).filter((id) => !wanted.has(id)), 200)) {
      const { error: deleteError } = await db.from(table).delete().in("id", part);
      if (deleteError) throw new Error(`Pruning ${table} failed: ${deleteError.message}`);
      console.log(`• ${table}: removed ${part.length} row(s) not in the seed`);
    }
  }

  faker.seed(2026);
  fakerEN_IN.seed(2026);
  const f = fakerEN_IN;

  // ---------- Registry ----------
  type Person = { apaar: string; name: string; dob: string; gender: string };
  const seen = new Set<string>();
  const generic: Person[] = [];
  const registryTarget = 5000 - DEMO_STUDENTS.length;
  while (generic.length < registryTarget) {
    const apaar = f.string.numeric({ length: 12, allowLeadingZeros: false });
    if (apaar.startsWith("9000000") || seen.has(apaar)) continue;
    seen.add(apaar);
    const gender = f.helpers.arrayElement(["Male", "Female"]);
    const sex = gender === "Male" ? "male" : "female";
    generic.push({
      apaar,
      name: `${f.person.firstName(sex)} ${f.person.lastName()}`,
      dob: f.date.between({ from: "1998-01-01", to: "2007-12-31" }).toISOString().slice(0, 10),
      gender,
    });
  }
  // The last 200 registry people stay unenrolled, for the demo upload files.
  const uploadPeople = generic.slice(-200);
  let poolIndex = 0;
  const nextPerson = (): Person => {
    if (poolIndex >= generic.length - uploadPeople.length) throw new Error("Registry pool exhausted");
    return generic[poolIndex++]!;
  };
  const demoPeople = DEMO_STUDENTS.map<Person>((s) => ({ apaar: s.apaar, name: s.name, dob: s.dob, gender: s.gender }));

  // ---------- Institutions and programs ----------
  const universities = UNIVERSITIES.map((u) => ({ id: uid("university", u.code), code: u.code, name: u.name, state: u.state }));
  const institutions = INSTITUTIONS.map((inst, i) => ({
    id: uid("institution", inst.code),
    aicte_id: `1-${String(4400000000 + i * 137).padStart(10, "0")}`,
    name: inst.name,
    state: inst.state,
    district: inst.district,
    type: inst.kind,
    status: "Active",
    contact_email: `office.${inst.code}@sutra.example`,
    university_id: uid("university", inst.university),
    created_at: daysAgo(120),
  }));

  type ProgramSeed = ProgramTemplate & { id: string; instCode: string; instId: string; intake: number; supCap: number; matrix: Record<Quota, number> };
  const intakeOverride: Record<string, number> = { "deccan:CSE": 60, "deccan:ECE": 60, "ganga:CSE": 60, "vindhya:CSE": 60, "konkan:CSE": 30, "bharat:CSE": 120, "sahyadri:CSE": 180 };
  const programs: ProgramSeed[] = [];
  INSTITUTIONS.forEach((inst) => {
    PROGRAM_TEMPLATES[inst.kind].forEach((tpl) => {
      const ordinal = programs.length;
      const intake = intakeOverride[`${inst.code}:${tpl.code}`] ?? (ordinal % 8 === 0 ? 60 : 30);
      const nonConvenor = Math.round(intake * 0.25);
      const nri = Math.round(intake * 0.1);
      const lateral = Math.round(intake * 0.1);
      programs.push({
        ...tpl,
        id: uid("program", inst.code, tpl.code),
        instCode: inst.code,
        instId: uid("institution", inst.code),
        intake,
        supCap: Math.max(2, Math.ceil(intake * 0.05)),
        matrix: {
          CONVENOR: intake - nonConvenor - nri - lateral,
          NON_CONVENOR: nonConvenor,
          NRI: nri,
          LATERAL: lateral,
          SUPERNUMERARY: Math.max(2, Math.ceil(intake * 0.05)),
        },
      });
    });
  });
  const programById = new Map(programs.map((p) => [p.id, p]));
  const programOf = (inst: string, code: string) => {
    const p = programs.find((x) => x.instCode === inst && x.code === code);
    if (!p) throw new Error(`Unknown program ${inst}:${code}`);
    return p;
  };
  const instById = new Map(institutions.map((i) => [i.id, i]));
  const diplomaPrograms = programs.filter((p) => p.level === "Diploma" && !INSTITUTIONS.find((i) => i.code === p.instCode)?.notReporting);

  // ---------- Students and enrolments ----------
  interface StudentSeed {
    id: string;
    person: Person;
    hash: string;
    nationality: string;
    isNri: boolean;
    oci: "none" | "holder";
    isFn: boolean;
    passport: string | null;
    mobile: string;
    email: string;
    address: string;
    level: ProgramTemplate["level"];
    marks: number;
    admissionYear: number;
    creator: string;
    cohort2024: boolean;
  }
  interface EnrolmentSeed {
    id: string;
    student: StudentSeed;
    program: ProgramSeed;
    admissionDate: string;
    quota: Quota;
    category: "Regular" | "Supernumerary" | "Lateral";
    allotment: string | null;
    fee: string;
    status: "Active" | "Withdrawn" | "PassedOut";
    validation: "Pending" | "Clean" | "Flagged" | "Verified" | "Revoked";
    createdAt: string;
  }

  const students = new Map<string, StudentSeed>();
  const enrolments: EnrolmentSeed[] = [];
  let mobileSerial = 0;

  function makeStudent(person: Person, program: ProgramSeed, quota: Quota, cohort2024: boolean): StudentSeed {
    const existing = students.get(person.apaar);
    if (existing) return existing;
    const foreign = quota === "NRI" || quota === "SUPERNUMERARY";
    const flavour = foreign ? f.helpers.arrayElement(["nri", "oci", "fn"] as const) : null;
    mobileSerial += 1;
    const year = cohort2024 ? 2024 : 2026;
    const student: StudentSeed = {
      id: uid("student", person.apaar),
      person,
      hash: hmacMatch(person.apaar),
      nationality: flavour === "fn" ? f.helpers.arrayElement(["Nepalese", "Bangladeshi", "Sri Lankan", "Nigerian"]) : flavour === "oci" ? "Overseas Citizen of India" : "Indian",
      isNri: flavour === "nri",
      oci: flavour === "oci" ? "holder" : "none",
      isFn: flavour === "fn",
      passport: flavour ? `${f.string.alpha({ length: 1, casing: "upper" })}${f.string.numeric(7)}` : null,
      mobile: `${f.helpers.arrayElement(["7", "8", "9"])}${String(100000000 + mobileSerial * 37).slice(0, 9)}`,
      email: `${person.name.toLowerCase().replace(/[^a-z]+/g, ".")}.${mobileSerial}@example.com`,
      address: `${f.location.streetAddress()}, ${f.location.city()}`,
      level: program.level,
      marks: Number(f.number.float({ min: 52, max: 96, fractionDigits: 2 })),
      admissionYear: year,
      creator: program.instId,
      cohort2024,
    };
    students.set(person.apaar, student);
    return student;
  }

  function addEnrolment(person: Person, program: ProgramSeed, quota: Quota, opts: Partial<Pick<EnrolmentSeed, "status" | "validation" | "allotment">> & { cohort2024?: boolean; admissionDate?: string; createdAt: string; omitAllotment?: boolean }) {
    const cohort2024 = opts.cohort2024 ?? f.datatype.boolean(COHORT_2024_SHARE);
    const student = makeStudent(person, program, quota, cohort2024);
    const year = student.admissionYear;
    const validation = opts.validation ?? (cohort2024
      ? f.helpers.weightedArrayElement([{ value: "Verified" as const, weight: 80 }, { value: "Clean" as const, weight: 16 }, { value: "Flagged" as const, weight: 4 }])
      : f.helpers.weightedArrayElement([{ value: "Clean" as const, weight: 55 }, { value: "Pending" as const, weight: 30 }, { value: "Verified" as const, weight: 10 }, { value: "Flagged" as const, weight: 5 }]));
    const row: EnrolmentSeed = {
      id: uid("enrolment", person.apaar, program.id),
      student,
      program,
      admissionDate: opts.admissionDate ?? `${year}-08-${String(f.number.int({ min: 1, max: 28 })).padStart(2, "0")}`,
      quota,
      category: quota === "SUPERNUMERARY" ? "Supernumerary" : quota === "LATERAL" ? "Lateral" : "Regular",
      allotment: opts.omitAllotment ? null : opts.allotment ?? (quota === "CONVENOR" ? `CNV-${year}-${f.string.numeric(6)}` : null),
      fee: f.helpers.weightedArrayElement([{ value: "Paid", weight: 75 }, { value: "Partial", weight: 15 }, { value: "Pending", weight: 8 }, { value: "Waived", weight: 2 }]),
      status: opts.status ?? "Active",
      validation,
      createdAt: opts.createdAt,
    };
    enrolments.push(row);
    return row;
  }

  // Exact fills for the planted scenarios: [CONVENOR, NON_CONVENOR, NRI, LATERAL].
  const plantedFill: Record<string, [number, number, number, number]> = {
    "deccan:CSE": [33, 15, 5, 5], // 58 of 60: the messy upload tips this over intake.
    "deccan:ECE": [23, 11, 4, 4], // 42 of 60: room for clean_upload.csv.
    "vindhya:CSE": [20, 21, 5, 4], // NON_CONVENOR 21 of 15 while intake is fine.
    "konkan:CSE": [17, 8, 3, 5], // 33 of 30: already over intake.
    "ganga:CSE": [28, 12, 4, 4],
    "ganga:ECE": [14, 6, 2, 2],
  };
  const demoPlacement: Record<number, { program: string; quota: Quota }> = {
    1: { program: "deccan:CSE", quota: "CONVENOR" },
    2: { program: "deccan:CSE", quota: "CONVENOR" },
    3: { program: "deccan:CSE", quota: "NON_CONVENOR" },
    4: { program: "deccan:CSE", quota: "CONVENOR" },
    5: { program: "bharat:CSE", quota: "CONVENOR" },
    6: { program: "bharat:ECE", quota: "NON_CONVENOR" },
    7: { program: "sahyadri:CSE", quota: "CONVENOR" },
    8: { program: "bharat:CSE", quota: "NON_CONVENOR" }, // Second, overlapping enrolment at Sabarmati is added below.
    9: { program: "kaveri:CSE", quota: "CONVENOR" },
    10: { program: "yamuna:CSE", quota: "CONVENOR" },
  };

  for (const program of programs) {
    const inst = INSTITUTIONS.find((i) => i.code === program.instCode)!;
    if (inst.notReporting) continue;
    const key = `${program.instCode}:${program.code}`;
    const createdBase = f.number.int({ min: 5, max: 88 });
    const createdAt = daysAgo(createdBase, f.number.int({ min: 0, max: 600 }));

    let counts: Record<"CONVENOR" | "NON_CONVENOR" | "NRI" | "LATERAL", number>;
    const planted = plantedFill[key];
    if (planted) {
      counts = { CONVENOR: planted[0], NON_CONVENOR: planted[1], NRI: planted[2], LATERAL: planted[3] };
    } else {
      const target = Math.round(program.intake * f.number.float({ min: 0.7, max: 0.98 }));
      const ratio = target / program.intake;
      counts = {
        CONVENOR: Math.floor(program.matrix.CONVENOR * ratio),
        NON_CONVENOR: Math.floor(program.matrix.NON_CONVENOR * ratio),
        NRI: Math.floor(program.matrix.NRI * ratio),
        LATERAL: Math.floor(program.matrix.LATERAL * ratio),
      };
      let spare = target - counts.CONVENOR - counts.NON_CONVENOR - counts.NRI - counts.LATERAL;
      for (const q of ["CONVENOR", "NON_CONVENOR", "NRI", "LATERAL"] as const) {
        const room = Math.min(spare, program.matrix[q] - counts[q]);
        counts[q] += room;
        spare -= room;
      }
    }

    const demos = DEMO_STUDENTS.filter((s) => demoPlacement[s.n]?.program === key);
    for (const q of ["CONVENOR", "NON_CONVENOR", "NRI", "LATERAL"] as const) {
      const demoHere = demos.filter((s) => demoPlacement[s.n]!.quota === q);
      demoHere.forEach((s) => addEnrolment(demoPeople[s.n - 1]!, program, q, { cohort2024: true, validation: "Verified", createdAt }));
      for (let i = demoHere.length; i < counts[q]; i++) {
        const row = addEnrolment(nextPerson(), program, q, { createdAt });
        // Lateral UG entrants hold an earlier diploma. Their prior record explains students with two enrolments.
        if (q === "LATERAL" && program.level === "UG" && row.student.admissionYear >= 2024) {
          const prior = diplomaPrograms.find((d) => d.instId !== program.instId && d.id.charCodeAt(0) % 3 === enrolments.length % 3) ?? diplomaPrograms.find((d) => d.instId !== program.instId)!;
          enrolments.push({
            ...row,
            id: uid("enrolment", row.student.person.apaar, prior.id),
            program: prior,
            admissionDate: `${row.student.admissionYear - 3}-08-01`,
            quota: "CONVENOR",
            category: "Regular",
            allotment: `CNV-${row.student.admissionYear - 3}-${f.string.numeric(6)}`,
            fee: "Paid",
            status: "PassedOut",
            validation: "Verified",
          });
        }
      }
    }

    const supernumerary = planted ? 1 : f.number.int({ min: 0, max: Math.min(program.supCap, 2) });
    for (let i = 0; i < supernumerary; i++) addEnrolment(nextPerson(), program, "SUPERNUMERARY", { createdAt });

    const withdrawn = f.number.float() < 0.5 ? 2 : 1;
    for (let i = 0; i < withdrawn; i++) {
      addEnrolment(nextPerson(), program, f.helpers.arrayElement(["CONVENOR", "NON_CONVENOR"] as const), { status: "Withdrawn", validation: "Clean", createdAt });
    }
  }

  const programBatchId = (p: ProgramSeed) => uid("batch", p.id);
  const enrolmentsOf = (key: string) => {
    const [inst, code] = key.split(":");
    return enrolments.filter((e) => e.program.instCode === inst && e.program.code === code);
  };

  // Scenario 2: same APAAR active at two institutions in different states.
  const kabirSecond = addEnrolment(demoPeople[7]!, programOf("sabarmati", "CSE"), "NON_CONVENOR", {
    cohort2024: true,
    validation: "Flagged",
    createdAt: daysAgo(6),
    admissionDate: "2024-08-19",
  });
  const kabirFirst = enrolments.find((e) => e.student.person.apaar === demoPeople[7]!.apaar && e.program.instCode === "bharat")!;

  // Scenario 5: a CONVENOR admission with no counselling allotment.
  const vindhyaNoAllotment = enrolmentsOf("vindhya:CSE").find((e) => e.quota === "CONVENOR" && e.status === "Active")!;
  vindhyaNoAllotment.allotment = null;
  vindhyaNoAllotment.validation = "Flagged";

  // Scenario 6: 40 active students at one college share 3 mobile numbers.
  const ghostMobiles = ["9000011111", "9000022222", "9000033333"];
  const ghostMembers = [...enrolmentsOf("ganga:CSE"), ...enrolmentsOf("ganga:ECE")].filter((e) => e.status === "Active" && e.quota !== "SUPERNUMERARY").slice(0, 40);
  ghostMembers.forEach((e, i) => {
    e.student.mobile = ghostMobiles[i % ghostMobiles.length]!;
    e.validation = "Flagged";
  });

  const studentList = [...students.values()];

  // ---------- Reference rows ----------
  await upsert("universities", universities);
  await upsert("institutions", institutions);
  await upsert("verifier_orgs", VERIFIER_ORGS.map((o) => ({ id: uid("verifier", o.code), name: o.name, type: o.type, status: o.status, scope: [...o.scope], seeded: true })));
  const portalId = uid("portal", "epass");
  await upsert("scholarship_portals", [{ id: portalId, name: "Simulated ePASS-style Portal", state: "Telangana" }]);
  await upsert("programs", programs.map((p) => ({
    id: p.id,
    institution_id: p.instId,
    name: p.code === "CSE" ? `${p.name} (CSE)` : p.name,
    level: p.level,
    academic_year: ACADEMIC_YEAR,
    approved_intake: p.intake,
    supernumerary_cap: p.supCap,
    duration_years: p.duration,
    created_at: daysAgo(110),
  })));
  for (const p of programs) {
    const sum = p.matrix.CONVENOR + p.matrix.NON_CONVENOR + p.matrix.NRI + p.matrix.LATERAL;
    if (sum !== p.intake) throw new Error(`Seat matrix for ${p.instCode}:${p.code} sums to ${sum}, intake is ${p.intake}`);
  }
  // Editable config is pruned to the seeded rows first, so a manually added rule cannot survive a reset.
  const seatRows = programs.flatMap((p) => (Object.keys(p.matrix) as Quota[]).map((q) => ({ id: uid("seat", p.id, q), program_id: p.id, quota_type: q, seats_allowed: p.matrix[q] })));
  const labelRows = QUOTA_LABELS.map((l) => ({ id: uid("quota-label", l.state, l.quota), state: l.state, quota_type: l.quota, label: l.label }));
  const ruleRows = ELIGIBILITY_DEFAULTS.map((r) => ({ id: uid("eligibility", r.level, r.rule_type), level: r.level, rule_type: r.rule_type, params: r.params }));
  await pruneTo("seat_matrix", seatRows);
  await pruneTo("quota_labels", labelRows);
  await pruneTo("eligibility_rules", ruleRows);
  await upsert("seat_matrix", seatRows);
  await upsert("quota_labels", labelRows);
  await upsert("eligibility_rules", ruleRows);
  await upsert("mock_apaar_registry", [...demoPeople, ...generic].map((p) => ({ id: uid("registry", p.apaar), apaar_id: p.apaar, name: p.name, dob: p.dob, gender: p.gender })));

  // ---------- Auth users ----------
  const seedUsers: SeedUser[] = [
    { handle: "aicte.admin", role: "aicte_admin", fullName: "Dr. Kavita Menon" },
    { handle: "aicte.admin2", role: "aicte_admin", fullName: "Prof. Sandeep Joshi" },
    { handle: "aicte.officer", role: "aicte_officer", fullName: "Nikhil Bansal" },
    ...INSTITUTIONS.flatMap((i): SeedUser[] => [
      { handle: `admin.${i.code}`, role: "institution_admin", fullName: `${i.name} Admin`, institution: i.code },
      { handle: `staff.${i.code}`, role: "institution_staff", fullName: `${i.name} Staff`, institution: i.code },
    ]),
    ...UNIVERSITIES.map((u): SeedUser => ({ handle: `admin.${u.code}`, role: "university_admin", fullName: `${u.name} Examinations`, university: u.code })),
    ...VERIFIER_ORGS.map((o): SeedUser => ({ handle: `verifier.${o.code}`, role: "verifier", fullName: o.name, verifier: o.code })),
    { handle: "portal.epass", role: "scholarship_portal", fullName: "ePASS Service Account", portal: "epass" },
    ...DEMO_STUDENTS.map((s): SeedUser => ({ handle: `student${s.n}`, role: "student", fullName: s.name, apaarHash: hmacMatch(s.apaar) })),
  ];

  const existingUsers = new Map<string, string>();
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new FriendlyError(`Could not list users with SUPABASE_SERVICE_ROLE_KEY: ${error.message}`);
    data.users.forEach((u) => u.email && existingUsers.set(u.email, u.id));
    if (data.users.length < 200) break;
  }
  const userIds = new Map<string, string>();
  for (const user of seedUsers) {
    const email = demoEmail(user.handle);
    let id = existingUsers.get(email);
    if (!id) {
      // email_confirm: true means Supabase never sends an email for these accounts.
      const { data, error } = await db.auth.admin.createUser({ email, password: DEMO_PASSWORD, email_confirm: true, user_metadata: { full_name: user.fullName } });
      if (error || !data.user) throw new Error(`Could not create demo user ${email}: ${error?.message}`);
      id = data.user.id;
    }
    userIds.set(user.handle, id);
  }
  console.log(`• auth users: ${seedUsers.length}`);
  await upsert(
    "profiles",
    seedUsers.map((u) => ({
      user_id: userIds.get(u.handle),
      role: u.role,
      full_name: u.fullName,
      institution_id: u.institution ? uid("institution", u.institution) : null,
      university_id: u.university ? uid("university", u.university) : null,
      verifier_org_id: u.verifier ? uid("verifier", u.verifier) : null,
      portal_id: u.portal ? portalId : null,
      apaar_hash: u.apaarHash ?? null,
    })),
    "user_id",
  );
  const adminId = userIds.get("aicte.admin")!;
  const admin2Id = userIds.get("aicte.admin2")!;
  await upsert("verifier_orgs", VERIFIER_ORGS.map((o) => ({ id: uid("verifier", o.code), name: o.name, type: o.type, status: o.status, scope: [...o.scope], seeded: true, approved_by: o.status === "Approved" ? admin2Id : null })));

  // ---------- Students, batches, enrolments ----------
  await upsert("students", studentList.map((s) => ({
    id: s.id,
    apaar_hash: s.hash,
    apaar_id_enc: encryptField(s.person.apaar),
    name: s.person.name,
    dob: s.person.dob,
    gender: s.person.gender,
    nationality: s.nationality,
    is_nri: s.isNri,
    oci_status: s.oci,
    is_foreign_national: s.isFn,
    passport_no_enc: s.passport ? encryptField(s.passport) : null,
    mobile_enc: encryptField(s.mobile),
    mobile_hash: hmacMatch(s.mobile),
    email_enc: encryptField(s.email),
    email_hash: hmacMatch(s.email),
    address_hash: hmacMatch(s.address),
    prev_qualification: s.level === "UG" || s.level === "Diploma" ? "Class 12" : "Bachelor's degree",
    prev_marks_pct: s.marks,
    prev_pass_year: s.admissionYear,
    created_by_institution_id: s.creator,
    created_at: daysAgo(90),
  })));

  const programsWithRows = programs.filter((p) => enrolments.some((e) => e.program.id === p.id && e.status !== "PassedOut"));
  const batchMeta = programsWithRows.map((p) => {
    const rows = enrolments.filter((e) => e.program.id === p.id && e.status !== "PassedOut");
    const firstCreated = rows.reduce((min, e) => (e.createdAt < min ? e.createdAt : min), rows[0]!.createdAt);
    return { program: p, rows, createdAt: firstCreated };
  });
  await upsert("upload_batches", batchMeta.map(({ program, rows, createdAt }) => ({
    id: programBatchId(program),
    institution_id: program.instId,
    program_id: program.id,
    file_name: `${program.code.toLowerCase()}_${ACADEMIC_YEAR}.csv`,
    row_count: rows.length,
    error_count: 0,
    warning_count: rows.filter((e) => e.validation === "Flagged").length,
    status: "Submitted",
    submitted_by: userIds.get(`admin.${program.instCode}`),
    created_at: createdAt,
    seeded: true,
  })));

  await upsert("enrolments", enrolments.map((e) => ({
    id: e.id,
    student_id: e.student.id,
    institution_id: e.program.instId,
    program_id: e.program.id,
    admission_date: e.admissionDate,
    quota_type: e.quota,
    admission_category: e.category,
    counselling_allotment_no: e.allotment,
    fee_status: e.fee,
    enrolment_status: e.status,
    validation_status: e.student.person.apaar === "900000000002" ? "Revoked" : e.validation,
    upload_batch_id: e.status === "PassedOut" ? null : programBatchId(e.program),
    created_at: e.createdAt,
  })));

  // ---------- Planted issues, alerts, matches, clusters ----------
  const deccanCse = programOf("deccan", "CSE");
  const vindhyaCse = programOf("vindhya", "CSE");
  const konkanCse = programOf("konkan", "CSE");
  const sabarmatiCse = programOf("sabarmati", "CSE");
  const genericWarnings = [
    { rule: "AGE_OUT_OF_RANGE", message: "Age at admission is outside the usual range for this program. Please confirm the date of birth." },
    { rule: "ELIGIBILITY_NO_DATA", message: "No verified qualifying marks were found for this student yet." },
    { rule: "NATIONALITY_MISMATCH", message: "Nationality and category flags do not agree. Please check them." },
  ];
  const issueRows: Row[] = enrolments
    .filter((e) => e.validation === "Flagged" && e.status === "Active" && e !== kabirSecond && e !== vindhyaNoAllotment && !ghostMembers.includes(e))
    .map((e, i) => {
      const w = genericWarnings[i % genericWarnings.length]!;
      return {
        id: uid("issue", e.id, w.rule),
        institution_id: e.program.instId,
        batch_id: programBatchId(e.program),
        enrolment_id: e.id,
        row_number: i + 2,
        rule_code: w.rule,
        severity: "Warning",
        message: w.message,
        created_at: e.createdAt,
      };
    });
  issueRows.push(
    {
      id: uid("issue", kabirSecond.id, "CROSS_INST_DUP"),
      institution_id: sabarmatiCse.instId,
      batch_id: programBatchId(sabarmatiCse),
      enrolment_id: kabirSecond.id,
      row_number: 7,
      rule_code: "CROSS_INST_DUP",
      severity: "Warning",
      message: "Possible existing enrolment elsewhere. Please contact AICTE.",
      created_at: daysAgo(6),
    },
    {
      id: uid("issue", vindhyaNoAllotment.id, "QUOTA_NO_ALLOTMENT"),
      institution_id: vindhyaCse.instId,
      batch_id: programBatchId(vindhyaCse),
      enrolment_id: vindhyaNoAllotment.id,
      row_number: 12,
      rule_code: "QUOTA_NO_ALLOTMENT",
      severity: "Error",
      message: "This Convenor seat has no counselling allotment number.",
      created_at: daysAgo(9),
    },
    {
      id: uid("issue", vindhyaCse.id, "OVER_QUOTA"),
      institution_id: vindhyaCse.instId,
      batch_id: programBatchId(vindhyaCse),
      row_number: 34,
      rule_code: "OVER_QUOTA",
      severity: "Error",
      message: "Non-Convenor seats are over the allowed 15: 21 admitted.",
      created_at: daysAgo(9),
    },
    {
      id: uid("issue", konkanCse.id, "OVER_INTAKE"),
      institution_id: konkanCse.instId,
      batch_id: programBatchId(konkanCse),
      row_number: 31,
      rule_code: "OVER_INTAKE",
      severity: "Error",
      message: "Regular admissions are over the approved intake of 30: 33 admitted.",
      created_at: daysAgo(14),
    },
  );
  await upsert("validation_issues", issueRows.map((r) => ({ suggestion: null, ...r, seeded: true })));

  await upsert("cross_matches", [{ id: uid("cross", kabirSecond.student.hash), apaar_hash: kabirSecond.student.hash, enrolment_a: kabirFirst.id, enrolment_b: kabirSecond.id, status: "Open", created_at: daysAgo(6), seeded: true }]);

  const ghostCounts = new Map<string, number>();
  ghostMembers.forEach((e) => ghostCounts.set(e.student.mobile, (ghostCounts.get(e.student.mobile) ?? 0) + 1));
  const gangaId = uid("institution", "ganga");
  await upsert("fraud_clusters", [...ghostCounts].map(([mobile, count]) => ({
    id: uid("cluster", "SHARED_MOBILE", hmacMatch(mobile)),
    cluster_type: "SHARED_MOBILE",
    key_hash: hmacMatch(mobile),
    member_count: count,
    institution_id: gangaId,
    explanation: `${count} students at one college list the same mobile number, which is unusual and worth a review.`,
    status: "Open",
    created_at: daysAgo(3),
    member_ids: ghostMembers.filter((e) => e.student.mobile === mobile).map((e) => e.student.id),
    explained_by: null,
    seeded: true,
  })));

  await upsert("alerts", ([
    { id: uid("alert", "CROSS_INST_DUP", kabirSecond.id), code: "CROSS_INST_DUP", severity: "Warning", institution_id: sabarmatiCse.instId, program_id: sabarmatiCse.id, title: "Same student active at two institutions", message: "One APAAR ID has overlapping full-time enrolments in Karnataka and Gujarat.", meta: { states: ["Karnataka", "Gujarat"] }, created_at: daysAgo(6) },
    { id: uid("alert", "OVER_QUOTA", vindhyaCse.id), code: "OVER_QUOTA", severity: "Error", institution_id: vindhyaCse.instId, program_id: vindhyaCse.id, title: "Non-Convenor seats over limit", message: "Vindhya College of Engineering admitted 21 Non-Convenor students against 15 allowed.", meta: { allowed: 15, enrolled: 21 }, created_at: daysAgo(9) },
    { id: uid("alert", "QUOTA_NO_ALLOTMENT", vindhyaCse.id), code: "QUOTA_NO_ALLOTMENT", severity: "Error", institution_id: vindhyaCse.instId, program_id: vindhyaCse.id, title: "Convenor seat without allotment", message: "A Convenor admission has no counselling allotment number.", meta: { count: 1 }, created_at: daysAgo(9) },
    { id: uid("alert", "OVER_INTAKE", konkanCse.id), code: "OVER_INTAKE", severity: "Error", institution_id: konkanCse.instId, program_id: konkanCse.id, title: "Admissions over approved intake", message: "Konkan Engineering College admitted 33 students against an approved intake of 30.", meta: { approved: 30, enrolled: 33 }, created_at: daysAgo(14) },
    { id: uid("alert", "SHARED_MOBILE", gangaId), code: "SHARED_MOBILE", severity: "Warning", institution_id: gangaId, program_id: null, title: "Ghost student pattern", message: "40 students at Ganga Valley Institute of Technology share 3 mobile numbers.", meta: { members: 40, numbers: 3 }, created_at: daysAgo(3) },
  ] as Row[]).map((a) => ({ ...a, seeded: true })));

  // ---------- University results ----------
  const resultCohort = studentList.filter((s) => s.cohort2024).slice(0, RESULTS_STUDENT_TARGET);
  const universityOf = (s: StudentSeed) => {
    const inst = instById.get(s.creator)!;
    return inst.university_id;
  };
  const planFixed: Record<string, { sem: number; pct: number; status: "Pass" | "Detained" }[]> = {
    "900000000004": [{ sem: 4, pct: 54, status: "Pass" }],
    "900000000006": [{ sem: 4, pct: 31, status: "Detained" }],
  };
  type ResultRow = { university_id: string; apaar_hash: string; semester: number; percentage: number; sgpa: number; result_status: string };
  const results: ResultRow[] = [];
  const pushResult = (s: { hash: string }, university: string, semester: number, pct: number, status: string) => {
    results.push({
      university_id: university,
      apaar_hash: s.hash,
      semester,
      percentage: pct,
      sgpa: Number((pct / 9.5).toFixed(2)),
      result_status: status,
    });
  };
  studentList.forEach((s) => pushResult(s, universityOf(s), 0, s.marks, "Pass"));
  const uploadHashes = uploadPeople.map((p) => ({ person: p, hash: hmacMatch(p.apaar) }));
  const jntuId = uid("university", "jntuh");
  uploadHashes.forEach((u, i) => pushResult(u, jntuId, 0, 58 + (i % 35), "Pass"));
  resultCohort.forEach((s) => {
    const fixed = planFixed[s.person.apaar];
    for (let sem = 1; sem <= 4; sem++) {
      const override = fixed?.find((x) => x.sem === sem);
      if (override) {
        pushResult(s, universityOf(s), sem, override.pct, override.status);
        continue;
      }
      const roll = f.number.float();
      const status = roll < 0.015 ? "Fail" : roll < 0.02 ? "Detained" : "Pass";
      const pct = status === "Pass" ? f.number.float({ min: 50, max: 94, fractionDigits: 2 }) : f.number.float({ min: 20, max: 39, fractionDigits: 2 });
      pushResult(s, universityOf(s), sem, pct, status);
    }
  });

  const batchKey = (r: ResultRow) => `${r.university_id}:${r.semester}`;
  const grouped = new Map<string, ResultRow[]>();
  results.forEach((r) => grouped.set(batchKey(r), [...(grouped.get(batchKey(r)) ?? []), r]));
  const resultBatches: Row[] = [];
  const resultRows: Row[] = [];
  for (const [key, rows] of grouped) {
    const [university, semester] = key.split(":");
    const batchId = uid("result-batch", key);
    const sorted = [...rows].sort((a, b) => a.apaar_hash.localeCompare(b.apaar_hash));
    const digest = sha256Hex(canonicalJSON(sorted));
    const signature = signPayload({ digest, university, semester: Number(semester) });
    resultBatches.push({
      id: batchId,
      university_id: university,
      file_name: Number(semester) === 0 ? "qualifying_marks.csv" : `semester_${semester}_results.csv`,
      semester: Number(semester),
      row_count: rows.length,
      digest,
      signature,
      submitted_by: userIds.get(`admin.${UNIVERSITIES.find((u) => uid("university", u.code) === university)?.code}`),
      created_at: daysAgo(70 - Number(semester) * 10),
      seeded: true,
    });
    rows.forEach((r) => resultRows.push({ ...r, id: uid("result", r.university_id, r.apaar_hash, r.semester), batch_id: batchId, batch_signature: signature }));
  }
  await upsert("university_result_batches", resultBatches);
  await upsert("university_results", resultRows);

  // ---------- Credentials ----------
  const verified = enrolments.filter((e) => e.validation === "Verified" && e.status === "Active");
  const recordIdOf = (e: EnrolmentSeed) => {
    if (e.student.person.apaar === "900000000001") return "SUTRA-DEMO-VALID";
    if (e.student.person.apaar === "900000000002") return "SUTRA-DEMO-REVOKED";
    return `SUTRA-${sha256Hex(e.id).slice(0, 10).toUpperCase()}`;
  };
  const issued = verified.map((e) => {
    const inst = instById.get(e.program.instId)!;
    const year = Number(e.admissionDate.slice(0, 4));
    const completion = year + e.program.duration;
    const issuedAt = new Date(new Date(e.createdAt).getTime() + DAY).toISOString();
    const expiresAt = `${completion}-07-31T00:00:00.000Z`;
    const vc = issueCredential({
      recordId: recordIdOf(e),
      apaarId: e.student.person.apaar,
      apaarHash: e.student.hash,
      institution: inst.name,
      program: e.program.name,
      admissionYear: year,
      expectedCompletion: completion,
      status: "Active",
      issuedAt,
      expiresAt,
      baseUrl: publicUrl,
    });
    return { enrolment: e, vc, recordId: recordIdOf(e), issuedAt, expiresAt };
  });
  const revokedReason = "Record withdrawn by the institution after re-verification.";
  await upsert("credentials", issued.map(({ enrolment, vc, recordId, issuedAt, expiresAt }) => ({
    id: uid("credential", recordId),
    record_id: recordId,
    enrolment_id: enrolment.id,
    payload: vc,
    signature: vc.proof.signatureValue,
    issued_at: issuedAt,
    expires_at: expiresAt,
    status: recordId === "SUTRA-DEMO-REVOKED" ? "Revoked" : "Valid",
    revoked_reason: recordId === "SUTRA-DEMO-REVOKED" ? revokedReason : null,
    created_at: issuedAt,
    seeded: true,
  })));
  await upsert("revocations", [{ id: uid("revocation", "SUTRA-DEMO-REVOKED"), record_id: "SUTRA-DEMO-REVOKED", reason: revokedReason, revoked_by: admin2Id, at: daysAgo(11), created_at: daysAgo(11) }]);

  // ---------- Consent, access and scholarship history ----------
  const studentOf = (apaar: string) => students.get(apaar)!;
  const navayuga = uid("verifier", "navayuga");
  const council = uid("verifier", "council");
  const days7 = (from: number) => new Date(REF_DATE.getTime() - from * DAY + 7 * DAY).toISOString();
  await upsert("consents", ([
    { id: uid("consent", "ananya-pending"), student_id: studentOf("900000000001").id, grantee_type: "verifier_org", grantee_id: navayuga, purpose: "Pre-employment verification", scope: ["institution", "program", "years", "status"], created_at: daysAgo(1) },
    { id: uid("consent", "priya-pending"), student_id: studentOf("900000000003").id, grantee_type: "verifier_org", grantee_id: navayuga, purpose: "Campus hiring verification", scope: ["institution", "program", "years", "status"], created_at: daysAgo(2) },
    { id: uid("consent", "divya-approved"), student_id: studentOf("900000000009").id, grantee_type: "verifier_org", grantee_id: navayuga, purpose: "Pre-employment verification", scope: ["institution", "program", "years", "status"], approved_at: daysAgo(5), consumed_at: daysAgo(5), expires_at: days7(5), created_at: daysAgo(5) },
    { id: uid("consent", "divya-council"), student_id: studentOf("900000000009").id, grantee_type: "verifier_org", grantee_id: council, purpose: "Regulatory inspection", scope: ["institution", "program", "years", "status", "quota"], approved_at: daysAgo(20), revoked_at: daysAgo(18), expires_at: days7(20), created_at: daysAgo(20) },
    { id: uid("consent", "sneha-portal"), student_id: studentOf("900000000005").id, grantee_type: "scholarship_portal", grantee_id: portalId, purpose: "Scholarship verification", scope: ["enrolment_status", "program", "institution", "latest_semester", "result_status", "aggregate_pct"], approved_at: daysAgo(4), expires_at: days7(4), created_at: daysAgo(4) },
  ] as Row[]).map((r) => ({ approved_at: null, consumed_at: null, revoked_at: null, expires_at: null, ...r, seeded: true })));
  await upsert("access_log", ([
    { id: uid("access", "divya-1"), who: userIds.get("verifier.navayuga"), grantee: "Navayuga Software Services", student_id: studentOf("900000000009").id, fields_returned: ["institution", "program", "years", "status"], purpose: "Pre-employment verification", at: daysAgo(5), created_at: daysAgo(5) },
    { id: uid("access", "divya-2"), who: userIds.get("verifier.council"), grantee: "National Technical Standards Council", student_id: studentOf("900000000009").id, fields_returned: ["institution", "program", "years", "status", "quota"], purpose: "Regulatory inspection", at: daysAgo(19), created_at: daysAgo(19) },
    { id: uid("access", "sneha-1"), who: userIds.get("portal.epass"), grantee: "Simulated ePASS-style Portal", student_id: studentOf("900000000005").id, fields_returned: ["enrolment_status", "program", "institution", "latest_semester", "result_status", "aggregate_pct"], purpose: "Scholarship verification", at: daysAgo(4), created_at: daysAgo(4) },
  ] as Row[]).map((r) => ({ ...r, seeded: true })));
  await upsert("scholarship_requests", ([
    { id: uid("scholarship", "sneha"), portal_id: portalId, apaar_hash: studentOf("900000000005").hash, scheme: "Technical Education Fee Reimbursement", status: "Fulfilled", result: { verified: true, enrolment_status: "Active", latest_semester: 4, result_status: "Pass" }, created_at: daysAgo(4) },
    { id: uid("scholarship", "meera"), portal_id: portalId, apaar_hash: studentOf("900000000007").hash, scheme: "Post-Matric Merit Scholarship", status: "Fulfilled", result: { verified: true, enrolment_status: "Active", latest_semester: 4, result_status: "Pass" }, created_at: daysAgo(12) },
    { id: uid("scholarship", "vikram"), portal_id: portalId, apaar_hash: studentOf("900000000006").hash, scheme: "Post-Matric Merit Scholarship", status: "Denied", denial_reason: "Student detained in Sem 4", created_at: daysAgo(8) },
  ] as Row[]).map((r) => ({ denial_reason: null, result: null, ...r, seeded: true })));
  await upsert("simulated_sms", [{ id: uid("sms", "welcome-1"), student_id: studentOf("900000000001").id, message: "Sutra: your enrolment record has been verified.", created_at: daysAgo(10) }]);

  // Deccan's webhook points at the app's own demo sink, so scenario 1 shows a real signed delivery.
  await upsert("webhooks", [{ id: uid("webhook", "deccan"), owner_id: deccanCse.instId, url: `${baseUrl}/api/demo/webhook-sink`, events: ["over_intake", "over_quota", "cross_match", "marks_mismatch", "credential_revoked"], secret_enc: encryptField(sha256Hex(uid("webhook-secret", "deccan"))), seeded: true }]);
  await upsert("approvals", [{ id: uid("approval", "intake-demo"), action_type: "CHANGE_INTAKE", payload: { program_id: programOf("kaveri", "CSE").id, program_name: "B.Tech Computer Science & Engineering (CSE)", institution: "Kaveri College of Engineering", new_intake: 40, reason: "Additional lab capacity inspected and approved." }, requested_by: adminId, status: "Pending", approved_by: null, created_at: daysAgo(2), seeded: true }]);

  // ---------- Scholarship API key: printed once, only when first created ----------
  const { data: existingKey } = await db.from("api_keys").select("id").eq("portal_id", portalId).maybeSingle();
  if (!existingKey) {
    const key = `sutra_portal_${randomBytes(24).toString("hex")}`;
    const { error } = await db.from("api_keys").insert({ portal_id: portalId, name: "ePASS demo", key_prefix: key.slice(0, 18), key_hash: sha256Hex(key), scopes: ["scholarship:verify"] });
    if (error) throw new Error(`Could not create the portal API key: ${error.message}`);
    // Only the hash is stored in the database, so /portal-demo reads the key back from .env.local.
    appendFileSync(ENV_PATH, `SCHOLARSHIP_PORTAL_API_KEY=${key}\n`);
    console.log(`\n  Scholarship portal API key (shown once, also saved to .env.local): ${key}\n`);
  }

  // ---------- Audit chain: append-only, so it is written only once ----------
  const { count: alreadySeeded } = await db.from("v_audit_chain").select("seq", { head: true, count: "exact" }).eq("action", "seed.complete");
  if (!alreadySeeded) {
    const events: AuditEvent[] = [];
    batchMeta.forEach(({ program, rows, createdAt }) => {
      const actorId = userIds.get(`admin.${program.instCode}`);
      const batchId = programBatchId(program);
      events.push({ actorId, actorRole: "institution_admin", action: "auth.login", entity: "session", entityId: actorId, at: new Date(new Date(createdAt).getTime() - 600_000).toISOString() });
      events.push({ actorId, actorRole: "institution_admin", action: "upload.submit", entity: "upload_batch", entityId: batchId, meta: { rows: rows.length }, at: createdAt });
      events.push({ actorId, actorRole: "institution_admin", action: "validation.outcome", entity: "upload_batch", entityId: batchId, meta: { rows: rows.length, warnings: rows.filter((e) => e.validation === "Flagged").length, errors: 0 }, at: new Date(new Date(createdAt).getTime() + 2000).toISOString() });
    });
    issued.slice(0, 120).forEach(({ recordId, issuedAt }) => {
      events.push({ actorId: adminId, actorRole: "aicte_admin", action: "credential.issue", entity: "credential", entityId: recordId, meta: {}, at: issuedAt });
    });
    VERIFIER_ORGS.filter((o) => o.status === "Approved").forEach((o, i) => {
      events.push({ actorId: admin2Id, actorRole: "aicte_admin", action: "verifier.approve", entity: "verifier_org", entityId: uid("verifier", o.code), meta: { maker_checker: true }, at: daysAgo(80 - i) });
    });
    events.push({ actorId: admin2Id, actorRole: "aicte_admin", action: "credential.revoke", entity: "credential", entityId: "SUTRA-DEMO-REVOKED", meta: { maker_checker: true }, at: daysAgo(11) });
    events.push({ actorRole: "system", action: "alert.raise", entity: "alert", entityId: "OVER_INTAKE", meta: { rule_code: "OVER_INTAKE" }, at: daysAgo(14) });
    events.push({ actorRole: "system", action: "alert.raise", entity: "alert", entityId: "OVER_QUOTA", meta: { rule_code: "OVER_QUOTA" }, at: daysAgo(9) });
    events.push({ actorRole: "system", action: "alert.raise", entity: "alert", entityId: "CROSS_INST_DUP", meta: { rule_code: "CROSS_INST_DUP" }, at: daysAgo(6) });
    events.sort((a, b) => a.at!.localeCompare(b.at!));
    for (const event of events) await appendAudit(db, event);

    const { data: head, error: headError } = await db.from("v_audit_chain").select("seq, hash").order("seq", { ascending: false }).limit(1).single();
    if (headError) throw new Error(`Could not read the audit head: ${headError.message}`);
    const anchorDate = daysAgo(1).slice(0, 10);
    const anchor = { date: anchorDate, last_seq: head.seq, last_hash: head.hash };
    await upsert("audit_anchors", [{ id: uid("anchor", "seed"), ...anchor, signature: signPayload(anchor) }]);
    await appendAudit(db, { actorRole: "system", action: "seed.complete", entity: "seed", entityId: "2026", meta: { entries: events.length } });
    console.log(`• audit_log: ${events.length + 1} entries, 1 anchor`);
  } else {
    console.log("• audit_log: already seeded, left untouched (append-only)");
  }

  // ---------- Demo files ----------
  writeDemoFiles({
    deccanCseStudents: enrolmentsOf("deccan:CSE").filter((e) => e.status === "Active"),
    existingStudent: demoPeople[0]!,
    uploadPeople,
    validCredential: issued.find((c) => c.recordId === "SUTRA-DEMO-VALID")!.vc,
    f,
  });

  const active = enrolments.filter((e) => e.status === "Active").length;
  console.log(`\n✔ Seed complete: ${studentList.length} students, ${enrolments.length} enrolments (${active} active), ${programs.length} programs.`);
}

interface DemoFileInput {
  deccanCseStudents: { student: { person: { apaar: string } } }[];
  existingStudent: { apaar: string; name: string; dob: string; gender: string };
  uploadPeople: { apaar: string; name: string; dob: string; gender: string }[];
  validCredential: unknown;
  f: typeof fakerEN_IN;
}

const CSV_COLUMNS = [
  "apaar_id", "name", "dob", "gender", "nationality", "admission_date", "admission_category", "quota_type",
  "counselling_allotment_no", "is_nri", "oci_status", "is_foreign_national", "passport_no", "mobile", "email", "address",
  "prev_qualification", "prev_marks_pct", "prev_pass_year", "fee_status", "enrolment_status",
] as const;
type CsvRow = Record<(typeof CSV_COLUMNS)[number], string>;

function toCsv(columns: readonly string[], rows: Record<string, string>[]): string {
  const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [columns.join(","), ...rows.map((r) => columns.map((c) => cell(r[c] ?? "")).join(","))].join("\n") + "\n";
}

const isoToDmy = (iso: string) => iso.split("-").reverse().join("/");

function writeDemoFiles({ deccanCseStudents, existingStudent, uploadPeople, validCredential, f }: DemoFileInput) {
  const dir = join(ROOT, "demo-files");
  mkdirSync(dir, { recursive: true });

  // Everyone in the demo files is within the usual age range, so "clean" really means no issues.
  const eligible = uploadPeople.filter((p) => p.dob >= "2001-01-01");
  if (eligible.length < 132) throw new Error(`Only ${eligible.length} eligible people for the demo files`);

  const baseRow = (p: DemoFileInput["uploadPeople"][number], i: number, quota: "CONVENOR" | "NON_CONVENOR"): CsvRow => ({
    apaar_id: p.apaar,
    name: p.name,
    dob: p.dob,
    gender: p.gender,
    nationality: "Indian",
    admission_date: `2026-08-${String((i % 27) + 1).padStart(2, "0")}`,
    admission_category: "Regular",
    quota_type: quota,
    counselling_allotment_no: quota === "CONVENOR" ? `CNV-2026-${String(500000 + i)}` : "",
    is_nri: "false",
    oci_status: "none",
    is_foreign_national: "false",
    passport_no: "",
    mobile: `9${String(810000000 + i * 7919).slice(0, 9)}`,
    email: `${p.name.toLowerCase().replace(/[^a-z]+/g, ".")}.u${i}@example.com`,
    address: `${10 + i} Demo Street, Hyderabad`,
    prev_qualification: "Class 12",
    prev_marks_pct: String(58 + (i % 35)),
    prev_pass_year: "2026",
    fee_status: "Paid",
    enrolment_status: "Active",
  });

  const cleanPeople = eligible.slice(0, 12);
  writeFileSync(join(dir, "clean_upload.csv"), toCsv(CSV_COLUMNS, cleanPeople.map((p, i) => baseRow(p, i, i < 8 ? "CONVENOR" : "NON_CONVENOR"))));

  // 8 clean rows + 100 rows with exactly 3 auto-fixable defects + 12 rows needing a person to decide.
  const messy: CsvRow[] = [];
  const messyPeople = eligible.slice(12);
  let cursor = 0;
  const nextMessy = () => messyPeople[cursor++]!;
  // Deccan CSE has one NRI and one lateral seat free, so these 8 rows take it from 58 to 60 and then go over.
  for (let i = 0; i < 8; i++) {
    const row = baseRow(nextMessy(), 100 + i, "CONVENOR");
    if (i === 0) Object.assign(row, { quota_type: "NRI", counselling_allotment_no: "", is_nri: "true", passport_no: "P7654321" });
    if (i === 1) Object.assign(row, { quota_type: "LATERAL", admission_category: "Lateral", counselling_allotment_no: "", prev_qualification: "Diploma" });
    messy.push(row);
  }

  const scrambleName = (name: string) => `  ${name.toUpperCase()} `;
  const typoDob = (dob: string) => `${Number(dob.slice(0, 4)) - 2}${dob.slice(4)}`;
  const fixers: ((r: CsvRow) => void)[] = [
    (r) => { r.admission_date = isoToDmy(r.admission_date); },
    (r) => { r.dob = isoToDmy(r.dob); },
    (r) => { r.name = scrambleName(r.name); },
    (r) => { r.mobile = `+91-${r.mobile.slice(0, 5)} ${r.mobile.slice(5)}`; },
    (r) => { r.dob = typoDob(r.dob); },
    (r) => { r.email = ` ${r.email.toUpperCase()} `; },
  ];
  for (let i = 0; i < 100; i++) {
    const row = baseRow(nextMessy(), 200 + i, i % 3 === 0 ? "NON_CONVENOR" : "CONVENOR");
    // Two general defects plus exactly one date-of-birth defect, since the two DOB fixers would collide.
    const picks: number[] = [...f.helpers.arrayElements([0, 2, 3, 5], 2), i % 2 === 0 ? 1 : 4];
    picks.forEach((p) => fixers[p]!(row));
    messy.push(row);
  }

  const unfixable: ((r: CsvRow) => void)[] = [
    (r) => { r.apaar_id = ""; },
    (r) => { r.apaar_id = r.apaar_id.slice(0, 11); },
    (r) => { r.apaar_id = "111122223333"; },
    (r) => { r.apaar_id = messy[0]!.apaar_id; },
    (r) => { r.name = "Completely Different Person"; },
    (r) => { r.name = '=HYPERLINK("https://example.com","click")'; },
    (r) => { r.quota_type = "CONVENOR"; r.counselling_allotment_no = ""; },
    (r) => { r.quota_type = "NRI"; r.is_nri = "true"; r.passport_no = ""; },
    (r) => { r.quota_type = "SUPERNUMERARY"; r.admission_category = "Supernumerary"; },
    (r) => { r.admission_date = "1990-06-01"; },
    (r) => { r.prev_pass_year = "2029"; },
    (r) => { r.apaar_id = existingStudent.apaar; r.name = existingStudent.name; r.dob = existingStudent.dob; r.gender = existingStudent.gender; },
  ];
  unfixable.forEach((mutate, i) => {
    const row = baseRow(nextMessy(), 400 + i, "NON_CONVENOR");
    mutate(row);
    messy.push(row);
  });
  writeFileSync(join(dir, "messy_upload.csv"), toCsv(CSV_COLUMNS, messy));

  const results = deccanCseStudents.map((e) => e.student.person.apaar).sort().map((apaar, i) => ({
    apaar_id: apaar,
    semester: "5",
    percentage: String(60 + (i % 30)),
    sgpa: ((60 + (i % 30)) / 9.5).toFixed(2),
    result_status: "Pass",
  }));
  writeFileSync(join(dir, "university_results.csv"), toCsv(["apaar_id", "semester", "percentage", "sgpa", "result_status"], results));

  writeFileSync(join(dir, "valid_credential.json"), `${JSON.stringify(validCredential, null, 2)}\n`);
  // Keeps the real signature and changes exactly one letter, so verification must report TAMPERED.
  const forged = structuredClone(validCredential) as { credentialSubject: { institution: string } };
  forged.credentialSubject.institution = `${forged.credentialSubject.institution.slice(0, -1)}x`;
  writeFileSync(join(dir, "forged_credential.json"), `${JSON.stringify(forged, null, 2)}\n`);
  console.log("• demo-files: clean_upload.csv, messy_upload.csv, university_results.csv, valid_credential.json, forged_credential.json");
}

runScript(main);
