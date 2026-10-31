import type { CsvRow } from "@/lib/validation/columns";
import { RULES, RULE_BY_CODE, toIsoDate, type RuleEnv } from "@/lib/validation/rules";
import type { Issue, NumberedRow, Quota, Suggestion, ValidationContext, ValidationResult } from "@/lib/validation/types";

export { RULES } from "@/lib/validation/rules";
export type { Issue, NumberedRow, ValidationContext, ValidationResult } from "@/lib/validation/types";

export function numberRows(rows: CsvRow[]): NumberedRow[] {
  // Row 1 of the file is the header, so the first data row is row 2.
  return rows.map((row, i) => ({ ...row, rowNumber: i + 2 }));
}

/**
 * Pure by design: no database, network or secrets, only the rows and the lookups it is handed.
 * This boundary is what lets the engine move to isolated workers later.
 */
export function validateBatch(rows: NumberedRow[], ctx: ValidationContext): ValidationResult {
  const env: RuleEnv = { ctx, seenApaars: new Map() };
  const issues: Issue[] = [];
  const add = (rowNumber: number, code: string, message: string, severity?: Issue["severity"], suggestion?: Suggestion) => {
    const rule = RULE_BY_CODE.get(code)!;
    issues.push({ rowNumber, code, severity: severity ?? rule.severity, message, suggestion, alert: rule.alertsAicte });
  };

  for (const row of rows) {
    for (const rule of RULES) {
      if (!rule.check) continue;
      const result = rule.check(row, env);
      if (!result) continue;
      for (const hit of Array.isArray(result) ? result : [result]) add(row.rowNumber, rule.code, hit.message, hit.severity, hit.suggestion);
    }
  }

  // Seats are only spent by rows that could actually be admitted.
  const blocked = new Set(issues.filter((i) => i.severity === "Error").map((i) => i.rowNumber));
  const used = { regular: ctx.counts.regular, supernumerary: ctx.counts.supernumerary, byQuota: { ...ctx.counts.byQuota } };
  for (const row of rows) {
    if (blocked.has(row.rowNumber) || ctx.updateApaars.has(row.apaar_id.trim())) continue;
    if (row.enrolment_status.trim() && row.enrolment_status.trim() !== "Active") continue;
    const quota = row.quota_type.trim().toUpperCase() as Quota;
    let over = false;
    if (quota === "SUPERNUMERARY") {
      if (used.supernumerary + 1 > ctx.program.supernumeraryCap) {
        add(row.rowNumber, "OVER_SUPERNUMERARY", `Supernumerary seats are full (${ctx.program.supernumeraryCap} allowed).`);
        over = true;
      }
    } else if (used.regular + 1 > ctx.program.approvedIntake) {
      add(row.rowNumber, "OVER_INTAKE", `This would take admissions past the approved intake of ${ctx.program.approvedIntake}.`);
      over = true;
    }
    const allowed = ctx.program.seatMatrix[quota];
    if (allowed !== undefined && (used.byQuota[quota] ?? 0) + 1 > allowed) {
      add(row.rowNumber, "OVER_QUOTA", `The ${quota.replace("_", "-").toLowerCase()} quota is full (${allowed} seats).`);
      over = true;
    }
    if (over) {
      blocked.add(row.rowNumber);
      continue;
    }
    if (quota === "SUPERNUMERARY") used.supernumerary += 1;
    else used.regular += 1;
    used.byQuota[quota] = (used.byQuota[quota] ?? 0) + 1;
  }

  issues.sort((a, b) => a.rowNumber - b.rowNumber);
  const byRule: Record<string, number> = {};
  issues.forEach((i) => (byRule[i.code] = (byRule[i.code] ?? 0) + 1));
  const cleanRows = rows.filter((r) => !blocked.has(r.rowNumber));
  return {
    issues,
    cleanRows,
    stats: {
      total: rows.length,
      errors: issues.filter((i) => i.severity === "Error").length,
      warnings: issues.filter((i) => i.severity === "Warning").length,
      cleanRows: cleanRows.length,
      blockedRows: blocked.size,
      fixable: issues.filter((i) => i.suggestion?.safe).length,
      byRule,
    },
  };
}

export { applyFix, applySafeFixes, type AppliedFix } from "@/lib/validation/fixes";

/** The stored form: no raw values in the message or the suggestion, per the data-minimisation rule. */
export function toStoredIssue(issue: Issue): { rule_code: string; severity: string; row_number: number; message: string; suggestion: { field: string; current: string; proposed: string } | null } {
  const rule = RULE_BY_CODE.get(issue.code);
  const mask = (v: string) => (v.length <= 2 ? "••" : `${v.slice(0, 1)}•••${v.slice(-1)}`);
  return {
    rule_code: issue.code,
    severity: issue.severity,
    row_number: issue.rowNumber,
    message: rule?.description ?? issue.code,
    suggestion: issue.suggestion ? { field: issue.suggestion.field, current: mask(issue.suggestion.current), proposed: mask(issue.suggestion.proposed) } : null,
  };
}

export { toIsoDate };
