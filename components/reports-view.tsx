import { FileArchive } from "lucide-react";
import { DataTable, ExportMenu, FilterBar, PageHeader, Section, type FilterField } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { REPORTS, type ReportFilters } from "@/lib/reports/templates";
import { createAdminSupabase } from "@/lib/supabase/admin";

export async function ReportsView({ path, filters, isAicte, fields, packInstitution }: { path: string; filters: ReportFilters & { report?: string }; isAicte: boolean; fields: FilterField[]; packInstitution?: string }) {
  const templates = REPORTS.filter((r) => (isAicte || !r.aicteOnly) && r.id !== "audit-log");
  const selected = templates.find((t) => t.id === filters.report) ?? templates[0]!;
  const rows = await selected.rows(createAdminSupabase(), filters);
  const query = { state: filters.state, year: filters.year, program: filters.program, institution: isAicte ? filters.institution : undefined };
  return (
    <div className="space-y-5">
      <PageHeader title="Reports" description="Choose a report, filter it, and export it. Every export is recorded in the audit trail." actions={packInstitution !== undefined && (
        <Button asChild variant={packInstitution ? "default" : "outline"} disabled={!packInstitution}>
          {packInstitution
            ? <a href={`/api/app/reports/pack?institution=${packInstitution}`}><FileArchive className="h-4 w-4" aria-hidden />Accreditation pack</a>
            : <span title="Choose an institution in the filter first"><FileArchive className="h-4 w-4" aria-hidden />Accreditation pack (choose an institution)</span>}
        </Button>
      )} />
      <FilterBar action={path} values={{ ...filters, report: selected.id }} fields={[{ name: "report", label: "Report", options: templates.map((t) => ({ value: t.id, label: t.title })) }, ...fields]} />
      <Section title={selected.title} description={selected.description} actions={<ExportMenu template={selected.id} query={query} />}>
        <DataTable
          rows={rows.slice(0, 50).map((r, i) => ({ ...r, _key: String(i) }))}
          rowKey={(r) => String(r._key)}
          empty="No records match these filters."
          columns={selected.columns.map((c) => ({ key: c.key, header: c.header }))}
        />
        {rows.length > 50 && <p className="mt-2 text-sm text-muted-foreground">Showing the first 50 of {rows.length} rows. Exports include them all.</p>}
      </Section>
    </div>
  );
}
