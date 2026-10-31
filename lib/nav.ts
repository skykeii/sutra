import type { AppRole } from "@/lib/auth/roles";

export interface NavItem {
  label: string;
  href: string;
}

export const NAV = {
  aicte: [
    { label: "Dashboard", href: "/aicte" },
    { label: "Alerts", href: "/aicte/alerts" },
    { label: "Verify records", href: "/aicte/records" },
    { label: "Quota audit", href: "/aicte/quota" },
    { label: "Duplicates", href: "/aicte/duplicates" },
    { label: "Fraud patterns", href: "/aicte/fraud" },
    { label: "Ask the Data", href: "/aicte/ask" },
    { label: "Reports", href: "/aicte/reports" },
    { label: "Approvals", href: "/aicte/approvals" },
    { label: "Audit trail", href: "/aicte/audit" },
    { label: "Eligibility rules", href: "/aicte/rules" },
  ],
  institution: [
    { label: "Dashboard", href: "/institution" },
    { label: "Upload students", href: "/institution/upload" },
    { label: "Students", href: "/institution/students" },
    { label: "Issues", href: "/institution/issues" },
    { label: "Upload history", href: "/institution/history" },
    { label: "Marksheet check", href: "/institution/marksheet" },
    { label: "Reports", href: "/institution/reports" },
    { label: "API and webhooks", href: "/institution/integration" },
  ],
  university: [
    { label: "Dashboard", href: "/university" },
    { label: "Results", href: "/university/results" },
    { label: "Certificates", href: "/university/certificates" },
  ],
  verifier: [
    { label: "Verify a student", href: "/verifier" },
    { label: "My requests", href: "/verifier/requests" },
  ],
  student: [
    { label: "My record", href: "/student" },
    { label: "Access and consents", href: "/student/consents" },
    { label: "Scholarships", href: "/student/scholarships" },
    { label: "Marksheet check", href: "/student/marksheet" },
  ],
} satisfies Record<string, NavItem[]>;

export function navFor(role: AppRole): NavItem[] {
  if (role === "aicte_admin" || role === "aicte_officer") return NAV.aicte;
  if (role === "institution_admin" || role === "institution_staff") return NAV.institution;
  if (role === "university_admin") return NAV.university;
  if (role === "verifier") return NAV.verifier;
  if (role === "student") return NAV.student;
  return [];
}
