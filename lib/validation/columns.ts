export const CSV_COLUMNS = [
  "apaar_id", "name", "dob", "gender", "nationality", "admission_date", "admission_category", "quota_type",
  "counselling_allotment_no", "is_nri", "oci_status", "is_foreign_national", "passport_no", "mobile", "email", "address",
  "prev_qualification", "prev_marks_pct", "prev_pass_year", "fee_status", "enrolment_status",
] as const;

export type CsvColumn = (typeof CSV_COLUMNS)[number];
export type CsvRow = Record<CsvColumn, string>;

export const COLUMN_LABELS: Record<CsvColumn, string> = {
  apaar_id: "APAAR ID",
  name: "Name",
  dob: "Date of birth",
  gender: "Gender",
  nationality: "Nationality",
  admission_date: "Admission date",
  admission_category: "Category",
  quota_type: "Quota",
  counselling_allotment_no: "Allotment no.",
  is_nri: "NRI",
  oci_status: "OCI",
  is_foreign_national: "Foreign national",
  passport_no: "Passport/OCI no.",
  mobile: "Mobile",
  email: "Email",
  address: "Address",
  prev_qualification: "Previous qualification",
  prev_marks_pct: "Previous marks %",
  prev_pass_year: "Pass year",
  fee_status: "Fee status",
  enrolment_status: "Enrolment status",
};

export const MAX_UPLOAD_ROWS = 10_000;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const API_MAX_ROWS = 500;

export function emptyRow(): CsvRow {
  return Object.fromEntries(CSV_COLUMNS.map((c) => [c, ""])) as CsvRow;
}

export function coerceRow(raw: Record<string, unknown>): CsvRow {
  const row = emptyRow();
  for (const c of CSV_COLUMNS) {
    const v = raw[c];
    row[c] = v === null || v === undefined ? "" : String(v);
  }
  return row;
}

// Exported files must never let a spreadsheet run a cell as a formula.
export function neutraliseCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) && !/^-?\d+(\.\d+)?$/.test(value) ? `'${value}` : value;
}

export function toCsv(columns: readonly string[], rows: Record<string, unknown>[]): string {
  const cell = (v: unknown) => {
    const s = neutraliseCell(v === null || v === undefined ? "" : String(v));
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(","), ...rows.map((r) => columns.map((c) => cell(r[c])).join(","))].join("\n") + "\n";
}
