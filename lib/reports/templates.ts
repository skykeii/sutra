import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/db";

export interface ReportFilters {
  state?: string;
  year?: string;
  program?: string;
  institution?: string;
}

export interface ReportColumn {
  key: string;
  header: string;
  width?: number;
}

type Row = Record<string, unknown>;

export interface ReportTemplate {
  id: string;
  title: string;
  description: string;
  aicteOnly?: boolean;
  columns: ReportColumn[];
  rows: (admin: SupabaseClient, f: ReportFilters) => Promise<Row[]>;
}

async function intakeRows(admin: SupabaseClient, f: ReportFilters) {
  let q = admin.from("v_intake_status").select("*");
  if (f.institution) q = q.eq("institution_id", f.institution);
  if (f.state) q = q.eq("state", f.state);
  if (f.year) q = q.eq("academic_year", f.year);
  if (f.program) q = q.ilike("program_name", `%${f.program.replace(/[%_,()]/g, "")}%`);
  const { data, error } = await q.order("institution_name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

interface EnrolmentJoin { institution_id: string; created_at: string; quota_type: string; students: { is_nri: boolean; oci_status: string; is_foreign_national: boolean }; institutions: { name: string; state: string } }

async function activeEnrolments(admin: SupabaseClient, f: ReportFilters): Promise<EnrolmentJoin[]> {
  const rows = await fetchAll<EnrolmentJoin>((from, to) => {
    let q = admin.from("enrolments").select("institution_id, created_at, quota_type, students(is_nri, oci_status, is_foreign_national), institutions!inner(name, state)").eq("enrolment_status", "Active");
    if (f.institution) q = q.eq("institution_id", f.institution);
    if (f.state) q = q.eq("institutions.state", f.state);
    return q.range(from, to) as unknown as PromiseLike<{ data: EnrolmentJoin[] | null; error: { message: string } | null }>;
  });
  return rows;
}

export const REPORTS: ReportTemplate[] = [
  {
    id: "institution-enrolment",
    title: "Institution-wise enrolment",
    description: "Approved seats against actual admissions, for each program.",
    columns: [{ key: "institution_name", header: "Institution", width: 3 }, { key: "state", header: "State" }, { key: "program_name", header: "Program", width: 3 }, { key: "academic_year", header: "Year" }, { key: "approved", header: "Approved" }, { key: "enrolled_regular", header: "Enrolled" }, { key: "enrolled_supernumerary", header: "Supernumerary" }, { key: "fill_pct", header: "Filled %" }],
    rows: (admin, f) => intakeRows(admin, f),
  },
  {
    id: "over-intake",
    title: "Over-intake",
    description: "Programs with more regular admissions than AICTE approved, and attempts that were blocked.",
    columns: [{ key: "institution", header: "Institution", width: 3 }, { key: "program", header: "Program", width: 3 }, { key: "approved", header: "Approved" }, { key: "enrolled", header: "Enrolled" }, { key: "blocked", header: "Blocked attempts" }],
    rows: async (admin, f) => {
      const intake = await intakeRows(admin, f);
      const { data: alerts } = await admin.from("alerts").select("program_id, meta").eq("code", "OVER_INTAKE");
      const blocked = new Map<string, number>();
      (alerts ?? []).forEach((a) => blocked.set(a.program_id, (blocked.get(a.program_id) ?? 0) + Number((a.meta as Row).rows_blocked ?? 0)));
      return intake.filter((r) => r.enrolled_regular > r.approved || blocked.has(r.program_id)).map((r) => ({ institution: r.institution_name, program: r.program_name, approved: r.approved, enrolled: r.enrolled_regular, blocked: blocked.get(r.program_id) ?? 0 }));
    },
  },
  {
    id: "category",
    title: "NRI, OCI and foreign national students",
    description: "Active students by category, for each institution.",
    columns: [{ key: "institution", header: "Institution", width: 3 }, { key: "state", header: "State" }, { key: "nri", header: "NRI" }, { key: "oci", header: "OCI" }, { key: "foreign_national", header: "Foreign national" }, { key: "total", header: "All active" }],
    rows: async (admin, f) => {
      const map = new Map<string, { institution: string; state: string; nri: number; oci: number; foreign_national: number; total: number }>();
      for (const e of await activeEnrolments(admin, f)) {
        const r = map.get(e.institution_id) ?? { institution: e.institutions.name, state: e.institutions.state, nri: 0, oci: 0, foreign_national: 0, total: 0 };
        r.total += 1;
        if (e.students.is_nri) r.nri += 1;
        if (e.students.oci_status === "holder") r.oci += 1;
        if (e.students.is_foreign_national) r.foreign_national += 1;
        map.set(e.institution_id, r);
      }
      return [...map.values()].sort((a, b) => a.institution.localeCompare(b.institution));
    },
  },
  {
    id: "state-trend",
    title: "State-wise trend",
    description: "Records added each week, by state.",
    columns: [{ key: "state", header: "State", width: 2 }, { key: "week", header: "Week starting" }, { key: "records", header: "Records added" }],
    rows: async (admin, f) => {
      const map = new Map<string, { state: string; week: string; records: number }>();
      for (const e of await activeEnrolments(admin, f)) {
        const d = new Date(e.created_at);
        d.setUTCDate(d.getUTCDate() - d.getUTCDay());
        const week = d.toISOString().slice(0, 10);
        const key = `${e.institutions.state}${week}`;
        const r = map.get(key) ?? { state: e.institutions.state, week, records: 0 };
        r.records += 1;
        map.set(key, r);
      }
      return [...map.values()].sort((a, b) => a.state.localeCompare(b.state) || a.week.localeCompare(b.week));
    },
  },
  {
    id: "submission",
    title: "Submission and non-compliance",
    description: "Who has submitted data and who has not.",
    columns: [{ key: "institution_name", header: "Institution", width: 3 }, { key: "state", header: "State" }, { key: "programs", header: "Programs" }, { key: "batches_submitted", header: "Batches" }, { key: "active_enrolments", header: "Active students" }, { key: "last", header: "Last submitted", width: 2 }, { key: "status", header: "Status" }],
    rows: async (admin, f) => {
      let q = admin.from("v_submission_status").select("*");
      if (f.institution) q = q.eq("institution_id", f.institution);
      if (f.state) q = q.eq("state", f.state);
      const { data } = await q.order("has_submitted").order("institution_name");
      return (data ?? []).map((r) => ({ ...r, last: r.last_submitted_at?.slice(0, 10) ?? "Not yet", status: r.has_submitted ? "Submitted" : "Not submitted" }));
    },
  },
  {
    id: "quota-audit",
    title: "Quota audit (convenor and non-convenor)",
    description: "Seats allowed against admitted, for every quota in every program.",
    columns: [{ key: "institution", header: "Institution", width: 3 }, { key: "state", header: "State" }, { key: "program_name", header: "Program", width: 3 }, { key: "quota_type", header: "Quota", width: 1.4 }, { key: "seats_allowed", header: "Allowed" }, { key: "enrolled", header: "Admitted" }, { key: "status", header: "Status" }],
    rows: async (admin, f) => {
      const { data: institutions } = await admin.from("institutions").select("id, name, state");
      const byId = new Map((institutions ?? []).map((i) => [i.id, i]));
      let q = admin.from("v_quota_status").select("*");
      if (f.institution) q = q.eq("institution_id", f.institution);
      if (f.program) q = q.ilike("program_name", `%${f.program.replace(/[%_,()]/g, "")}%`);
      const { data } = await q;
      return (data ?? [])
        .filter((r) => !f.state || byId.get(r.institution_id)?.state === f.state)
        .map((r) => ({ ...r, institution: byId.get(r.institution_id)?.name, state: byId.get(r.institution_id)?.state, status: r.over_quota ? "Over limit" : "Within limit" }))
        .sort((a, b) => Number(b.over_quota) - Number(a.over_quota) || String(a.institution).localeCompare(String(b.institution)));
    },
  },
  {
    id: "cross-duplicates",
    title: "Cross-institution duplicates",
    description: "Students active at two institutions, identified by keyed hash.",
    aicteOnly: true,
    columns: [{ key: "key", header: "Student key" }, { key: "a", header: "Enrolled at", width: 3 }, { key: "b", header: "Also enrolled at", width: 3 }, { key: "status", header: "Status" }],
    rows: async (admin) => {
      const { data } = await admin.from("cross_matches").select("apaar_hash, status, a:enrolments!cross_matches_enrolment_a_fkey(institutions(name)), b:enrolments!cross_matches_enrolment_b_fkey(institutions(name))");
      const name = (v: unknown) => (v as { institutions: { name: string } }).institutions.name;
      return (data ?? []).map((m) => ({ key: `${m.apaar_hash.slice(0, 12)}...`, a: name(m.a), b: name(m.b), status: m.status }));
    },
  },
  {
    id: "scholarship-mismatches",
    title: "Scholarship and eligibility mismatches",
    description: "Marks mismatches and scholarship denials, as counts per institution.",
    columns: [{ key: "institution", header: "Institution", width: 3 }, { key: "marks_mismatches", header: "Marks mismatches" }, { key: "scholarship_denials", header: "Scholarship denials" }, { key: "duplicate_claims", header: "Duplicate claims" }],
    rows: async (admin, f) => {
      const { data } = await admin.from("alerts").select("code, institution_id, institutions(name)").in("code", ["MARKS_MISMATCH", "SCHOLARSHIP_INELIGIBLE", "SCHOLARSHIP_DUP_CLAIM"]);
      const map = new Map<string, { institution: string; marks_mismatches: number; scholarship_denials: number; duplicate_claims: number }>();
      for (const a of data ?? []) {
        if (f.institution && a.institution_id !== f.institution) continue;
        const key = a.institution_id ?? "none";
        const r = map.get(key) ?? { institution: (a.institutions as unknown as { name: string } | null)?.name ?? "Across institutions", marks_mismatches: 0, scholarship_denials: 0, duplicate_claims: 0 };
        if (a.code === "MARKS_MISMATCH") r.marks_mismatches += 1;
        if (a.code === "SCHOLARSHIP_INELIGIBLE") r.scholarship_denials += 1;
        if (a.code === "SCHOLARSHIP_DUP_CLAIM") r.duplicate_claims += 1;
        map.set(key, r);
      }
      return [...map.values()];
    },
  },
  {
    id: "audit-log",
    title: "Audit log",
    description: "Audit trail export with hashes.",
    aicteOnly: true,
    columns: [{ key: "seq", header: "Seq" }, { key: "at", header: "When", width: 2 }, { key: "actor_role", header: "Actor" }, { key: "action", header: "Action" }, { key: "entity", header: "Entity" }, { key: "entity_id", header: "Entity ID", width: 2 }, { key: "prev_hash", header: "Previous hash", width: 3 }, { key: "hash", header: "Hash", width: 3 }],
    rows: (admin) => fetchAll<Row>((from, to) => admin.from("audit_log").select("seq, at, actor_role, action, entity, entity_id, prev_hash, hash").order("seq").range(from, to)),
  },
];

export const REPORT_BY_ID = new Map(REPORTS.map((r) => [r.id, r]));
