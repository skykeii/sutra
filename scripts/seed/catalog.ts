import type { AppRole } from "@/lib/auth/roles";

export type InstitutionKind = "engineering" | "management" | "pharmacy" | "architecture";

export const UNIVERSITIES = [
  { code: "jntuh", name: "JNTU Hyderabad", state: "Telangana" },
  { code: "vtu", name: "Visvesvaraya Technological University", state: "Karnataka" },
  { code: "anna", name: "Anna University", state: "Tamil Nadu" },
  { code: "sppu", name: "Savitribai Phule Pune University", state: "Maharashtra" },
] as const;

export interface InstitutionSeed {
  code: string;
  name: string;
  state: string;
  district: string;
  kind: InstitutionKind;
  university: (typeof UNIVERSITIES)[number]["code"];
  notReporting?: boolean;
}

export const INSTITUTIONS: InstitutionSeed[] = [
  { code: "deccan", name: "Deccan Institute of Technology", state: "Telangana", district: "Hyderabad", kind: "engineering", university: "jntuh" },
  { code: "charminar", name: "Charminar School of Management", state: "Telangana", district: "Hyderabad", kind: "management", university: "jntuh" },
  { code: "godavari", name: "Godavari College of Pharmacy", state: "Telangana", district: "Warangal", kind: "pharmacy", university: "jntuh" },
  { code: "bharat", name: "Bharat Institute of Engineering", state: "Karnataka", district: "Bengaluru Urban", kind: "engineering", university: "vtu" },
  { code: "malnad", name: "Malnad College of Architecture", state: "Karnataka", district: "Shivamogga", kind: "architecture", university: "vtu" },
  { code: "mysuru", name: "Mysuru Business School", state: "Karnataka", district: "Mysuru", kind: "management", university: "vtu" },
  { code: "sahyadri", name: "Sahyadri Institute of Technology", state: "Maharashtra", district: "Pune", kind: "engineering", university: "sppu" },
  { code: "konkan", name: "Konkan Engineering College", state: "Maharashtra", district: "Ratnagiri", kind: "engineering", university: "sppu" },
  { code: "nashik", name: "Nashik College of Pharmacy", state: "Maharashtra", district: "Nashik", kind: "pharmacy", university: "sppu" },
  { code: "kaveri", name: "Kaveri College of Engineering", state: "Tamil Nadu", district: "Tiruchirappalli", kind: "engineering", university: "anna" },
  { code: "marina", name: "Marina School of Architecture", state: "Tamil Nadu", district: "Chennai", kind: "architecture", university: "anna" },
  { code: "yamuna", name: "Yamuna Institute of Technology", state: "Delhi", district: "New Delhi", kind: "engineering", university: "vtu" },
  { code: "indraprastha", name: "Indraprastha School of Business", state: "Delhi", district: "South Delhi", kind: "management", university: "vtu" },
  { code: "ganga", name: "Ganga Valley Institute of Technology", state: "Uttar Pradesh", district: "Varanasi", kind: "engineering", university: "vtu" },
  { code: "vindhya", name: "Vindhya College of Engineering", state: "Uttar Pradesh", district: "Mirzapur", kind: "engineering", university: "vtu" },
  { code: "awadh", name: "Awadh College of Pharmacy", state: "Uttar Pradesh", district: "Lucknow", kind: "pharmacy", university: "vtu" },
  { code: "sabarmati", name: "Sabarmati Institute of Technology", state: "Gujarat", district: "Ahmedabad", kind: "engineering", university: "sppu" },
  { code: "kutch", name: "Kutch School of Management", state: "Gujarat", district: "Bhuj", kind: "management", university: "sppu" },
  { code: "aravalli", name: "Aravalli Institute of Engineering", state: "Rajasthan", district: "Jaipur", kind: "engineering", university: "sppu" },
  { code: "thar", name: "Thar College of Architecture", state: "Rajasthan", district: "Jodhpur", kind: "architecture", university: "sppu", notReporting: true },
  { code: "hooghly", name: "Hooghly Institute of Technology", state: "West Bengal", district: "Howrah", kind: "engineering", university: "anna" },
  { code: "sundarban", name: "Sundarban College of Pharmacy", state: "West Bengal", district: "Kolkata", kind: "pharmacy", university: "anna", notReporting: true },
  { code: "malabar", name: "Malabar College of Engineering", state: "Kerala", district: "Kozhikode", kind: "engineering", university: "anna" },
  { code: "periyar", name: "Periyar School of Business", state: "Kerala", district: "Kochi", kind: "management", university: "anna" },
];

export interface ProgramTemplate {
  code: string;
  name: string;
  level: "UG" | "PG" | "Diploma" | "PGDM";
  duration: number;
}

export const PROGRAM_TEMPLATES: Record<InstitutionKind, ProgramTemplate[]> = {
  engineering: [
    { code: "CSE", name: "B.Tech Computer Science & Engineering", level: "UG", duration: 4 },
    { code: "ECE", name: "B.Tech Electronics & Communication", level: "UG", duration: 4 },
    { code: "DME", name: "Diploma in Mechanical Engineering", level: "Diploma", duration: 3 },
  ],
  management: [
    { code: "PGDM", name: "PGDM General Management", level: "PGDM", duration: 2 },
    { code: "BA", name: "PGDM Business Analytics", level: "PGDM", duration: 2 },
    { code: "MBA", name: "MBA Finance", level: "PG", duration: 2 },
  ],
  pharmacy: [
    { code: "BPH", name: "B.Pharm", level: "UG", duration: 4 },
    { code: "MPH", name: "M.Pharm Pharmaceutics", level: "PG", duration: 2 },
    { code: "DPH", name: "D.Pharm", level: "Diploma", duration: 2 },
  ],
  architecture: [
    { code: "BAR", name: "B.Arch", level: "UG", duration: 5 },
    { code: "MAR", name: "M.Arch Urban Design", level: "PG", duration: 2 },
    { code: "DAR", name: "Diploma in Architecture Assistantship", level: "Diploma", duration: 3 },
  ],
};

export const VERIFIER_ORGS = [
  { code: "navayuga", name: "Navayuga Software Services", type: "Employer", status: "Approved", scope: ["institution", "program", "years", "status"] },
  { code: "meridian", name: "Meridian Engineering Works", type: "Employer", status: "Approved", scope: ["institution", "program", "years", "status"] },
  { code: "council", name: "National Technical Standards Council", type: "Regulator", status: "Approved", scope: ["institution", "program", "years", "status", "quota", "admission_category", "validation_status"] },
  { code: "pending", name: "Horizon Staffing Partners", type: "Employer", status: "Pending", scope: ["institution", "program", "years", "status"] },
] as const;

export interface DemoStudent {
  n: number;
  apaar: string;
  name: string;
  dob: string;
  gender: string;
  note: string;
}

export const DEMO_STUDENTS: DemoStudent[] = [
  { n: 1, apaar: "900000000001", name: "Ananya Reddy", dob: "2006-03-14", gender: "Female", note: "valid credential" },
  { n: 2, apaar: "900000000002", name: "Rohan Verma", dob: "2006-07-22", gender: "Male", note: "revoked credential" },
  { n: 3, apaar: "900000000003", name: "Priya Nair", dob: "2005-11-02", gender: "Female", note: "pending consent" },
  { n: 4, apaar: "900000000004", name: "Arjun Mehta", dob: "2006-01-09", gender: "Male", note: "marks mismatch" },
  { n: 5, apaar: "900000000005", name: "Sneha Kulkarni", dob: "2006-05-30", gender: "Female", note: "scholarship success" },
  { n: 6, apaar: "900000000006", name: "Vikram Singh", dob: "2005-09-18", gender: "Male", note: "detained in Sem 4" },
  { n: 7, apaar: "900000000007", name: "Meera Iyer", dob: "2006-02-11", gender: "Female", note: "duplicate scholarship claim" },
  { n: 8, apaar: "900000000008", name: "Kabir Khan", dob: "2005-12-25", gender: "Male", note: "enrolled at two institutions" },
  { n: 9, apaar: "900000000009", name: "Divya Sharma", dob: "2006-08-06", gender: "Female", note: "access history" },
  { n: 10, apaar: "900000000010", name: "Aditya Rao", dob: "2006-04-17", gender: "Male", note: "general" },
];

export const QUOTA_LABELS = [
  { state: "Telangana", quota: "CONVENOR", label: "Convenor (Category A)" },
  { state: "Telangana", quota: "NON_CONVENOR", label: "Management (Category B)" },
  { state: "Karnataka", quota: "CONVENOR", label: "CET Quota" },
  { state: "Karnataka", quota: "NON_CONVENOR", label: "COMEDK and Management" },
  { state: "Maharashtra", quota: "CONVENOR", label: "CAP Round" },
  { state: "Maharashtra", quota: "NON_CONVENOR", label: "Institute Level" },
  { state: "Tamil Nadu", quota: "CONVENOR", label: "TNEA Counselling" },
  { state: "Tamil Nadu", quota: "NON_CONVENOR", label: "Management Quota" },
] as const;

export const ELIGIBILITY_DEFAULTS = [
  { level: "UG", rule_type: "MIN_QUALIFYING_PCT", params: { min: 45 } },
  { level: "PG", rule_type: "MIN_QUALIFYING_PCT", params: { min: 50 } },
  { level: "PGDM", rule_type: "MIN_QUALIFYING_PCT", params: { min: 50 } },
  { level: "Diploma", rule_type: "MIN_QUALIFYING_PCT", params: { min: 35 } },
  { level: "UG", rule_type: "MAX_AGE", params: { max: 30 } },
  { level: "Diploma", rule_type: "MAX_AGE", params: { max: 30 } },
] as const;

export interface SeedUser {
  handle: string;
  role: AppRole;
  fullName: string;
  institution?: string;
  university?: string;
  verifier?: string;
  portal?: string;
  apaarHash?: string;
}
