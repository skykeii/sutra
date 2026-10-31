import type { CsvColumn, CsvRow } from "@/lib/validation/columns";

export type Severity = "Error" | "Warning" | "Info";
export type Quota = "CONVENOR" | "NON_CONVENOR" | "NRI" | "SUPERNUMERARY" | "LATERAL";

export interface Suggestion {
  field: CsvColumn;
  current: string;
  proposed: string;
  // Safe fixes are mechanical or come from the APAAR registry, so "Apply all safe fixes" may use them.
  safe: boolean;
}

export interface Issue {
  rowNumber: number;
  code: string;
  severity: Severity;
  message: string;
  suggestion?: Suggestion;
  alert?: boolean;
}

export interface NumberedRow extends CsvRow {
  rowNumber: number;
}

export interface ValidationContext {
  program: {
    level: "UG" | "PG" | "Diploma" | "PGDM";
    approvedIntake: number;
    supernumeraryCap: number;
    seatMatrix: Partial<Record<Quota, number>>;
  };
  counts: { regular: number; supernumerary: number; byQuota: Partial<Record<Quota, number>> };
  registry: Map<string, { name: string; dob: string; gender: string }>;
  existingInProgram: Set<string>;
  updateApaars: Set<string>;
  crossInstitution: Set<string>;
  fuzzyRows: Set<number>;
  qualifyingMarks: Map<string, number>;
  eligibility: { minPct?: number; maxAge?: number; requiredStream?: string };
}

export interface ValidationStats {
  total: number;
  errors: number;
  warnings: number;
  cleanRows: number;
  blockedRows: number;
  fixable: number;
  byRule: Record<string, number>;
}

export interface ValidationResult {
  issues: Issue[];
  cleanRows: NumberedRow[];
  stats: ValidationStats;
}
