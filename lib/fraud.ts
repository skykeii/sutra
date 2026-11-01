import type { SupabaseClient } from "@supabase/supabase-js";
import { activeProvider, callModel } from "@/lib/ai/provider";
import { appendAudit } from "@/lib/audit";
import { sha256Hex } from "@/lib/crypto";
import { fetchAll } from "@/lib/db";

export type ClusterType = "SHARED_MOBILE" | "SHARED_EMAIL" | "SHARED_ADDRESS" | "MULTI_FULLTIME" | "CATEGORY_SPIKE" | "ADMISSION_SURGE";

export interface DetectedCluster {
  cluster_type: ClusterType;
  key_hash: string;
  member_count: number;
  institution_id: string | null;
  member_ids: string[];
  facts: Record<string, string | number>;
}

export interface FraudInput {
  students: { id: string; mobile_hash: string | null; email_hash: string | null; address_hash: string | null }[];
  enrolments: { student_id: string; institution_id: string; program_id: string; quota_type: string; admission_date: string }[];
  programs: { id: string; name: string; approved_intake: number; state: string; institution_id: string }[];
  crossMatches: { apaar_hash: string; students: string[]; institutions: string[] }[];
}

const THRESHOLDS = { mobile: 5, email: 3, address: 8, spikeMultiple: 3, surgeShare: 0.6, surgeDays: 2 };

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Pure: takes only hashes, ids and counts, so it can be tested and can never leak contact details. */
export function detectClusters(input: FraudInput): DetectedCluster[] {
  const out: DetectedCluster[] = [];
  const institutionOf = new Map(input.enrolments.map((e) => [e.student_id, e.institution_id]));
  const activeIds = new Set(input.enrolments.map((e) => e.student_id));

  const shared = (field: "mobile_hash" | "email_hash" | "address_hash", type: ClusterType, min: number, label: string) => {
    const groups = new Map<string, string[]>();
    for (const s of input.students) {
      const key = s[field];
      if (key && activeIds.has(s.id)) groups.set(key, [...(groups.get(key) ?? []), s.id]);
    }
    for (const [key, members] of groups) {
      if (members.length < min) continue;
      const counts = new Map<string, number>();
      members.forEach((m) => counts.set(institutionOf.get(m)!, (counts.get(institutionOf.get(m)!) ?? 0) + 1));
      const institution = [...counts].sort((a, b) => b[1] - a[1])[0]![0];
      out.push({ cluster_type: type, key_hash: key, member_count: members.length, institution_id: institution, member_ids: members, facts: { what: label, students: members.length, institutions: counts.size } });
    }
  };
  shared("mobile_hash", "SHARED_MOBILE", THRESHOLDS.mobile, "the same mobile number");
  shared("email_hash", "SHARED_EMAIL", THRESHOLDS.email, "the same email address");
  shared("address_hash", "SHARED_ADDRESS", THRESHOLDS.address, "the same address");

  for (const match of input.crossMatches) {
    out.push({ cluster_type: "MULTI_FULLTIME", key_hash: match.apaar_hash, member_count: match.students.length, institution_id: null, member_ids: match.students, facts: { what: "active full-time enrolment at two institutions", students: match.students.length, institutions: new Set(match.institutions).size } });
  }

  const byProgram = new Map<string, FraudInput["enrolments"]>();
  input.enrolments.forEach((e) => byProgram.set(e.program_id, [...(byProgram.get(e.program_id) ?? []), e]));

  const nriShare = (p: FraudInput["programs"][number]) => {
    const list = byProgram.get(p.id) ?? [];
    return list.length ? list.filter((e) => e.quota_type === "NRI").length / list.length : 0;
  };
  for (const p of input.programs) {
    const statePeers = input.programs.filter((o) => o.id !== p.id && o.name === p.name && o.state === p.state && byProgram.has(o.id));
    const peers = statePeers.length >= 3 ? statePeers : input.programs.filter((o) => o.id !== p.id && o.name === p.name && byProgram.has(o.id));
    if (peers.length < 3 || !byProgram.has(p.id)) continue;
    const peerMedian = median(peers.map(nriShare));
    const share = nriShare(p);
    if (peerMedian > 0 && share > THRESHOLDS.spikeMultiple * peerMedian) {
      const members = (byProgram.get(p.id) ?? []).filter((e) => e.quota_type === "NRI").map((e) => e.student_id);
      out.push({ cluster_type: "CATEGORY_SPIKE", key_hash: sha256Hex(`spike:${p.id}`), member_count: members.length, institution_id: p.institution_id, member_ids: members, facts: { what: "an NRI share far above similar programs", share_pct: Math.round(share * 100), peer_median_pct: Math.round(peerMedian * 100) } });
    }
  }

  for (const p of input.programs) {
    const list = byProgram.get(p.id) ?? [];
    if (!list.length) continue;
    const latest = list.reduce((max, e) => (e.admission_date > max ? e.admission_date : max), list[0]!.admission_date);
    const cutoff = new Date(new Date(`${latest}T00:00:00Z`).getTime() - THRESHOLDS.surgeDays * 86_400_000).toISOString().slice(0, 10);
    const late = list.filter((e) => e.admission_date > cutoff);
    if (late.length / p.approved_intake > THRESHOLDS.surgeShare) {
      out.push({ cluster_type: "ADMISSION_SURGE", key_hash: sha256Hex(`surge:${p.id}`), member_count: late.length, institution_id: p.institution_id, member_ids: late.map((e) => e.student_id), facts: { what: "a last-minute admission surge", share_pct: Math.round((late.length / p.approved_intake) * 100), days: THRESHOLDS.surgeDays } });
    }
  }
  return out;
}

export function templateExplanation(c: DetectedCluster): string {
  const f = c.facts;
  switch (c.cluster_type) {
    case "CATEGORY_SPIKE": return `${f.share_pct}% of this program's students are in the NRI quota, against ${f.peer_median_pct}% in similar programs. This may be fine, but it is worth a look.`;
    case "ADMISSION_SURGE": return `${f.share_pct}% of this program's approved seats were admitted in the final ${f.days} days before submission, which is unusual.`;
    case "MULTI_FULLTIME": return `${c.member_count === 1 ? "One student appears" : `${c.member_count} students appear`} as active full-time at ${f.institutions} institutions at once. A person can normally hold only one such seat.`;
    default: return `${f.students} students at ${f.institutions === 1 ? "one college" : `${f.institutions} colleges`} list ${f.what}, which is unusual and worth a review.`;
  }
}

async function explain(admin: SupabaseClient, c: DetectedCluster): Promise<string | null> {
  return callModel(admin, {
    templateId: "fraud.explain.v1",
    system: "Explain in one or two plain sentences why this pattern deserves a human review. It is a lead, not proof of fraud. Use only the counts provided.",
    user: JSON.stringify({ pattern: c.cluster_type, ...c.facts }),
    maxTokens: 500,
  });
}

export async function runDetection(admin: SupabaseClient, actor: { id: string; role: string }): Promise<{ clusters: number; byType: Record<string, number> }> {
  const [students, enrolments, programs, matches] = await Promise.all([
    fetchAll<FraudInput["students"][number]>((from, to) => admin.from("students").select("id, mobile_hash, email_hash, address_hash").range(from, to)),
    fetchAll<FraudInput["enrolments"][number]>((from, to) => admin.from("enrolments").select("student_id, institution_id, program_id, quota_type, admission_date").eq("enrolment_status", "Active").range(from, to)),
    admin.from("programs").select("id, name, approved_intake, institution_id, institutions(state)"),
    admin.from("cross_matches").select("apaar_hash, a:enrolments!cross_matches_enrolment_a_fkey(student_id, institution_id), b:enrolments!cross_matches_enrolment_b_fkey(institution_id)").eq("status", "Open"),
  ]);
  const clusters = detectClusters({
    students,
    enrolments,
    programs: (programs.data ?? []).map((p) => ({ id: p.id, name: p.name, approved_intake: p.approved_intake, institution_id: p.institution_id, state: (p.institutions as unknown as { state: string }).state })),
    crossMatches: (matches.data ?? []).map((m) => {
      const a = m.a as unknown as { student_id: string; institution_id: string };
      const b = m.b as unknown as { institution_id: string };
      return { apaar_hash: m.apaar_hash, students: [a.student_id], institutions: [a.institution_id, b.institution_id] };
    }),
  });
  const byType: Record<string, number> = {};
  const provider = activeProvider();
  // After one failure the rest use templates, so a provider outage cannot stall the button.
  let modelUp = provider !== "none";
  for (const c of clusters) {
    byType[c.cluster_type] = (byType[c.cluster_type] ?? 0) + 1;
    // Status stays out of the upsert, so a re-run never reopens a case someone has reviewed.
    const ai = modelUp ? await explain(admin, c) : null;
    if (!ai) modelUp = false;
    const { error } = await admin.from("fraud_clusters").upsert({ cluster_type: c.cluster_type, key_hash: c.key_hash, member_count: c.member_count, institution_id: c.institution_id, member_ids: c.member_ids, explanation: ai ?? templateExplanation(c), explained_by: ai ? provider : null }, { onConflict: "cluster_type,key_hash" });
    if (error) throw new Error(error.message);
  }
  await appendAudit(admin, { actorId: actor.id, actorRole: actor.role, action: "fraud.detect", entity: "fraud_cluster", meta: { clusters: clusters.length, by_type: byType } });
  return { clusters: clusters.length, byType };
}
