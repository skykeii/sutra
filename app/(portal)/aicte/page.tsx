import { AlertTriangle, BadgeCheck, Building2, GitCompare, MessageCircleQuestion, ScanSearch, Users, Waypoints } from "lucide-react";
import Link from "next/link";
import type { StateMetric } from "@/components/charts";
import { CategoryChart, IndiaTileMap, TrendChart } from "@/components/charts-lazy";
import { LiveAlertFeed, LiveRefresh, type FeedAlert } from "@/components/live";
import { DataTable, FilterBar, firstParam, fmtDateTime, KpiCard, PageHeader, Section, StatusBadge } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { getAicteAggregates } from "@/lib/aicte-aggregates";
import { requireRole } from "@/lib/auth/session";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata = { title: "AICTE dashboard" };

interface IntakeRow {
  program_id: string; institution_id: string; institution_name: string; state: string; program_name: string; level: string; academic_year: string;
  approved: number; supernumerary_cap: number; enrolled_regular: number; enrolled_supernumerary: number; fill_pct: number;
}

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole(["aicte_admin", "aicte_officer"]);
  const sp = await searchParams;
  const state = firstParam(sp.state);
  const level = firstParam(sp.level);
  const program = firstParam(sp.program);
  const year = firstParam(sp.year);
  const quota = firstParam(sp.category);
  const supabase = await createServerSupabase();

  // Alerts stay outside the cache, so the count and the feed are always live.
  const [aggregates, alerts] = await Promise.all([
    getAicteAggregates(),
    supabase.from("alerts").select("id, code, severity, title, message, created_at", { count: "exact" }).eq("status", "Open").order("created_at", { ascending: false }).limit(15),
  ]);
  const { states, intake, quotas, categories, submissions, matches, credentials, clusters, students, enrolTrend, alertTrend } = aggregates;

  const all = intake as IntakeRow[];
  const submissionRows = submissions;
  const reporting = submissionRows.filter((s) => s.has_submitted).length;
  const approved = all.reduce((sum, r) => sum + r.approved, 0);
  const enrolled = all.reduce((sum, r) => sum + r.enrolled_regular, 0);

  const quotaCount = new Map(quotas.filter((q) => q.quota_type === quota).map((q) => [q.program_id, q.enrolled as number]));
  const filtered = all.filter((r) => (!state || r.state === state) && (!level || r.level === level) && (!year || r.academic_year === year) && (!program || r.program_name.toLowerCase().includes(program.toLowerCase())));
  const leagueMap = new Map<string, { id: string; name: string; state: string; approved: number; enrolled: number; supernumerary: number; over: number }>();
  for (const r of filtered) {
    const e = leagueMap.get(r.institution_id) ?? { id: r.institution_id, name: r.institution_name, state: r.state, approved: 0, enrolled: 0, supernumerary: 0, over: 0 };
    e.approved += r.approved;
    e.enrolled += quota ? quotaCount.get(r.program_id) ?? 0 : r.enrolled_regular;
    e.supernumerary += r.enrolled_supernumerary;
    if (r.enrolled_regular > r.approved) e.over += 1;
    leagueMap.set(r.institution_id, e);
  }
  const league = [...leagueMap.values()].sort((a, b) => b.enrolled / b.approved - a.enrolled / a.approved);
  const over = filtered.filter((r) => r.enrolled_regular > r.approved);
  const days = new Map<string, { day: string; enrolments: number; alerts: number }>();
  enrolTrend.forEach((t) => days.set(t.day, { day: t.day, enrolments: t.enrolments, alerts: 0 }));
  alertTrend.forEach((t) => days.set(t.day, { day: t.day, enrolments: days.get(t.day)?.enrolments ?? 0, alerts: t.alerts }));
  const trend = [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
  const fillPct = approved ? ((enrolled / approved) * 100).toFixed(1) : "0";
  const openAlerts = alerts.count ?? 0;
  const pending = submissionRows.filter((s) => !s.has_submitted);

  return (
    <div className="space-y-5">
      <PageHeader title="National dashboard" description="Live student-level data from approved institutions." actions={<LiveRefresh tables={["enrolments", "alerts", "cross_matches", "fraud_clusters", "upload_batches"]} />} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Institutions reporting" value={`${reporting} / ${submissionRows.length}`} icon={Building2} />
        <KpiCard label="Students recorded" value={students.toLocaleString("en-IN")} icon={Users} />
        <KpiCard label="Seats filled nationally" value={`${fillPct}%`} hint={`${enrolled.toLocaleString("en-IN")} of ${approved.toLocaleString("en-IN")} approved seats`} icon={Waypoints} />
        <KpiCard label="Open alerts" value={openAlerts} tone={openAlerts ? "red" : "green"} icon={AlertTriangle} />
        <KpiCard label="Cross-institution matches" value={matches} hint="One student active at two institutions" tone={matches ? "amber" : "green"} icon={GitCompare} />
        <KpiCard label="Fraud patterns open" value={clusters} tone={clusters ? "amber" : "green"} icon={ScanSearch} />
        <KpiCard label="Verified records" value={credentials.toLocaleString("en-IN")} tone="green" icon={BadgeCheck} />
        <KpiCard label="Over-intake programs" value={all.filter((r) => r.enrolled_regular > r.approved).length} tone={all.some((r) => r.enrolled_regular > r.approved) ? "red" : "green"} icon={AlertTriangle} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_24rem]">
        <Section title="India view" description={state ? `Focused on ${state}.` : "Seats filled or open alerts, by state."} actions={state ? <Button asChild variant="outline" size="sm"><Link href="/aicte">Clear state</Link></Button> : undefined}>
          <IndiaTileMap data={states as StateMetric[]} selected={state} />
        </Section>
        <Section title="Live alert feed" description="New alerts appear here without a refresh.">
          <LiveAlertFeed initial={(alerts.data ?? []) as FeedAlert[]} />
        </Section>
      </div>

      <FilterBar
        action="/aicte"
        values={{ state, level, program, year, category: quota }}
        fields={[
          { name: "state", label: "State", options: states.map((s) => ({ value: s.state, label: s.state })) },
          { name: "level", label: "Level", options: ["UG", "PG", "Diploma", "PGDM"].map((v) => ({ value: v, label: v })) },
          { name: "program", label: "Program", placeholder: "e.g. CSE" },
          { name: "year", label: "Year", options: [...new Set(all.map((r) => r.academic_year))].map((v) => ({ value: v, label: v })) },
          { name: "category", label: "Quota", options: ["CONVENOR", "NON_CONVENOR", "NRI", "LATERAL", "SUPERNUMERARY"].map((v) => ({ value: v, label: v.replace("_", "-") })) },
        ]}
      />

      <Section title="Institution league table" description="Share of approved seats filled, highest first.">
        <DataTable
          rows={league}
          rowKey={(r) => r.id}
          empty="No institutions match these filters."
          columns={[
            { key: "name", header: "Institution", render: (r) => <Link className="font-medium text-primary underline" href={`/aicte/institutions/${r.id}`}>{r.name}</Link> },
            { key: "state", header: "State" },
            { key: "approved", header: "Approved", align: "right", help: "Seats approved by AICTE" },
            { key: "enrolled", header: quota ? "In this quota" : "Enrolled", align: "right" },
            { key: "supernumerary", header: "Supernumerary", align: "right", help: "Seats above the approved intake, for NRI, OCI and foreign national students" },
            { key: "fill", header: "Filled", align: "right", render: (r) => `${((r.enrolled / r.approved) * 100).toFixed(0)}%` },
            { key: "over", header: "Status", render: (r) => <StatusBadge status={r.over ? "Error" : r.enrolled ? "Clean" : "Pending"} title={r.over ? "At least one program is over intake" : undefined} /> },
          ]}
        />
      </Section>

      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Over approved intake" description="Over intake means more regular admissions than the seats AICTE approved.">
          <DataTable
            rows={over}
            rowKey={(r) => r.program_id}
            empty="No program is over its approved intake."
            columns={[
              { key: "institution_name", header: "Institution", render: (r) => <Link className="text-primary underline" href={`/aicte/institutions/${r.institution_id}`}>{r.institution_name}</Link> },
              { key: "program_name", header: "Program" },
              { key: "seats", header: "Seats", align: "right", render: (r) => <span className="font-medium text-red-700">{r.enrolled_regular} / {r.approved}</span> },
            ]}
          />
        </Section>
        <Section title="Submission tracker" description={`${pending.length} institutions have not submitted yet.`}>
          <div className="max-h-80 overflow-auto">
            <DataTable
              rows={[...submissionRows].sort((a, b) => Number(a.has_submitted) - Number(b.has_submitted))}
              rowKey={(r) => r.institution_id}
              columns={[
                { key: "institution_name", header: "Institution" },
                { key: "status", header: "Status", render: (r) => <StatusBadge status={r.has_submitted ? "Submitted" : "Pending"} /> },
                { key: "last", header: "Last submitted", render: (r) => fmtDateTime(r.last_submitted_at) || "Not yet" },
              ]}
            />
          </div>
        </Section>
        <Section title="NRI, OCI and foreign national students"><CategoryChart data={categories} /></Section>
        <Section title="Trend over the last 90 days"><TrendChart data={trend} /></Section>
      </div>

      <Button asChild size="lg" className="fixed bottom-6 right-6 z-40 rounded-full shadow-lg">
        <Link href="/aicte/ask"><MessageCircleQuestion className="h-5 w-5" aria-hidden />Ask the Data</Link>
      </Button>
    </div>
  );
}
