import type { CsvColumn } from "@/lib/validation/columns";
import type { NumberedRow, Severity, Suggestion, ValidationContext } from "@/lib/validation/types";

export type Hit = { message: string; suggestion?: Suggestion; severity?: Severity };
export interface RuleEnv {
  ctx: ValidationContext;
  seenApaars: Map<string, number>;
}

export interface Rule {
  code: string;
  severity: Severity;
  title: string;
  description: string;
  alertsAicte?: boolean;
  check?: (row: NumberedRow, env: RuleEnv) => Hit | Hit[] | null;
}

export function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length]!;
}

export const normaliseName = (n: string) => n.toLowerCase().replace(/\./g, " ").replace(/\s+/g, " ").trim();
const titleCase = (n: string) => n.trim().replace(/\s+/g, " ").toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

// Accepts ISO and dd/mm/yyyy forms, so a badly formatted date is one issue instead of three.
export function toIsoDate(value: string): string | null {
  const v = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v);
  const parts = iso ? [iso[1]!, iso[2]!, iso[3]!] : dmy ? [dmy[3]!, dmy[2]!.padStart(2, "0"), dmy[1]!.padStart(2, "0")] : null;
  if (!parts) return null;
  const out = parts.join("-");
  const d = new Date(`${out}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === out ? out : null;
}

const validApaar = (r: NumberedRow) => /^\d{12}$/.test(r.apaar_id.trim());
const apaar = (r: NumberedRow) => r.apaar_id.trim();
const isTrue = (v: string) => /^(true|yes|y|1)$/i.test(v.trim());
const quotaOf = (r: NumberedRow) => r.quota_type.trim().toUpperCase();
const hasForeignStatus = (r: NumberedRow) => isTrue(r.is_nri) || r.oci_status.trim().toLowerCase() === "holder" || isTrue(r.is_foreign_national);

function ageAt(dob: string, onDate: string): number {
  const a = new Date(`${dob}T00:00:00Z`);
  const b = new Date(`${onDate}T00:00:00Z`);
  let age = b.getUTCFullYear() - a.getUTCFullYear();
  if (b.getUTCMonth() < a.getUTCMonth() || (b.getUTCMonth() === a.getUTCMonth() && b.getUTCDate() < a.getUTCDate())) age -= 1;
  return age;
}

const AGE_NORMS = { UG: [16, 25], Diploma: [14, 25], PG: [20, 40], PGDM: [20, 40] } as const;

const ENUMS: Partial<Record<CsvColumn, string[]>> = {
  gender: ["Male", "Female", "Other"],
  admission_category: ["Regular", "Supernumerary", "Lateral"],
  quota_type: ["CONVENOR", "NON_CONVENOR", "NRI", "SUPERNUMERARY", "LATERAL"],
  oci_status: ["none", "holder", "applied"],
  fee_status: ["Paid", "Partial", "Pending", "Waived"],
  enrolment_status: ["Active", "Withdrawn", "PassedOut"],
};

const FORMULA_START = /^[=+\-@\t\r]/;

function fieldFormat(row: NumberedRow): Hit[] {
  const hits: Hit[] = [];
  const fix = (field: CsvColumn, message: string, proposed?: string, severity?: Severity) => {
    hits.push({ message, severity, suggestion: proposed === undefined ? undefined : { field, current: row[field], proposed, safe: true } });
  };
  for (const field of ["dob", "admission_date"] as const) {
    const iso = toIsoDate(row[field]);
    const label = field === "dob" ? "Date of birth" : "Admission date";
    if (!iso) fix(field, `${label} is missing or not a real date.`);
    else if (iso !== row[field]) fix(field, `${label} should look like ${iso}.`, iso);
  }
  if (row.mobile.trim()) {
    const digits = row.mobile.replace(/\D/g, "");
    const ten = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
    if (!/^[6-9]\d{9}$/.test(ten)) fix("mobile", "Mobile number must be a 10-digit Indian number.");
    else if (ten !== row.mobile) fix("mobile", `Mobile number should be written as ${ten}.`, ten);
  }
  if (row.email.trim()) {
    const clean = row.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) fix("email", "Email address does not look right.");
    else if (clean !== row.email) fix("email", `Email should be written as ${clean}.`, clean);
  }
  for (const [field, allowed] of Object.entries(ENUMS) as [CsvColumn, string[]][]) {
    const raw = row[field].trim();
    const match = allowed.find((a) => a.toLowerCase() === raw.toLowerCase());
    if (!match) fix(field, `${field.replace(/_/g, " ")} must be one of: ${allowed.join(", ")}.`);
    else if (match !== row[field]) fix(field, `${field.replace(/_/g, " ")} should be written as ${match}.`, match);
  }
  for (const field of ["is_nri", "is_foreign_national"] as const) {
    const raw = row[field].trim().toLowerCase();
    if (raw === "true" || raw === "false") {
      if (raw !== row[field]) fix(field, `${field.replace(/_/g, " ")} should be true or false.`, raw);
    } else if (raw === "") fix(field, `${field.replace(/_/g, " ")} should be true or false.`, "false");
    else if (/^(yes|y|1|no|n|0)$/.test(raw)) fix(field, `${field.replace(/_/g, " ")} should be true or false.`, /^(yes|y|1)$/.test(raw) ? "true" : "false");
    else fix(field, `${field.replace(/_/g, " ")} should be true or false.`);
  }
  if (row.prev_marks_pct.trim() && !(Number(row.prev_marks_pct) >= 0 && Number(row.prev_marks_pct) <= 100)) fix("prev_marks_pct", "Previous marks must be a percentage from 0 to 100.");
  if (row.prev_pass_year.trim() && !/^\d{4}$/.test(row.prev_pass_year.trim())) fix("prev_pass_year", "Pass year must be a 4-digit year.");
  return hits;
}

export const RULES: Rule[] = [
  {
    code: "FORMULA_INJECTION",
    severity: "Error",
    title: "Unsafe cell content",
    description: "A cell starts with = + - @ or a tab, which a spreadsheet could run as a formula. Valid negative numbers are allowed in numeric columns.",
    check: (row) => {
      const hits: Hit[] = [];
      for (const [field, value] of Object.entries(row) as [string, unknown][]) {
        if (field === "rowNumber" || typeof value !== "string") continue;
        if (!FORMULA_START.test(value)) continue;
        if (field === "prev_marks_pct" && /^-?\d+(\.\d+)?$/.test(value)) continue;
        if (field === "mobile" && /^\+\d[\d\s-]*$/.test(value)) continue;
        hits.push({ message: `The ${field.replace(/_/g, " ")} column starts with a character a spreadsheet could run as a formula. Please retype it.` });
      }
      return hits;
    },
  },
  { code: "APAAR_MISSING", severity: "Error", title: "APAAR ID missing", description: "The APAAR ID cell is empty.", check: (r) => (r.apaar_id.trim() ? null : { message: "This row has no APAAR ID." }) },
  {
    code: "APAAR_FORMAT",
    severity: "Error",
    title: "APAAR ID format",
    description: "An APAAR ID has exactly 12 digits.",
    check: (r) => {
      if (!r.apaar_id.trim() || validApaar(r)) return null;
      const digits = r.apaar_id.replace(/\D/g, "");
      return { message: "An APAAR ID must have exactly 12 digits.", suggestion: digits.length === 12 && !FORMULA_START.test(r.apaar_id) ? { field: "apaar_id", current: r.apaar_id, proposed: digits, safe: true } : undefined };
    },
  },
  { code: "APAAR_NOT_FOUND", severity: "Error", title: "Not in APAAR registry", description: "The APAAR ID was not found in the registry.", check: (r, { ctx }) => (validApaar(r) && !ctx.registry.has(apaar(r)) ? { message: "This APAAR ID was not found in the APAAR registry." } : null) },
  {
    code: "APAAR_NAME_MISMATCH",
    severity: "Error",
    title: "Name differs from APAAR",
    description: "The name differs from the registry. Small differences (two letters or fewer) are a warning with a suggested correction.",
    check: (r, { ctx }) => {
      const reg = ctx.registry.get(apaar(r));
      if (!reg || !r.name.trim() || FORMULA_START.test(r.name)) return null;
      const a = normaliseName(r.name);
      const b = normaliseName(reg.name);
      if (a === b) return null;
      const near = levenshtein(a, b) <= 2;
      return {
        severity: near ? "Warning" : "Error",
        message: near ? `The name is slightly different from the APAAR record ("${reg.name}"). Use the APAAR name?` : `The name does not match the APAAR record ("${reg.name}").`,
        suggestion: { field: "name", current: r.name, proposed: reg.name, safe: near },
      };
    },
  },
  {
    code: "APAAR_DOB_MISMATCH",
    severity: "Error",
    title: "Date of birth differs from APAAR",
    description: "The date of birth differs from the registry. The suggestion is the registry value.",
    check: (r, { ctx }) => {
      const reg = ctx.registry.get(apaar(r));
      const dob = toIsoDate(r.dob);
      if (!reg || !dob || dob === reg.dob) return null;
      return { message: `Date of birth ${dob.slice(0, 4)} doesn't match the APAAR record (${reg.dob.slice(0, 4)}). Use ${reg.dob}?`, suggestion: { field: "dob", current: r.dob, proposed: reg.dob, safe: true } };
    },
  },
  {
    code: "DUP_IN_FILE",
    severity: "Error",
    title: "Repeated in this file",
    description: "The same APAAR ID appears twice in the upload.",
    check: (r, { seenApaars }) => {
      if (!validApaar(r)) return null;
      const first = seenApaars.get(apaar(r));
      if (first === undefined) {
        seenApaars.set(apaar(r), r.rowNumber);
        return null;
      }
      return { message: `This APAAR ID already appears on row ${first}.` };
    },
  },
  { code: "DUP_IN_DB", severity: "Error", title: "Already enrolled here", description: "This student is already enrolled in this program. You can choose to update the existing record.", check: (r, { ctx }) => (ctx.existingInProgram.has(apaar(r)) && !ctx.updateApaars.has(apaar(r)) ? { message: "This student is already enrolled in this program. Choose \"Update existing\" to change the record." } : null) },
  { code: "DUP_FUZZY", severity: "Warning", title: "Possible duplicate person", description: "Another APAAR ID has the same name, date of birth and mobile number.", check: (r, { ctx }) => (ctx.fuzzyRows.has(r.rowNumber) ? { message: "Another student with a different APAAR ID has the same name, date of birth and mobile number." } : null) },
  { code: "CROSS_INST_DUP", severity: "Warning", title: "Possible enrolment elsewhere", description: "An active full-time enrolment elsewhere overlaps with this one, found by keyed hash. Institutions see only this notice; AICTE sees both sides.", alertsAicte: true, check: (r, { ctx }) => (ctx.crossInstitution.has(apaar(r)) ? { message: "Possible existing enrolment elsewhere. Please contact AICTE." } : null) },
  { code: "QUOTA_NO_ALLOTMENT", severity: "Error", title: "Convenor seat without allotment", description: "A Convenor quota admission needs a counselling allotment number.", check: (r) => (quotaOf(r) === "CONVENOR" && !r.counselling_allotment_no.trim() ? { message: "A Convenor seat needs a counselling allotment number." } : null) },
  { code: "FN_NEEDS_PASSPORT", severity: "Error", title: "Passport or OCI number needed", description: "NRI, OCI and foreign national students need a passport or OCI number.", check: (r) => (hasForeignStatus(r) && !r.passport_no.trim() ? { message: "NRI, OCI and foreign national students need a passport or OCI number." } : null) },
  { code: "SUPERNUM_BAD_CATEGORY", severity: "Error", title: "Supernumerary category not eligible", description: "Supernumerary admission needs NRI, OCI or foreign national status.", check: (r) => ((quotaOf(r) === "SUPERNUMERARY" || r.admission_category.trim().toLowerCase() === "supernumerary") && !hasForeignStatus(r) ? { message: "A supernumerary seat is only for NRI, OCI or foreign national students." } : null) },
  { code: "NATIONALITY_MISMATCH", severity: "Warning", title: "Nationality and category disagree", description: "The foreign national flag does not agree with the stated nationality.", check: (r) => (isTrue(r.is_foreign_national) && /^indian$/i.test(r.nationality.trim()) ? { message: "This student is marked as a foreign national, but the nationality says Indian." } : !isTrue(r.is_foreign_national) && r.oci_status.trim().toLowerCase() === "none" && r.nationality.trim() && !/^indian$/i.test(r.nationality.trim()) ? { message: "The nationality is not Indian, but the student is not marked as a foreign national or OCI holder." } : null) },
  {
    code: "DOB_AFTER_ADMISSION",
    severity: "Error",
    title: "Admission before birth",
    description: "The admission date is before the date of birth.",
    check: (r) => {
      const dob = toIsoDate(r.dob);
      const adm = toIsoDate(r.admission_date);
      return dob && adm && adm < dob ? { message: "The admission date is before the date of birth." } : null;
    },
  },
  {
    code: "AGE_OUT_OF_RANGE",
    severity: "Warning",
    title: "Unusual age at admission",
    description: "The age at admission is outside the usual range for this level.",
    check: (r, { ctx }) => {
      const dob = toIsoDate(r.dob);
      const adm = toIsoDate(r.admission_date);
      if (!dob || !adm || adm < dob) return null;
      const [min, max] = AGE_NORMS[ctx.program.level];
      const age = ageAt(dob, adm);
      return age < min || age > max ? { message: `Age at admission (${age}) is outside the usual ${min} to ${max} range for this level.` } : null;
    },
  },
  {
    code: "QUAL_YEAR_AFTER_ADMISSION",
    severity: "Error",
    title: "Qualifying year after admission",
    description: "The previous qualification year is after the admission year.",
    check: (r) => {
      const adm = toIsoDate(r.admission_date);
      const year = Number(r.prev_pass_year);
      return adm && /^\d{4}$/.test(r.prev_pass_year.trim()) && year > Number(adm.slice(0, 4)) ? { message: `The qualification year (${year}) is after the admission year.` } : null;
    },
  },
  {
    code: "ELIGIBILITY_FAIL",
    severity: "Error",
    title: "Fails eligibility rules",
    description: "The student does not meet the eligibility rules, using verified university marks.",
    check: (r, { ctx }) => {
      const { minPct, maxAge, requiredStream } = ctx.eligibility;
      const hits: Hit[] = [];
      const marks = ctx.qualifyingMarks.get(apaar(r));
      if (minPct !== undefined && marks !== undefined && marks < minPct) hits.push({ message: `Verified qualifying marks (${marks}%) are below the ${minPct}% minimum for this program.` });
      const dob = toIsoDate(r.dob);
      const adm = toIsoDate(r.admission_date);
      if (maxAge !== undefined && dob && adm && adm >= dob && ageAt(dob, adm) > maxAge) hits.push({ message: `Age at admission is above the ${maxAge} year limit for this program.` });
      if (requiredStream && r.prev_qualification.trim() && !r.prev_qualification.toLowerCase().includes(requiredStream.toLowerCase())) hits.push({ message: `This program requires a ${requiredStream} background.` });
      return hits;
    },
  },
  { code: "ELIGIBILITY_NO_DATA", severity: "Warning", title: "No verified marks", description: "No verified university marks were found for this student.", check: (r, { ctx }) => (validApaar(r) && ctx.registry.has(apaar(r)) && !ctx.qualifyingMarks.has(apaar(r)) ? { message: "No verified qualifying marks were found for this student yet." } : null) },
  {
    code: "FIELD_FORMAT",
    severity: "Error",
    title: "Field format",
    description: "An email, mobile number, date, or list value is in the wrong format. Name casing or spacing is a warning.",
    check: (r, { ctx }) => {
      const hits = fieldFormat(r);
      if (r.name.trim() && !FORMULA_START.test(r.name)) {
        const reg = ctx.registry.get(apaar(r));
        const tidy = reg && normaliseName(reg.name) === normaliseName(r.name) ? reg.name : titleCase(r.name);
        const messy = r.name !== r.name.trim().replace(/\s+/g, " ") || r.name === r.name.toUpperCase() || (!!reg && normaliseName(reg.name) === normaliseName(r.name) && r.name !== reg.name);
        if (messy) hits.push({ severity: "Warning", message: `The name should be written as "${tidy}".`, suggestion: { field: "name", current: r.name, proposed: tidy, safe: true } });
      } else if (!r.name.trim()) {
        hits.push({ message: "Name is missing." });
      }
      return hits;
    },
  },
  { code: "OVER_INTAKE", severity: "Error", title: "Over approved intake", description: "Regular admissions would go past the intake AICTE approved. AICTE is alerted.", alertsAicte: true },
  { code: "OVER_SUPERNUMERARY", severity: "Error", title: "Over supernumerary cap", description: "Supernumerary admissions would go past the program's cap. AICTE is alerted.", alertsAicte: true },
  { code: "OVER_QUOTA", severity: "Error", title: "Over quota", description: "A quota in the seat matrix would be exceeded, even if overall intake is fine. AICTE is alerted.", alertsAicte: true },
];

export const RULE_BY_CODE = new Map(RULES.map((r) => [r.code, r]));
