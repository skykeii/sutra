import { describe, expect, it } from "vitest";
import { applySafeFixes, numberRows, RULES, toStoredIssue, validateBatch, type ValidationContext } from "@/lib/validation";
import { emptyRow, neutraliseCell, toCsv, type CsvRow } from "@/lib/validation/columns";

const PERSON = { apaar: "123456789012", name: "Asha Rao", dob: "2006-03-14", gender: "Female" };

function row(over: Partial<CsvRow> = {}): CsvRow {
  return {
    ...emptyRow(),
    apaar_id: PERSON.apaar,
    name: PERSON.name,
    dob: PERSON.dob,
    gender: PERSON.gender,
    nationality: "Indian",
    admission_date: "2026-08-01",
    admission_category: "Regular",
    quota_type: "NON_CONVENOR",
    is_nri: "false",
    oci_status: "none",
    is_foreign_national: "false",
    mobile: "9876543210",
    email: "asha@example.com",
    prev_qualification: "Class 12",
    prev_marks_pct: "80",
    prev_pass_year: "2026",
    fee_status: "Paid",
    enrolment_status: "Active",
    ...over,
  };
}

function ctx(over: Partial<ValidationContext> = {}): ValidationContext {
  return {
    program: { level: "UG", approvedIntake: 60, supernumeraryCap: 3, seatMatrix: { CONVENOR: 30, NON_CONVENOR: 20, NRI: 5, LATERAL: 5, SUPERNUMERARY: 3 } },
    counts: { regular: 0, supernumerary: 0, byQuota: {} },
    registry: new Map([[PERSON.apaar, { name: PERSON.name, dob: PERSON.dob, gender: PERSON.gender }]]),
    existingInProgram: new Set(),
    updateApaars: new Set(),
    crossInstitution: new Set(),
    fuzzyRows: new Set(),
    qualifyingMarks: new Map([[PERSON.apaar, 80]]),
    eligibility: { minPct: 45, maxAge: 30 },
    ...over,
  };
}

const codes = (rows: CsvRow[], c = ctx()) => validateBatch(numberRows(rows), c).issues.map((i) => i.code);
const severityOf = (rows: CsvRow[], code: string, c = ctx()) => validateBatch(numberRows(rows), c).issues.find((i) => i.code === code)?.severity;

describe("clean row", () => {
  it("raises nothing", () => {
    const result = validateBatch(numberRows([row()]), ctx());
    expect(result.issues).toEqual([]);
    expect(result.cleanRows).toHaveLength(1);
  });
});

describe("every rule code", () => {
  const cases: [string, "Error" | "Warning", () => [CsvRow[], ValidationContext?]][] = [
    ["APAAR_MISSING", "Error", () => [[row({ apaar_id: "" })]]],
    ["APAAR_FORMAT", "Error", () => [[row({ apaar_id: "12345" })]]],
    ["APAAR_NOT_FOUND", "Error", () => [[row({ apaar_id: "111122223333" })]]],
    ["APAAR_NAME_MISMATCH", "Error", () => [[row({ name: "Completely Different" })]]],
    ["APAAR_DOB_MISMATCH", "Error", () => [[row({ dob: "2004-03-14" })]]],
    ["DUP_IN_FILE", "Error", () => [[row(), row()]]],
    ["DUP_IN_DB", "Error", () => [[row()], ctx({ existingInProgram: new Set([PERSON.apaar]) })]],
    ["DUP_FUZZY", "Warning", () => [[row()], ctx({ fuzzyRows: new Set([2]) })]],
    ["CROSS_INST_DUP", "Warning", () => [[row()], ctx({ crossInstitution: new Set([PERSON.apaar]) })]],
    ["OVER_INTAKE", "Error", () => [[row()], ctx({ counts: { regular: 60, supernumerary: 0, byQuota: {} } })]],
    ["OVER_SUPERNUMERARY", "Error", () => [[row({ quota_type: "SUPERNUMERARY", admission_category: "Supernumerary", is_nri: "true", passport_no: "P123" })], ctx({ counts: { regular: 0, supernumerary: 3, byQuota: {} } })]],
    ["OVER_QUOTA", "Error", () => [[row()], ctx({ counts: { regular: 20, supernumerary: 0, byQuota: { NON_CONVENOR: 20 } } })]],
    ["QUOTA_NO_ALLOTMENT", "Error", () => [[row({ quota_type: "CONVENOR" })]]],
    ["FN_NEEDS_PASSPORT", "Error", () => [[row({ is_nri: "true" })]]],
    ["SUPERNUM_BAD_CATEGORY", "Error", () => [[row({ quota_type: "SUPERNUMERARY", admission_category: "Supernumerary" })]]],
    ["NATIONALITY_MISMATCH", "Warning", () => [[row({ is_foreign_national: "true", passport_no: "P123" })]]],
    ["DOB_AFTER_ADMISSION", "Error", () => [[row({ admission_date: "1990-06-01" })]]],
    ["AGE_OUT_OF_RANGE", "Warning", () => [[row({ admission_date: "2040-08-01", prev_pass_year: "2040" })], ctx({ eligibility: {} })]],
    ["QUAL_YEAR_AFTER_ADMISSION", "Error", () => [[row({ prev_pass_year: "2029" })]]],
    ["ELIGIBILITY_FAIL", "Error", () => [[row()], ctx({ qualifyingMarks: new Map([[PERSON.apaar, 30]]) })]],
    ["ELIGIBILITY_NO_DATA", "Warning", () => [[row()], ctx({ qualifyingMarks: new Map() })]],
    ["FORMULA_INJECTION", "Error", () => [[row({ address: "=HYPERLINK(1)" })]]],
    ["FIELD_FORMAT", "Error", () => [[row({ email: "not-an-email" })]]],
  ];

  it.each(cases)("%s fires as %s", (code, severity, build) => {
    const [rows, c] = build();
    const result = validateBatch(numberRows(rows), c ?? ctx());
    const issue = result.issues.find((i) => i.code === code);
    expect(issue, `${code} did not fire`).toBeTruthy();
    expect(issue!.severity).toBe(severity);
    expect(issue!.message.length).toBeGreaterThan(5);
  });

  it("covers every rule in the registry", () => {
    expect(new Set(cases.map((c) => c[0]))).toEqual(new Set(RULES.map((r) => r.code)));
  });
});

describe("rule behaviour", () => {
  it("treats a name within two letters as a warning with a suggestion", () => {
    expect(severityOf([row({ name: "Asha Roa" })], "APAAR_NAME_MISMATCH")).toBe("Warning");
    const issue = validateBatch(numberRows([row({ name: "Asha Roa" })]), ctx()).issues[0]!;
    expect(issue.suggestion?.proposed).toBe(PERSON.name);
  });
  it("gives one issue for a badly formatted but correct date", () => {
    expect(codes([row({ dob: "14/03/2006" })])).toEqual(["FIELD_FORMAT"]);
  });
  it("allows updating an existing record when chosen", () => {
    expect(codes([row()], ctx({ existingInProgram: new Set([PERSON.apaar]), updateApaars: new Set([PERSON.apaar]) }))).toEqual([]);
  });
  it("does not flag a formatted mobile number as a formula", () => {
    expect(codes([row({ mobile: "+91-98765 43210" })])).toEqual(["FIELD_FORMAT"]);
  });
  it("allows a negative number in a numeric column for the injection rule", () => {
    expect(codes([row({ prev_marks_pct: "-5" })])).not.toContain("FORMULA_INJECTION");
  });
  it("blocks only the row that goes past intake", () => {
    const second = { ...PERSON, apaar: "123456789013" };
    const c = ctx({ counts: { regular: 59, supernumerary: 0, byQuota: {} } });
    c.registry.set(second.apaar, second);
    c.qualifyingMarks.set(second.apaar, 80);
    const result = validateBatch(numberRows([row(), row({ apaar_id: second.apaar })]), c);
    expect(result.cleanRows).toHaveLength(1);
    expect(result.issues.map((i) => [i.rowNumber, i.code])).toEqual([[3, "OVER_INTAKE"]]);
  });
  it("flags one overflowing quota even when overall intake is fine", () => {
    expect(codes([row()], ctx({ counts: { regular: 20, supernumerary: 0, byQuota: { NON_CONVENOR: 20 } } }))).toEqual(["OVER_QUOTA"]);
  });
  it("keeps warnings admissible", () => {
    const result = validateBatch(numberRows([row()]), ctx({ fuzzyRows: new Set([2]) }));
    expect(result.cleanRows).toHaveLength(1);
  });
  it("never tells an institution who holds the other enrolment", () => {
    const issue = validateBatch(numberRows([row()]), ctx({ crossInstitution: new Set([PERSON.apaar]) })).issues[0]!;
    expect(issue.message).toBe("Possible existing enrolment elsewhere. Please contact AICTE.");
  });
});

describe("fixes", () => {
  it("applying all safe fixes clears mechanical problems", () => {
    const rows = numberRows([row({ dob: "14/03/2006", name: "  ASHA RAO ", mobile: "+91-98765 43210", email: " ASHA@EXAMPLE.COM ", admission_date: "01/08/2026" })]);
    const first = validateBatch(rows, ctx());
    expect(first.stats.fixable).toBe(5);
    const fixed = applySafeFixes(rows, first.issues);
    expect(fixed.applied).toHaveLength(5);
    expect(validateBatch(fixed.rows, ctx()).issues).toEqual([]);
  });
  it("replaces a wrong date of birth with the registry value", () => {
    const rows = numberRows([row({ dob: "2004-03-14" })]);
    const fixed = applySafeFixes(rows, validateBatch(rows, ctx()).issues);
    expect(fixed.rows[0]!.dob).toBe(PERSON.dob);
  });
  it("does not auto-apply a replacement for a very different name", () => {
    const rows = numberRows([row({ name: "Completely Different" })]);
    expect(applySafeFixes(rows, validateBatch(rows, ctx()).issues).applied).toEqual([]);
  });
});

describe("data minimisation", () => {
  it("stored issues hold no raw values", () => {
    const rows = numberRows([row({ dob: "2004-03-14", mobile: "+91-98765 43210" })]);
    const stored = JSON.stringify(validateBatch(rows, ctx()).issues.map(toStoredIssue));
    expect(stored).not.toContain("2004-03-14");
    expect(stored).not.toContain(PERSON.dob);
    expect(stored).not.toContain("9876543210");
    expect(stored).not.toContain("98765 43210");
  });
});

describe("export safety", () => {
  it("neutralises formula cells but leaves numbers alone", () => {
    expect(neutraliseCell("=1+1")).toBe("'=1+1");
    expect(neutraliseCell("@cmd")).toBe("'@cmd");
    expect(neutraliseCell("-5.5")).toBe("-5.5");
    expect(toCsv(["a"], [{ a: "=SUM(A1)" }])).toContain("'=SUM(A1)");
  });
});
