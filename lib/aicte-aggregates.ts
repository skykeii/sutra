import "server-only";
import { unstable_cache } from "next/cache";
import { AICTE_AGGREGATES_TAG } from "@/lib/cache-tags";
import { createAdminSupabase } from "@/lib/supabase/admin";

// National totals, identical for every AICTE user, so one shared entry is safe.
// Callers must already have checked for an AICTE role. Alerts are deliberately not cached here.
export const getAicteAggregates = unstable_cache(
  async () => {
    const admin = createAdminSupabase();
    const [states, intake, quotas, categories, submissions, matches, credentials, clusters, students, enrolTrend, alertTrend] = await Promise.all([
      admin.from("v_state_summary").select("*").order("state"),
      admin.from("v_intake_status").select("*"),
      admin.from("v_quota_status").select("program_id, quota_type, enrolled"),
      admin.from("v_category_summary").select("*").order("state"),
      admin.from("v_submission_status").select("*").order("institution_name"),
      admin.from("cross_matches").select("id", { head: true, count: "exact" }).eq("status", "Open"),
      admin.from("credentials").select("id", { head: true, count: "exact" }).eq("status", "Valid"),
      admin.from("fraud_clusters").select("id", { head: true, count: "exact" }).in("status", ["Open", "Under review"]),
      admin.from("students").select("id", { head: true, count: "exact" }),
      admin.from("v_enrolment_trend").select("*").order("day"),
      admin.from("v_alert_trend").select("*").order("day"),
    ]);
    return {
      states: states.data ?? [],
      intake: intake.data ?? [],
      quotas: quotas.data ?? [],
      categories: categories.data ?? [],
      submissions: submissions.data ?? [],
      matches: matches.count ?? 0,
      credentials: credentials.count ?? 0,
      clusters: clusters.count ?? 0,
      students: students.count ?? 0,
      enrolTrend: enrolTrend.data ?? [],
      alertTrend: alertTrend.data ?? [],
    };
  },
  ["aicte-aggregates-v1"],
  { revalidate: 30, tags: [AICTE_AGGREGATES_TAG] },
);
