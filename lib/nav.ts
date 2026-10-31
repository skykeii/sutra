export interface NavItem {
  label: string;
  href: string;
  // Screens built in later phases stay visible but are not linked until they exist.
  ready: boolean;
}

export const NAV = {
  aicte: [
    { label: "Dashboard", href: "/aicte", ready: true },
    { label: "Alerts", href: "/aicte/alerts", ready: false },
    { label: "Quota audit", href: "/aicte/quota", ready: false },
    { label: "Duplicates", href: "/aicte/duplicates", ready: false },
    { label: "Fraud patterns", href: "/aicte/fraud", ready: false },
    { label: "Ask the Data", href: "/aicte/ask", ready: false },
    { label: "Reports", href: "/aicte/reports", ready: false },
    { label: "Approvals", href: "/aicte/approvals", ready: false },
    { label: "Audit trail", href: "/aicte/audit", ready: false },
    { label: "Eligibility rules", href: "/aicte/rules", ready: false },
  ],
  institution: [
    { label: "Dashboard", href: "/institution", ready: true },
    { label: "Upload students", href: "/institution/upload", ready: false },
    { label: "Students", href: "/institution/students", ready: false },
    { label: "Issues", href: "/institution/issues", ready: false },
    { label: "Upload history", href: "/institution/history", ready: false },
    { label: "Reports", href: "/institution/reports", ready: false },
    { label: "API and webhooks", href: "/institution/integration", ready: false },
  ],
  university: [
    { label: "Dashboard", href: "/university", ready: true },
    { label: "Results", href: "/university/results", ready: false },
    { label: "Certificates", href: "/university/certificates", ready: false },
  ],
  verifier: [
    { label: "Dashboard", href: "/verifier", ready: true },
    { label: "Verification requests", href: "/verifier/requests", ready: false },
  ],
  student: [
    { label: "My record", href: "/student", ready: true },
    { label: "Access and consents", href: "/student/consents", ready: false },
    { label: "Scholarships", href: "/student/scholarships", ready: false },
    { label: "Marksheet check", href: "/student/marksheet", ready: false },
  ],
} satisfies Record<string, NavItem[]>;
