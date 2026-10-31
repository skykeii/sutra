import type { Issue, NumberedRow } from "@/lib/validation/types";

export interface AppliedFix {
  rowNumber: number;
  field: string;
  from: string;
  to: string;
  code: string;
}

export function applyFix(rows: NumberedRow[], issue: Issue): { rows: NumberedRow[]; applied: AppliedFix | null } {
  const s = issue.suggestion;
  if (!s) return { rows, applied: null };
  return {
    rows: rows.map((r) => (r.rowNumber === issue.rowNumber ? { ...r, [s.field]: s.proposed } : r)),
    applied: { rowNumber: issue.rowNumber, field: s.field, from: s.current, to: s.proposed, code: issue.code },
  };
}

export function applySafeFixes(rows: NumberedRow[], issues: Issue[]): { rows: NumberedRow[]; applied: AppliedFix[] } {
  let next = rows;
  const applied: AppliedFix[] = [];
  for (const issue of issues) {
    if (!issue.suggestion?.safe) continue;
    const result = applyFix(next, issue);
    next = result.rows;
    if (result.applied) applied.push(result.applied);
  }
  return { rows: next, applied };
}
