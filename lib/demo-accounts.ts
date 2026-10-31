import type { AppRole } from "@/lib/auth/roles";

export const DEMO_PASSWORD = "Demo@12345";
export const DEMO_EMAIL_DOMAIN = "sutra.example";

export const demoEmail = (handle: string) => `${handle}@${DEMO_EMAIL_DOMAIN}`;

export interface DemoAccount {
  label: string;
  hint: string;
  email: string;
  role: AppRole;
}

// Shown on the login page only when DEMO_MODE=true; the seeder creates every one of these.
export const DEMO_ACCOUNTS: DemoAccount[] = [
  { label: "AICTE Admin", hint: "National dashboard, approvals", email: demoEmail("aicte.admin"), role: "aicte_admin" },
  { label: "AICTE Admin 2", hint: "Second approver for maker-checker", email: demoEmail("aicte.admin2"), role: "aicte_admin" },
  { label: "AICTE Officer", hint: "Read and monitor", email: demoEmail("aicte.officer"), role: "aicte_officer" },
  { label: "Institution Admin", hint: "Deccan Institute of Technology", email: demoEmail("admin.deccan"), role: "institution_admin" },
  { label: "Institution Staff", hint: "Deccan Institute of Technology", email: demoEmail("staff.deccan"), role: "institution_staff" },
  { label: "University Admin", hint: "JNTU Hyderabad", email: demoEmail("admin.jntuh"), role: "university_admin" },
  { label: "Employer", hint: "Approved verifier", email: demoEmail("verifier.navayuga"), role: "verifier" },
  { label: "Regulator", hint: "Approved, broader scope", email: demoEmail("verifier.council"), role: "verifier" },
  { label: "Pending Employer", hint: "Awaiting AICTE approval", email: demoEmail("verifier.pending"), role: "verifier" },
  { label: "Student", hint: "Ananya Reddy, valid credential", email: demoEmail("student1"), role: "student" },
  { label: "Student (marks)", hint: "Arjun Mehta, marks mismatch", email: demoEmail("student4"), role: "student" },
];
