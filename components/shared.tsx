import { Download, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<string, "green" | "amber" | "red" | "grey" | "blue"> = {
  Verified: "green", Clean: "green", Valid: "green", Approved: "green", Pass: "green", Match: "green", Fulfilled: "green", Submitted: "green", Active: "green", Resolved: "green", Cleared: "green", ConsentGranted: "green", Paid: "green", delivered: "green",
  Flagged: "amber", Warning: "amber", Partial: "amber", Pending: "grey", "Under review": "amber", Acknowledged: "amber", applied: "amber", Withdrawn: "grey", Preview: "grey", PassedOut: "blue", Info: "blue", Simulated: "blue",
  Error: "red", Revoked: "red", Rejected: "red", Denied: "red", Fail: "red", Detained: "red", Mismatch: "red", Open: "red", Escalated: "red", NotFound: "amber", failed: "red", Expired: "grey",
};
const TONE_CLASS = {
  green: "bg-emerald-100 text-emerald-900",
  amber: "bg-amber-100 text-amber-900",
  red: "bg-red-100 text-red-900",
  grey: "bg-slate-200 text-slate-800",
  blue: "bg-blue-100 text-blue-900",
};

export function StatusBadge({ status, title }: { status: string; title?: string }) {
  return <span title={title} className={cn("inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold", TONE_CLASS[STATUS_TONE[status] ?? "grey"])}>{status}</span>;
}

export function SimulatedChip({ label = "Simulated" }: { label?: string }) {
  return <span className="inline-block rounded-full border border-blue-300 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-900">{label}</span>;
}

export function KpiCard({ label, value, hint, icon: Icon, tone }: { label: string; value: ReactNode; hint?: string; icon?: LucideIcon; tone?: "red" | "green" | "amber" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">{label}</p>
          {Icon && <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />}
        </div>
        <p className={cn("mt-1 text-2xl font-semibold", tone === "red" && "text-red-700", tone === "green" && "text-emerald-700", tone === "amber" && "text-amber-700")}>{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  align?: "right";
  help?: string;
}

export function DataTable<T>({ columns, rows, rowKey, empty, caption }: { columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string; empty?: ReactNode; caption?: string }) {
  if (!rows.length) return <EmptyState>{empty ?? "Nothing to show yet."}</EmptyState>;
  return (
    <div className="overflow-x-auto rounded-md border bg-card">
      <table className="w-full text-left text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" title={c.help} className={cn("whitespace-nowrap px-3 py-2 font-semibold", c.align === "right" && "text-right")}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-t">
              {columns.map((c) => (
                <td key={c.key} className={cn("px-3 py-2 align-top", c.align === "right" && "text-right tabular-nums")}>
                  {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">{children}</div>;
}

export interface FilterField {
  name: string;
  label: string;
  options?: { value: string; label: string }[];
  placeholder?: string;
}

/** A plain GET form: filters live in the URL, so they work without client state and can be shared. */
export function FilterBar({ fields, values, action }: { fields: FilterField[]; values: Record<string, string | undefined>; action: string }) {
  return (
    <form method="get" action={action} className="flex flex-wrap items-end gap-3 rounded-md border bg-card p-3">
      {fields.map((f) => (
        <label key={f.name} className="flex flex-col gap-1 text-xs font-medium">
          {f.label}
          {f.options ? (
            <select name={f.name} defaultValue={values[f.name] ?? ""} className="h-9 min-w-32 rounded-md border border-input bg-card px-2 text-sm font-normal">
              <option value="">All</option>
              {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : (
            <input name={f.name} defaultValue={values[f.name] ?? ""} placeholder={f.placeholder} className="h-9 rounded-md border border-input bg-card px-2 text-sm font-normal" />
          )}
        </label>
      ))}
      <Button type="submit" size="sm" className="h-9">Apply</Button>
      <Button asChild variant="ghost" size="sm" className="h-9"><Link href={action}>Clear</Link></Button>
    </form>
  );
}

export function ExportMenu({ template, query, formats = ["pdf", "xlsx", "csv"] }: { template: string; query?: Record<string, string | undefined>; formats?: string[] }) {
  const params = new URLSearchParams(Object.entries(query ?? {}).filter((e): e is [string, string] => !!e[1]));
  return (
    <div className="flex flex-wrap gap-2">
      {formats.map((format) => {
        params.set("format", format);
        return (
          <Button key={format} asChild variant="outline" size="sm">
            <a href={`/api/app/reports/${template}?${params}`}><Download className="h-3.5 w-3.5" aria-hidden />{format.toUpperCase()}</a>
          </Button>
        );
      })}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Section({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <Card className="min-w-0">
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function Pager({ page, hasNext, path, query }: { page: number; hasNext: boolean; path: string; query?: Record<string, string | undefined> }) {
  const href = (p: number) => {
    const params = new URLSearchParams(Object.entries(query ?? {}).filter((e): e is [string, string] => !!e[1]));
    params.set("page", String(p));
    return `${path}?${params}`;
  };
  if (page <= 1 && !hasNext) return null;
  return (
    <div className="mt-3 flex items-center justify-end gap-2 text-sm">
      {page > 1 && <Button asChild variant="outline" size="sm"><Link href={href(page - 1)}>Previous</Link></Button>}
      <span className="text-muted-foreground">Page {page}</span>
      {hasNext && <Button asChild variant="outline" size="sm"><Link href={href(page + 1)}>Next</Link></Button>}
    </div>
  );
}

export function Meter({ value, max, label, tone }: { value: number; max: number; label?: string; tone?: "red" | "amber" | "green" }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  const auto = tone ?? (value > max ? "red" : pct >= 95 ? "amber" : "green");
  return (
    <div>
      {label && <div className="mb-1 flex justify-between gap-2 text-sm"><span>{label}</span><span className="font-medium tabular-nums">{value} / {max}</span></div>}
      <div role="meter" aria-valuenow={value} aria-valuemax={max} aria-valuemin={0} aria-label={label} className="h-2.5 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", auto === "red" && "bg-red-600", auto === "amber" && "bg-amber-500", auto === "green" && "bg-emerald-600")} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}

export function PipelineStepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex flex-wrap gap-2 text-sm">
      {steps.map((s, i) => (
        <li key={s} className={cn("rounded-md border px-3 py-1.5", i < current && "border-emerald-300 bg-emerald-50 text-emerald-900", i === current && "border-saffron bg-saffron/10 font-medium", i > current && "text-muted-foreground")}>
          {i < current ? "✓ " : ""}{s}
        </li>
      ))}
    </ol>
  );
}

export const firstParam = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
export const fmtDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "");
export const fmtDateTime = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "");
