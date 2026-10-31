import { CSV_COLUMNS } from "@/lib/validation/columns";

const jsonBody = (schema: unknown, example?: unknown) => ({ required: true, content: { "application/json": { schema, example } } });
const ok = (description: string, schema: unknown = { type: "object" }) => ({ description, content: { "application/json": { schema } } });
const errors = {
  "400": { $ref: "#/components/responses/Error" },
  "401": { $ref: "#/components/responses/Error" },
  "403": { $ref: "#/components/responses/Error" },
  "404": { $ref: "#/components/responses/Error" },
  "429": { $ref: "#/components/responses/Error" },
};
const secured = [{ ApiKey: [] }];
const pathParam = (name: string, description: string, example?: string) => ({ name, in: "path", required: true, description, schema: { type: "string" }, example });

const studentRows = {
  type: "object",
  required: ["program_id", "rows"],
  properties: {
    program_id: { type: "string", format: "uuid" },
    rows: { type: "array", maxItems: 500, items: { $ref: "#/components/schemas/StudentRow" } },
    update_existing: { type: "array", items: { type: "string" }, description: "APAAR IDs that may overwrite an existing record in this program." },
  },
};
const validationResult = { type: "object", properties: { stats: { type: "object" }, issues: { type: "array", items: { $ref: "#/components/schemas/Issue" } } } };

export function openApiDocument() {
  return {
    openapi: "3.0.3",
    info: {
      title: "Sutra API",
      version: "1.0.0",
      description: "Student-level data by APAAR ID: submit and validate records, check seats, verify credentials and answer scholarship portals. APAAR, DigiLocker and ePASS connections are simulated in this demo. Create keys in the portal under API and webhooks. Webhook events (over_intake, over_quota, cross_match, marks_mismatch, credential_revoked) carry an HMAC-SHA256 signature in the X-Signature header.",
    },
    servers: [{ url: "/api/v1" }],
    tags: [{ name: "Institutions" }, { name: "Verifiers" }, { name: "Universities" }, { name: "Scholarship portals" }, { name: "Public" }],
    paths: {
      "/students": { post: { tags: ["Institutions"], summary: "Create or update up to 500 enrolments", security: secured, requestBody: jsonBody(studentRows), responses: { "200": ok("Per-row validation results. Rows with errors are not saved.", validationResult), ...errors } } },
      "/students/validate": { post: { tags: ["Institutions"], summary: "Dry run: validate without saving", security: secured, requestBody: jsonBody(studentRows), responses: { "200": ok("Validation results", validationResult), ...errors } } },
      "/students/{apaarId}/verify": {
        get: {
          tags: ["Verifiers"],
          summary: "Get minimal verified fields, with the student's consent",
          description: "Needs a verifier key and an approved consent. Each consent works once.",
          security: secured,
          parameters: [pathParam("apaarId", "12-digit APAAR ID"), { name: "X-Consent-Token", in: "header", required: true, description: "The consent ID from your verifier portal.", schema: { type: "string", format: "uuid" } }],
          responses: { "200": ok("Only the fields in the consent scope", { type: "object", properties: { verified: { type: "boolean" }, institution: { type: "string" }, program: { type: "string" }, years: { type: "string" }, status: { type: "string" } } }), ...errors },
        },
      },
      "/programs/{id}/intake-status": { get: { tags: ["Institutions"], summary: "Approved, enrolled, quotas and fill %", security: secured, parameters: [pathParam("id", "Program ID")], responses: { "200": ok("Intake status"), ...errors } } },
      "/credentials/{recordId}": { get: { tags: ["Public"], summary: "Public status and signature check", parameters: [pathParam("recordId", "Record ID", "SUTRA-DEMO-VALID")], responses: { "200": ok("VALID, TAMPERED, REVOKED or EXPIRED with minimal fields"), ...errors } } },
      "/certificate-line/{studentId}": { get: { tags: ["Universities"], summary: "APAAR line and QR address for certificates", security: secured, parameters: [pathParam("studentId", "Student ID")], responses: { "200": ok("Certificate line", { type: "object", properties: { line: { type: "string", example: "APAAR ID: 1234-5678-9012" }, qr_url: { type: "string", nullable: true } } }), ...errors } } },
      "/scholarship/verify": {
        post: {
          tags: ["Scholarship portals"],
          summary: "Verify a student for a scheme, with consent",
          description: "The first call creates a request and asks the student. Poll with request_id. A new application after a fulfilled one for the same scheme and year is denied as a duplicate.",
          security: secured,
          requestBody: jsonBody({ type: "object", required: ["apaar_id", "scheme"], properties: { apaar_id: { type: "string" }, scheme: { type: "string" }, scope: { type: "array", items: { type: "string" } }, request_id: { type: "string", format: "uuid" } } }, { apaar_id: "900000000005", scheme: "State Merit-cum-Means Grant" }),
          responses: { "200": ok("Pending, Fulfilled with minimal fields, or Denied with a reason", { type: "object", properties: { request_id: { type: "string" }, status: { type: "string", enum: ["Pending", "Fulfilled", "Denied"] }, message: { type: "string" }, denial_reason: { type: "string" }, result: { type: "object", properties: { verified: { type: "boolean" }, enrolment_status: { type: "string" }, program: { type: "string" }, institution: { type: "string" }, latest_semester: { type: "integer" }, result_status: { type: "string" }, aggregate_pct: { type: "number" } } } } }), ...errors },
        },
      },
      "/university/results": { post: { tags: ["Universities"], summary: "Publish a signed results batch", security: secured, requestBody: jsonBody({ type: "object", required: ["rows"], properties: { rows: { type: "array", items: { type: "object", required: ["apaar_id", "semester", "percentage", "result_status"], properties: { apaar_id: { type: "string" }, semester: { type: "integer" }, percentage: { type: "number" }, sgpa: { type: "number" }, result_status: { type: "string", enum: ["Pass", "Fail", "Detained"] } } } } } }), responses: { "200": ok("Batch ID and digest"), ...errors } } },
      "/public-key": { get: { tags: ["Public"], summary: "Ed25519 public key for offline checks", responses: { "200": ok("Public key") } } },
      "/openapi.json": { get: { tags: ["Public"], summary: "This document", responses: { "200": ok("OpenAPI 3 document") } } },
    },
    components: {
      securitySchemes: { ApiKey: { type: "apiKey", in: "header", name: "X-API-Key" } },
      responses: { Error: { description: "Error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } } },
      schemas: {
        StudentRow: { type: "object", required: ["apaar_id", "name", "dob", "admission_date", "quota_type"], properties: Object.fromEntries(CSV_COLUMNS.map((c) => [c, { type: "string" }])) },
        Issue: { type: "object", properties: { rowNumber: { type: "integer" }, code: { type: "string" }, severity: { type: "string", enum: ["Error", "Warning", "Info"] }, message: { type: "string" }, suggestion: { type: "object", nullable: true } } },
        Error: { type: "object", properties: { error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" }, details: { nullable: true } } } } },
      },
    },
  };
}
