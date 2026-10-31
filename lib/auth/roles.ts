export type AppRole =
  | "aicte_admin"
  | "aicte_officer"
  | "institution_admin"
  | "institution_staff"
  | "university_admin"
  | "verifier"
  | "scholarship_portal"
  | "student";

export const ROLE_HOME: Record<AppRole, string> = {
  aicte_admin: "/aicte",
  aicte_officer: "/aicte",
  institution_admin: "/institution",
  institution_staff: "/institution",
  university_admin: "/university",
  verifier: "/verifier",
  scholarship_portal: "/portal-demo",
  student: "/student",
};

export const ROLE_LABEL: Record<AppRole, string> = {
  aicte_admin: "AICTE Admin",
  aicte_officer: "AICTE Officer",
  institution_admin: "Institution Admin",
  institution_staff: "Institution Staff",
  university_admin: "University Admin",
  verifier: "Verifier",
  scholarship_portal: "Scholarship Portal",
  student: "Student",
};
