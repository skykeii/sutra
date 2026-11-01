"use client";

import { Download, RotateCcw, Sparkles, Upload } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { PipelineStepper, StatusBadge } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { applyFix, applySafeFixes, type AppliedFix } from "@/lib/validation/fixes";
import { COLUMN_LABELS, coerceRow, CSV_COLUMNS, MAX_UPLOAD_BYTES, MAX_UPLOAD_ROWS, toCsv, type CsvColumn, type CsvRow } from "@/lib/validation/columns";
import type { Issue, NumberedRow, ValidationStats } from "@/lib/validation/types";
import { cn } from "@/lib/utils";

interface ProgramOption { id: string; name: string; academic_year: string; approved_intake: number }
const PAGE = 50;
const CSV_TYPES = ["text/csv", "application/vnd.ms-excel", "text/plain", ""];
const XLSX_TYPES = ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ""];

async function parseFile(file: File): Promise<CsvRow[]> {
  const isCsv = /\.csv$/i.test(file.name);
  const isXlsx = /\.xlsx$/i.test(file.name);
  if (!isCsv && !isXlsx) throw new Error("Please choose a .csv or .xlsx file.");
  if (!(isCsv ? CSV_TYPES : XLSX_TYPES).includes(file.type)) throw new Error("This file's type does not match its name. Please export it again as .csv or .xlsx.");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("This file is larger than the 5 MB limit.");
  let raw: Record<string, unknown>[];
  if (isCsv) {
    const Papa = (await import("papaparse")).default;
    const parsed = Papa.parse<Record<string, string>>(await file.text(), { header: true, skipEmptyLines: "greedy" });
    raw = parsed.data;
  } else {
    const XLSX = await import("xlsx");
    const book = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
    raw = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]!]!, { defval: "", raw: false });
  }
  if (!raw.length) throw new Error("This file has no student rows.");
  if (raw.length > MAX_UPLOAD_ROWS) throw new Error(`This file has more than ${MAX_UPLOAD_ROWS.toLocaleString("en-IN")} rows.`);
  if (!("apaar_id" in raw[0]!)) throw new Error("The apaar_id column is missing. Please start from the template.");
  return raw.map(coerceRow);
}

export function UploadWizard({ programs }: { programs: ProgramOption[] }) {
  const [step, setStep] = useState(1);
  const [programId, setProgramId] = useState(programs[0]?.id ?? "");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<NumberedRow[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [stats, setStats] = useState<ValidationStats | null>(null);
  const [applied, setApplied] = useState<AppliedFix[]>([]);
  const [undo, setUndo] = useState<{ rows: NumberedRow[]; applied: AppliedFix[] }[]>([]);
  const [updateApaars, setUpdateApaars] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ batchId: string; created: number; updated: number; blocked: number } | null>(null);

  const issuesByRow = useMemo(() => {
    const map = new Map<number, Issue[]>();
    issues.forEach((i) => map.set(i.rowNumber, [...(map.get(i.rowNumber) ?? []), i]));
    return map;
  }, [issues]);
  const visible = useMemo(() => {
    if (!filter) return rows;
    const keep = new Set(issues.filter((i) => (filter === "Error" || filter === "Warning" ? i.severity === filter : i.code === filter)).map((i) => i.rowNumber));
    return rows.filter((r) => keep.has(r.rowNumber));
  }, [rows, issues, filter]);
  const pageRows = visible.slice(page * PAGE, page * PAGE + PAGE);

  const call = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/app/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message ?? "The server could not process this file.");
    return json;
  };
  const plain = (list: NumberedRow[]) => list.map((row) => Object.fromEntries(CSV_COLUMNS.map((c) => [c, row[c]])));

  // setFileName only takes effect on the next render, so a new file's name must be passed in.
  const validate = async (list: NumberedRow[], updates = updateApaars, name = fileName) => {
    setBusy(true);
    setError("");
    try {
      const json = await call({ programId, fileName: name, rows: plain(list), updateApaars: updates });
      setIssues(json.issues);
      setStats(json.stats);
      setStep(3);
      setPage(0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (file: File) => {
    setError("");
    try {
      const parsed = await parseFile(file);
      const numbered = parsed.map((r, i) => ({ ...r, rowNumber: i + 2 }));
      setFileName(file.name);
      setRows(numbered);
      setApplied([]);
      setUndo([]);
      setUpdateApaars([]);
      setFilter("");
      await validate(numbered, [], file.name);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const commitChange = (next: NumberedRow[], fixes: AppliedFix[]) => {
    setUndo((u) => [...u, { rows, applied }]);
    setRows(next);
    setApplied([...applied, ...fixes]);
    void validate(next);
  };
  const applyOne = (issue: Issue) => {
    const r = applyFix(rows, issue);
    if (r.applied) commitChange(r.rows, [r.applied]);
  };
  const applyAll = () => {
    const r = applySafeFixes(rows, issues);
    if (r.applied.length) commitChange(r.rows, r.applied);
  };
  const undoLast = () => {
    const last = undo[undo.length - 1];
    if (!last) return;
    setUndo(undo.slice(0, -1));
    setRows(last.rows);
    setApplied(last.applied);
    void validate(last.rows);
  };
  const editCell = (rowNumber: number, field: CsvColumn, value: string) => {
    const current = rows.find((r) => r.rowNumber === rowNumber);
    if (!current || current[field] === value) return;
    const next = rows.map((r) => (r.rowNumber === rowNumber ? { ...r, [field]: value } : r));
    commitChange(next, [{ rowNumber, field, from: current[field], to: value, code: "MANUAL_EDIT" }]);
  };
  const chooseUpdate = (apaar: string) => {
    const updates = [...updateApaars, apaar];
    setUpdateApaars(updates);
    void validate(rows, updates);
  };

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const json = await call({ programId, fileName, rows: plain(rows), updateApaars, commit: true, fixes: applied.map(({ rowNumber, field, code }) => ({ rowNumber, field, code })) });
      setResult({ batchId: json.batchId, created: json.created, updated: json.updated, blocked: json.stats.blockedRows });
      setStep(5);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const errorReport = () => {
    const out = issues.map((i) => ({ row: i.rowNumber, rule: i.code, severity: i.severity, problem: i.message, field: i.suggestion?.field ?? "", suggested_fix: i.suggestion?.proposed ?? "" }));
    const url = URL.createObjectURL(new Blob([toCsv(["row", "rule", "severity", "problem", "field", "suggested_fix"], out)], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "sutra_error_report.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const ruleCounts = Object.entries(stats?.byRule ?? {}).sort((a, b) => b[1] - a[1]);
  const steps = ["Choose program", "Add file", "Review and fix", "Confirm", "Submitted"];

  return (
    <div className="space-y-4">
      <PipelineStepper steps={steps} current={step - 1} />
      {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-900">{error}</p>}

      {step === 1 && (
        <Card>
          <CardHeader><CardTitle>Which program is this upload for?</CardTitle><CardDescription>Seat limits are checked against this program&apos;s approved intake and seat matrix.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <label className="block max-w-xl text-sm font-medium">Program
              <select value={programId} onChange={(e) => setProgramId(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-input bg-card px-2 font-normal">
                {programs.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.academic_year}), intake {p.approved_intake}</option>)}
              </select>
            </label>
            <Button onClick={() => setStep(2)} disabled={!programId}>Continue</Button>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader><CardTitle>Add your student file</CardTitle><CardDescription>CSV or Excel, up to 5 MB and 10,000 rows. The file is read in your browser, then checked on our server.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline"><a href="/api/app/template?format=csv"><Download className="h-4 w-4" aria-hidden />CSV template</a></Button>
              <Button asChild variant="outline"><a href="/api/app/template?format=xlsx"><Download className="h-4 w-4" aria-hidden />Excel template</a></Button>
            </div>
            <label
              className="flex cursor-pointer flex-col items-center gap-2 rounded-md border-2 border-dashed p-8 text-center focus-within:ring-2 focus-within:ring-ring"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void onFile(f); }}
            >
              <Upload className="h-6 w-6 text-muted-foreground" aria-hidden />
              <span className="font-medium">{busy ? "Checking your file…" : "Drop a file here or choose one"}</span>
              <input type="file" accept=".csv,.xlsx" className="sr-only" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }} />
            </label>
            <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
          </CardContent>
        </Card>
      )}

      {step === 3 && stats && (
        <Card>
          <CardHeader>
            <CardTitle>{(stats.errors + stats.warnings).toLocaleString("en-IN")} issues, {stats.fixable.toLocaleString("en-IN")} auto-fixable</CardTitle>
            <CardDescription>{fileName}: {stats.total} rows. {stats.cleanRows} can be submitted now and {stats.blockedRows} are blocked by errors. Rows with errors stay out; the rest can go through.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={applyAll} disabled={busy || !stats.fixable}><Sparkles className="h-4 w-4" aria-hidden />Apply all safe fixes</Button>
              <Button variant="outline" onClick={undoLast} disabled={busy || !undo.length}><RotateCcw className="h-4 w-4" aria-hidden />Undo</Button>
              <Button variant="outline" onClick={errorReport} disabled={!issues.length}><Download className="h-4 w-4" aria-hidden />Error report</Button>
              <label className="ml-auto flex items-center gap-2 text-sm">Show
                <select value={filter} onChange={(e) => { setFilter(e.target.value); setPage(0); }} className="h-9 rounded-md border border-input bg-card px-2">
                  <option value="">All rows</option>
                  <option value="Error">Rows with errors</option>
                  <option value="Warning">Rows with warnings</option>
                  {ruleCounts.map(([code, n]) => <option key={code} value={code}>{code} ({n})</option>)}
                </select>
              </label>
            </div>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted">
                  <tr>
                    <th scope="col" className="px-2 py-2">Row</th>
                    <th scope="col" className="min-w-80 px-2 py-2">Issues</th>
                    {CSV_COLUMNS.map((c) => <th key={c} scope="col" className="whitespace-nowrap px-2 py-2">{COLUMN_LABELS[c]}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => {
                    const rowIssues = issuesByRow.get(row.rowNumber) ?? [];
                    const hasError = rowIssues.some((i) => i.severity === "Error");
                    const hasWarn = rowIssues.some((i) => i.severity === "Warning");
                    return (
                      <tr key={row.rowNumber} className={cn("border-t align-top", hasError ? "bg-red-50" : hasWarn ? "bg-amber-50" : "bg-emerald-50/40")}>
                        <td className="px-2 py-1 font-medium">{row.rowNumber}</td>
                        <td className="px-2 py-1">
                          {rowIssues.length === 0 && <StatusBadge status="Clean" />}
                          <ul className="space-y-1">
                            {rowIssues.map((issue, n) => (
                              <li key={n}>
                                <span className={issue.severity === "Error" ? "font-medium text-red-900" : "text-amber-900"}>{issue.message}</span>
                                {issue.suggestion && <Button size="sm" variant="outline" disabled={busy} className="ml-1 h-6 px-2 text-xs" onClick={() => applyOne(issue)}>Apply suggestion</Button>}
                                {issue.code === "DUP_IN_DB" && <Button size="sm" variant="outline" disabled={busy} className="ml-1 h-6 px-2 text-xs" onClick={() => chooseUpdate(row.apaar_id.trim())}>Update existing</Button>}
                              </li>
                            ))}
                          </ul>
                        </td>
                        {CSV_COLUMNS.map((c) => {
                          const flagged = rowIssues.some((i) => i.suggestion?.field === c);
                          return (
                            <td key={c} className="p-0.5">
                              <input
                                aria-label={`Row ${row.rowNumber} ${COLUMN_LABELS[c]}`}
                                defaultValue={row[c]}
                                key={`${row.rowNumber}-${c}-${row[c]}`}
                                disabled={busy}
                                onBlur={(e) => editCell(row.rowNumber, c, e.target.value)}
                                className={cn("h-7 w-28 rounded border bg-transparent px-1 text-xs focus:bg-white", flagged ? "border-red-400" : "border-transparent")}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">Showing {pageRows.length} of {visible.length} rows</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
                <Button size="sm" variant="outline" disabled={(page + 1) * PAGE >= visible.length} onClick={() => setPage(page + 1)}>Next</Button>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setStep(2)}>Choose another file</Button>
              <Button onClick={() => setStep(4)} disabled={busy}>Review and submit</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 4 && stats && (
        <Card>
          <CardHeader><CardTitle>Confirm and submit</CardTitle><CardDescription>{stats.cleanRows} rows will be submitted. {stats.blockedRows} rows with errors will be left out and recorded as issues.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="mb-2 font-medium">{applied.length} changes you made ({updateApaars.length} marked as updates)</h3>
              {applied.length === 0 ? <p className="text-sm text-muted-foreground">No fixes were applied.</p> : (
                <div className="max-h-72 overflow-auto rounded-md border">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-muted"><tr><th scope="col" className="px-2 py-1">Row</th><th scope="col" className="px-2 py-1">Field</th><th scope="col" className="px-2 py-1">From</th><th scope="col" className="px-2 py-1">To</th></tr></thead>
                    <tbody>{applied.map((f, i) => <tr key={i} className="border-t"><td className="px-2 py-1">{f.rowNumber}</td><td className="px-2 py-1">{f.field}</td><td className="px-2 py-1">{f.from || "(empty)"}</td><td className="px-2 py-1">{f.to}</td></tr>)}</tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setStep(3)}>Back to review</Button>
              <Button onClick={submit} disabled={busy}>{busy ? "Submitting…" : "Submit to AICTE"}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 5 && result && (
        <Card>
          <CardHeader><CardTitle>Upload submitted</CardTitle><CardDescription>{result.created} new records and {result.updated} updates were saved. {result.blocked} rows were held back.</CardDescription></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild><Link href={`/institution/history/${result.batchId}`}>See batch results</Link></Button>
            <Button asChild variant="outline"><Link href="/institution">Back to dashboard</Link></Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
