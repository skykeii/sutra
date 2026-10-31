import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { fetchAll } from "@/lib/db";

type Row = Record<string, string | number | null>;

export interface QueryResult {
  columns: { key: string; header: string }[];
  rows: Row[];
  chart?: { x: string; y: string };
}

const paramsSchema = z.object({
  state: z.string().max(40).optional(),
  level: z.enum(["UG", "PG", "Diploma", "PGDM"]).optional(),
  program: z.string().max(60).optional(),
  limit: z.number().int().min(1).max(50).optional(),
}).strict();
export type QueryParams = z.infer<typeof paramsSchema>;
export { paramsSchema };

export interface CatalogEntry {
  id: string;
  title: string;
  description: string;
  example: string;
  keywords: string[];
  params: (keyof QueryParams)[];
  run: (admin: SupabaseClient, p: QueryParams) => Promise<QueryResult>;
}

const col = (key: string, header: string) => ({ key, header });
const like = (v: string) => `%${v.replace(/[%_,()]/g, "")}%`;

async function intake(admin: SupabaseClient, p: QueryParams) {
  let q = admin.from("v_intake_status").select("*");
  if (p.state) q = q.eq("state", p.state);
  if (p.level) q = q.eq("level", p.level);
  if (p.program) q = q.ilike("program_name", like(p.program));
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

function tally<T>(items: T[], key: (item: T) => string): Map<string, number> {
  const out = new Map<string, number>();
  items.forEach((i) => out.set(key(i), (out.get(key(i)) ?? 0) + 1));
  return out;
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

// The only queries Ask the Data can run. Each returns aggregates or institution-level rows, never student rows.
export const CATALOG: CatalogEntry[] = [
  {
    id: "over_intake",
    title: "Programs over approved intake",
    description: "Programs with more regular admissions than approved. Optional state, level, program.",
    example: "Which institutions are over intake in Maharashtra?",
    keywords: ["over intake", "over-intake", "excess", "exceed", "over approved", "more than approved"],
    params: ["state", "level", "program"],
    run: async (admin, p) => {
      const rows = (await intake(admin, p)).filter((r) => r.enrolled_regular > r.approved).map((r) => ({ institution: r.institution_name, program: r.program_name, state: r.state, approved: r.approved, enrolled: r.enrolled_regular }));
      return { columns: [col("institution", "Institution"), col("program", "Program"), col("state", "State"), col("approved", "Approved"), col("enrolled", "Enrolled")], rows };
    },
  },
  {
    id: "category_by_state",
    title: "NRI, OCI and foreign national students by state",
    description: "Counts of NRI, OCI and foreign national active students per state. Optional state.",
    example: "How many NRI and foreign national students are there by state?",
    keywords: ["nri", "oci", "foreign", "category", "overseas"],
    params: ["state"],
    run: async (admin, p) => {
      let q = admin.from("v_category_summary").select("*").order("state");
      if (p.state) q = q.eq("state", p.state);
      const { data } = await q;
      return { columns: [col("state", "State"), col("nri", "NRI"), col("oci", "OCI"), col("foreign_national", "Foreign national")], rows: (data ?? []).map((r) => ({ state: r.state, nri: r.nri, oci: r.oci, foreign_national: r.foreign_national })), chart: { x: "state", y: "nri" } };
    },
  },
  {
    id: "fill_by_program",
    title: "Fill rate by program",
    description: "Share of approved seats filled, grouped by program name. Optional state, level, program.",
    example: "What is the fill rate by program?",
    keywords: ["fill rate by program", "program fill", "filled by program", "seats by program"],
    params: ["state", "level", "program"],
    run: async (admin, p) => {
      const map = new Map<string, { approved: number; enrolled: number }>();
      for (const r of await intake(admin, p)) {
        const e = map.get(r.program_name) ?? { approved: 0, enrolled: 0 };
        e.approved += r.approved;
        e.enrolled += r.enrolled_regular;
        map.set(r.program_name, e);
      }
      const rows = [...map].map(([program, e]) => ({ program, approved: e.approved, enrolled: e.enrolled, fill_pct: pct(e.enrolled, e.approved) })).sort((a, b) => b.fill_pct - a.fill_pct);
      return { columns: [col("program", "Program"), col("approved", "Approved"), col("enrolled", "Enrolled"), col("fill_pct", "Filled %")], rows, chart: { x: "program", y: "fill_pct" } };
    },
  },
  {
    id: "fill_by_state",
    title: "Fill rate by state",
    description: "Share of approved seats filled in each state.",
    example: "Which state has the highest fill rate?",
    keywords: ["fill rate by state", "state fill", "fill rate", "fill", "seats filled", "highest fill", "lowest fill"],
    params: [],
    run: async (admin) => {
      const { data } = await admin.from("v_state_summary").select("state, approved, enrolled_regular, fill_pct").order("fill_pct", { ascending: false });
      return { columns: [col("state", "State"), col("approved", "Approved"), col("enrolled_regular", "Enrolled"), col("fill_pct", "Filled %")], rows: (data ?? []).filter((r) => r.approved > 0), chart: { x: "state", y: "fill_pct" } };
    },
  },
  {
    id: "cross_duplicates_count",
    title: "Cross-institution duplicates",
    description: "How many students are active at two institutions, open and resolved.",
    example: "How many cross-institution duplicates are open?",
    keywords: ["cross", "duplicate", "two institutions", "two colleges", "double enrol", "same student"],
    params: [],
    run: async (admin) => {
      const { data } = await admin.from("cross_matches").select("status");
      return { columns: [col("status", "Status"), col("count", "Students")], rows: [...tally(data ?? [], (r) => r.status)].map(([status, count]) => ({ status, count })) };
    },
  },
  {
    id: "quota_violations",
    title: "Quota violations",
    description: "Quotas admitted beyond their seat matrix limit. Optional state.",
    example: "Show quota violations",
    keywords: ["quota", "convenor", "non-convenor", "seat matrix", "management seat"],
    params: ["state", "program"],
    run: async (admin, p) => {
      const { data: institutions } = await admin.from("institutions").select("id, name, state");
      const byId = new Map((institutions ?? []).map((i) => [i.id, i]));
      let q = admin.from("v_quota_status").select("*").eq("over_quota", true);
      if (p.program) q = q.ilike("program_name", like(p.program));
      const { data } = await q;
      const rows = (data ?? []).filter((r) => !p.state || byId.get(r.institution_id)?.state === p.state).map((r) => ({ institution: byId.get(r.institution_id)?.name ?? "", program: r.program_name, quota: r.quota_type, allowed: r.seats_allowed, admitted: r.enrolled }));
      return { columns: [col("institution", "Institution"), col("program", "Program"), col("quota", "Quota"), col("allowed", "Allowed"), col("admitted", "Admitted")], rows };
    },
  },
  {
    id: "submission_status",
    title: "Submission status",
    description: "Which institutions have or have not submitted. Optional state.",
    example: "Which institutions have not submitted?",
    keywords: ["submit", "submitted", "submission", "not reported", "reporting", "non-compliance", "compliance"],
    params: ["state"],
    run: async (admin, p) => {
      let q = admin.from("v_submission_status").select("institution_name, state, batches_submitted, has_submitted").order("has_submitted").order("institution_name");
      if (p.state) q = q.eq("state", p.state);
      const { data } = await q;
      return { columns: [col("institution", "Institution"), col("state", "State"), col("batches", "Batches"), col("status", "Status")], rows: (data ?? []).map((r) => ({ institution: r.institution_name, state: r.state, batches: r.batches_submitted, status: r.has_submitted ? "Submitted" : "Not submitted" })) };
    },
  },
  {
    id: "marks_mismatches",
    title: "Marks mismatches",
    description: "Marksheet checks by outcome: Match, Mismatch and NotFound.",
    example: "How many marks mismatches have been found?",
    keywords: ["marks", "marksheet", "mismatch", "claimed"],
    params: [],
    run: async (admin) => {
      const { data } = await admin.from("marksheet_submissions").select("outcome");
      return { columns: [col("outcome", "Outcome"), col("count", "Checks")], rows: [...tally(data ?? [], (r) => r.outcome)].map(([outcome, count]) => ({ outcome, count })) };
    },
  },
  {
    id: "scholarship_denials",
    title: "Scholarship denials by reason",
    description: "Scholarship requests denied, grouped by reason.",
    example: "Why were scholarships denied?",
    keywords: ["scholarship", "denied", "denial", "epass", "ineligible"],
    params: [],
    run: async (admin) => {
      const { data } = await admin.from("scholarship_requests").select("denial_reason").eq("status", "Denied");
      return { columns: [col("reason", "Reason"), col("count", "Requests")], rows: [...tally(data ?? [], (r) => r.denial_reason ?? "Not stated")].map(([reason, count]) => ({ reason, count })), chart: { x: "reason", y: "count" } };
    },
  },
  {
    id: "top_programs",
    title: "Top programs by enrolment",
    description: "Programs with the most active regular students. Optional state, level, limit.",
    example: "What are the top programs by enrolment?",
    keywords: ["top program", "largest program", "most students", "most popular", "biggest program", "by enrolment"],
    params: ["state", "level", "limit"],
    run: async (admin, p) => {
      const map = new Map<string, number>();
      for (const r of await intake(admin, p)) map.set(r.program_name, (map.get(r.program_name) ?? 0) + r.enrolled_regular);
      const rows = [...map].map(([program, enrolled]) => ({ program, enrolled })).sort((a, b) => b.enrolled - a.enrolled).slice(0, p.limit ?? 10);
      return { columns: [col("program", "Program"), col("enrolled", "Enrolled")], rows, chart: { x: "program", y: "enrolled" } };
    },
  },
  {
    id: "alerts_by_type",
    title: "Open alerts by type",
    description: "Counts of open alerts, by alert code.",
    example: "How many open alerts are there by type?",
    keywords: ["alert", "alerts", "warnings raised"],
    params: [],
    run: async (admin) => {
      const { data } = await admin.from("alerts").select("code").eq("status", "Open");
      return { columns: [col("code", "Alert type"), col("count", "Open")], rows: [...tally(data ?? [], (r) => r.code)].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count), chart: { x: "code", y: "count" } };
    },
  },
  {
    id: "fraud_by_type",
    title: "Fraud patterns by type",
    description: "Open fraud clusters and the students involved, by pattern type.",
    example: "How many ghost student clusters are open?",
    keywords: ["fraud", "ghost", "cluster", "suspicious", "shared mobile", "pattern"],
    params: [],
    run: async (admin) => {
      const { data } = await admin.from("fraud_clusters").select("cluster_type, member_count").in("status", ["Open", "Under review"]);
      const map = new Map<string, { clusters: number; students: number }>();
      for (const c of data ?? []) {
        const e = map.get(c.cluster_type) ?? { clusters: 0, students: 0 };
        e.clusters += 1;
        e.students += c.member_count;
        map.set(c.cluster_type, e);
      }
      return { columns: [col("type", "Pattern"), col("clusters", "Clusters"), col("students", "Students")], rows: [...map].map(([type, e]) => ({ type, ...e })) };
    },
  },
  {
    id: "verified_by_state",
    title: "Verified records by state",
    description: "Active verified records in each state. Optional state.",
    example: "How many verified records are there in each state?",
    keywords: ["verified", "verified record", "credentials issued"],
    params: ["state"],
    run: async (admin, p) => {
      const rows = await fetchAll<{ institutions: { state: string } }>((from, to) => {
        let q = admin.from("enrolments").select("institutions!inner(state)").eq("validation_status", "Verified").eq("enrolment_status", "Active");
        if (p.state) q = q.eq("institutions.state", p.state);
        return q.range(from, to) as unknown as PromiseLike<{ data: { institutions: { state: string } }[] | null; error: { message: string } | null }>;
      });
      return { columns: [col("state", "State"), col("count", "Verified records")], rows: [...tally(rows, (r) => r.institutions.state)].map(([state, count]) => ({ state, count })).sort((a, b) => b.count - a.count), chart: { x: "state", y: "count" } };
    },
  },
  {
    id: "revoked_credentials",
    title: "Revoked credentials",
    description: "Revoked credentials, grouped by reason.",
    example: "How many credentials have been revoked?",
    keywords: ["revoked", "revocation", "revoke"],
    params: [],
    run: async (admin) => {
      const { data } = await admin.from("revocations").select("reason");
      return { columns: [col("reason", "Reason"), col("count", "Credentials")], rows: [...tally(data ?? [], (r) => r.reason)].map(([reason, count]) => ({ reason, count })) };
    },
  },
  {
    id: "institutions_by_state",
    title: "Institutions and seats by state",
    description: "Number of institutions, approved seats and open alerts in each state.",
    example: "How many institutions are in each state?",
    keywords: ["institutions in", "how many institutions", "colleges in", "how many colleges", "institutions by state"],
    params: [],
    run: async (admin) => {
      const { data } = await admin.from("v_state_summary").select("state, institutions, approved, open_alerts").order("institutions", { ascending: false });
      return { columns: [col("state", "State"), col("institutions", "Institutions"), col("approved", "Approved seats"), col("open_alerts", "Open alerts")], rows: data ?? [], chart: { x: "state", y: "institutions" } };
    },
  },
];

export const CATALOG_BY_ID = new Map(CATALOG.map((c) => [c.id, c]));
export const STATES = ["Telangana", "Karnataka", "Maharashtra", "Tamil Nadu", "Delhi", "Uttar Pradesh", "Gujarat", "Rajasthan", "West Bengal", "Kerala"];
