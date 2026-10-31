import * as XLSX from "xlsx";
import { apiProfile, INSTITUTION_ROLES } from "@/lib/auth/api";
import { fileResponse, route } from "@/lib/http";
import { CSV_COLUMNS, toCsv } from "@/lib/validation/columns";

const SAMPLE = {
  apaar_id: "123456789012",
  name: "Student Name",
  dob: "2006-03-14",
  gender: "Female",
  nationality: "Indian",
  admission_date: "2026-08-01",
  admission_category: "Regular",
  quota_type: "CONVENOR",
  counselling_allotment_no: "CNV-2026-000001",
  is_nri: "false",
  oci_status: "none",
  is_foreign_national: "false",
  passport_no: "",
  mobile: "9876543210",
  email: "student@example.com",
  address: "12 Example Street, Hyderabad",
  prev_qualification: "Class 12",
  prev_marks_pct: "82.5",
  prev_pass_year: "2026",
  fee_status: "Paid",
  enrolment_status: "Active",
};

export const GET = route(async (req) => {
  await apiProfile(req, INSTITUTION_ROLES);
  if (req.nextUrl.searchParams.get("format") === "xlsx") {
    const sheet = XLSX.utils.json_to_sheet([SAMPLE], { header: [...CSV_COLUMNS] });
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Students");
    const buffer = XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
    return fileResponse(new Uint8Array(buffer), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "sutra_student_template.xlsx");
  }
  return fileResponse(toCsv(CSV_COLUMNS, [SAMPLE]), "text/csv; charset=utf-8", "sutra_student_template.csv");
});
