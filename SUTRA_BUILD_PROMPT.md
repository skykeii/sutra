# BUILD BRIEF: SUTRA, an APAAR-Based Student Data Management & Verification System (SIH 2026, PS 26263)

**Product name: "Sutra"** (Sanskrit for "thread": the thread that links a student's identity, admission, marks and verified records). Use "Sutra" for the app title, logo wordmark, landing page, page titles, PDFs, README, package name and credential issuer text. Tagline: "One thread. Every verified student." Create a simple text-and-icon logo (no image files needed).

You are a senior full-stack engineer and product designer. Build the complete, working, demo-ready product described below in one session. Do not ask me questions. Where something is unspecified, make a sensible decision and record it in `DECISIONS.md` (one line each). The result must be directly presentable to SIH judges: polished UI, seeded data, live demo scenarios, zero placeholder pages.

---

## 0. WORKING RULES (token and quality discipline)

1. **Plan first.** Before coding, write `PLAN.md` (max 60 lines): folder structure, migration list, route list, build order. Then execute without re-explaining.
2. **Build in the phases of Section 13.** After each phase: run `tsc --noEmit` and `next lint`, fix errors, then `git commit -m "phase N: <name>"`. Do not proceed with failing type checks.
3. **Shared code over repeated code.** One validation module, one crypto module, one audit module, one APAAR adapter, one reusable `DataTable`, `KpiCard`, `StatusBadge`, `FilterBar`, `ExportMenu` component set. No copy-paste screens.
4. **No dead features.** Every button, link and tab must work against real seeded data. If something cannot be real (government systems), use the adapter pattern in Section 2 and label it "Simulated" in the UI.
5. **Keep code concise.** Minimal comments (only for security-critical or non-obvious logic). No unnecessary abstractions. Tests only for: validation engine, crypto (sign/verify, hash chain), HMAC matching, and a smoke script.
6. **Never print or log secrets or raw PII.** Never hardcode keys.
7. At the end produce `README.md` (setup in 5 steps, demo logins, demo script) and `DEMO.md` (the scenario walk-through of Section 14).

---

## 1. PRODUCT SUMMARY

AICTE gets student data from approved institutions only as aggregate numbers (except PGDM). We build a platform where institutions submit **student-level data keyed by APAAR ID**, the system **validates automatically**, AICTE **monitors in real time**, stakeholders **verify records securely with student consent**, and verified records are issued as **digitally signed, tamper-evident credentials with QR codes**. Extra module: **Marks Verification & Scholarship Shield** (university-sourced marks, eligibility checks, convenor/non-convenor seat audit, scholarship portal API).

Required chain (show it as a visible pipeline in the UI):
`Institution → Student Data Upload → APAAR Validation → Data Verification → AICTE Central Repository → Analytics & Monitoring → Authorized Verification`

Expected outcomes to make visibly true in the demo: authentic verifiable records linked to APAAR; real-time admission monitoring; excess-enrolment detection; data-driven governance.

---

## 2. STACK AND SETUP

| Layer | Choice |
|---|---|
| App | Next.js 14+ (App Router), TypeScript (strict), Tailwind, shadcn/ui, lucide-react |
| DB / Auth / Realtime / Storage | Supabase (Postgres, Auth, Row Level Security, Realtime) using `@supabase/supabase-js` and `@supabase/ssr` |
| Validation | Zod (schemas) + custom rule engine |
| Charts | Recharts. India state view: a simple tile-grid map component (one tile per state, coloured by metric); no external map tiles |
| File parsing | PapaParse (CSV), SheetJS `xlsx` (Excel read and export) |
| PDF / QR | `pdf-lib`, `qrcode` |
| Crypto | Node `crypto` only (Ed25519 signing, HMAC-SHA256, AES-256-GCM, SHA-256) |
| AI | Anthropic SDK, model `claude-sonnet-4-6`. Used only for: anomaly explanations and Ask-the-Data. Must work with a deterministic fallback if `ANTHROPIC_API_KEY` is missing |
| API docs | OpenAPI 3 JSON served at `/api/v1/openapi.json`, rendered at `/docs` with Swagger UI (`swagger-ui-react`) including "Try it out" |
| Rate limiting | Simple in-DB or in-memory token bucket helper (`lib/ratelimit.ts`) |
| Hosting | Vercel + Supabase cloud (must also run locally with `npm run dev`) |

### Adapter pattern (be honest in UI and docs)
Real government systems cannot be called from a hackathon. Create interface + mock implementation for each, in `lib/adapters/`:
- `apaarAdapter` → `lookup(apaarId)` returns `{name, dob, gender, valid}`; mock reads table `mock_apaar_registry`.
- `digilockerAdapter` → `pushRecord(credential)`; mock writes to `simulated_digilocker` table and the UI shows a "Simulated" chip.
- `epassAdapter` → the mock scholarship portal (Section 8).
Each adapter has a one-line comment on what the real integration would swap in.

### Environment variables (create `.env.example`. The user is a beginner and will only fill in the Supabase values in `.env.local` by hand. `npm run keys` must generate ED25519, HMAC and FIELD_ENC keys itself and write them into `.env.local` automatically, skipping any that already exist, and set `APP_BASE_URL=http://localhost:3000` and `DEMO_MODE=true` by default)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (may be the newer "publishable" key), `SUPABASE_SERVICE_ROLE_KEY` (server only; may be the newer "secret" key), `DATABASE_URL` (Supabase Postgres connection string, session-pooler URI, used only by `npm run migrate`), `ANTHROPIC_API_KEY` (optional), `ED25519_PRIVATE_KEY_PEM`, `ED25519_PUBLIC_KEY_PEM`, `HMAC_MATCH_KEY` (32 bytes hex, for APAAR hash matching), `FIELD_ENC_KEY` (32 bytes hex, AES-256-GCM), `APP_BASE_URL`.

### Setup deliverables
- `supabase/migrations/*.sql` (schema, RLS, triggers, views, functions), applied in order.
- `npm run migrate` (applies the SQL files in order to `DATABASE_URL` using the `pg` package, tracking applied files in a `_migrations` table, idempotent), `npm run seed` (idempotent, deterministic; Section 10; creates demo auth users through the Supabase Admin API with `email_confirm: true` so no email is ever sent), `npm run keys`, `npm run test`, `npm run smoke`.
- Add a `npm run setup` that runs keys, migrate and seed in order, and prints clear, friendly error messages (for example "DATABASE_URL missing in .env.local") instead of stack traces.
- The whole app must run on free tiers (Supabase free, local `npm run dev`); do not use any paid service.

---

## 3. ROLES AND PORTALS

Roles (enum `app_role`): `aicte_admin`, `aicte_officer`, `institution_admin`, `institution_staff`, `university_admin` (examination body), `verifier` (employer or regulator, must be AICTE-approved), `scholarship_portal` (service account, API-only), `student`.

Single login page. After login, redirect by role. Seeded demo accounts shown on the login page as a "Demo logins" panel with one-click fill (password for all: `Demo@12345`). Use Supabase Auth email + password for the demo accounts.
- **Student and consent OTP:** generate a 6-digit OTP server-side, store hashed with 5-minute expiry, and display it in a "Simulated SMS inbox" panel in the UI (label clearly as simulated).
- **AICTE admin 2FA:** implement Supabase TOTP MFA enrolment and challenge on `/settings/security`; enforce it for `aicte_admin` unless env `DEMO_MODE=true` (then show a banner "MFA enforced in production").

Portals (one app, route groups, shared layout with role-aware sidebar, top bar with notifications bell and user menu):
`/aicte/*`, `/institution/*`, `/university/*`, `/verifier/*`, `/student/*`, public `/verify/[recordId]`, public `/transparency`, `/docs`, `/portal-demo` (mock scholarship portal).

---

## 4. DATA MODEL (Postgres; all tables have `id uuid pk`, `created_at`, `updated_at` unless noted)

- `institutions`: aicte_id, name, state, district, type, status, contact_email, university_id (affiliating).
- `profiles`: user_id (auth), role, institution_id?, university_id?, verifier_org_id?, apaar_hash? (for students), full_name.
- `programs`: institution_id, name, level (UG/PG/Diploma/PGDM), academic_year, **approved_intake**, `supernumerary_cap`, duration_years.
- `seat_matrix`: program_id, quota_type enum (`CONVENOR`, `NON_CONVENOR`, `NRI`, `SUPERNUMERARY`, `LATERAL`), seats_allowed. Sum of non-supernumerary quotas must equal approved_intake (enforce in a check function and in the seeder). Quota labels are configurable via a `quota_labels` table (state-specific naming).
- `mock_apaar_registry`: apaar_id (12 digits, unique), name, dob, gender. 5,000 rows. (Simulates the national registry.)
- `students`: apaar_hash (HMAC-SHA256 of apaar_id using `HMAC_MATCH_KEY`, unique index), apaar_id_enc (AES-GCM encrypted), name, dob, gender, nationality, status flags: `is_nri`, `oci_status` (none/holder/applied), `is_foreign_national`, `passport_no_enc`, `mobile_enc`, `mobile_hash`, `email_enc`, `email_hash`, `address_hash`, `prev_qualification`, `prev_marks_pct`, `prev_pass_year`, `created_by_institution_id`.
- `enrolments`: student_id, institution_id, program_id, admission_date, quota_type, admission_category (Regular/Supernumerary/Lateral), counselling_allotment_no?, fee_status, enrolment_status (Active/Withdrawn/PassedOut), validation_status (Pending/Clean/Flagged/Verified/Revoked), upload_batch_id, `version int`.
- `enrolment_history`: full snapshot on each update (who, when, before/after JSON with PII fields masked).
- `upload_batches`: institution_id, program_id, file_name, row_count, error_count, warning_count, status (Preview/Submitted/Rejected), submitted_by.
- `validation_issues`: enrolment_id?, batch_id, row_number, rule_code, severity (Error/Warning/Info), message, suggestion (jsonb: `{field, current, proposed}`), resolved bool. **Never stores raw PII; store field names and masked values.**
- `cross_matches`: apaar_hash, enrolment_a, enrolment_b, status (Open/Resolved), visible only to AICTE.
- `fraud_clusters`: cluster_type (SHARED_MOBILE/SHARED_EMAIL/SHARED_ADDRESS/MULTI_FULLTIME/CATEGORY_SPIKE), key_hash, member_count, institution_id?, explanation, status.
- `credentials`: record_id (public short id), enrolment_id, payload (jsonb), signature, issued_at, expires_at, status (Valid/Revoked), revoked_reason.
- `revocations`: record_id, reason, revoked_by, at.
- `verifier_orgs`: name, type (Employer/Regulator), status (Pending/Approved/Rejected), approved_by.
- `consents`: student_id, grantee_type (verifier_org/scholarship_portal), grantee_id, purpose, scope (array of field names), expires_at, revoked_at, otp_hash.
- `access_log`: who, grantee, student_id, fields_returned, purpose, at. (Shown to students as "who accessed my record".)
- `api_keys`: institution_id or portal_id, key_prefix, key_hash (SHA-256), scopes, revoked_at, last_used_at.
- `webhooks`: owner_id, url, events (array). Deliver over `fetch` with an HMAC signature header; log deliveries.
- `audit_log` (append-only, hash-chained; Section 5.6): seq bigserial, actor_id, actor_role, action, entity, entity_id, meta jsonb (no raw PII), prev_hash, hash, at.
- `audit_anchors`: date, last_seq, last_hash, signature (Ed25519-signed daily anchor).
- `approvals` (maker-checker): action_type (CHANGE_INTAKE, REVOKE_RECORD, APPROVE_VERIFIER), payload, requested_by, approved_by, status.
- `university_results`: university_id, apaar_hash, semester, course_code?, sgpa/percentage, result_status (Pass/Fail/Detained), batch_id, batch_signature.
- `eligibility_rules`: program_id or level, rule_type (MIN_QUALIFYING_PCT, MAX_AGE, REQUIRED_STREAM, etc.), params jsonb.
- `scholarship_requests`: portal_id, apaar_hash, scheme, status (Pending/ConsentGranted/Fulfilled/Denied), result jsonb (minimal), created_at.
- `marksheet_submissions`: student_id, semester, claimed_pct, verified_pct, outcome (Match/Mismatch/NotFound).
- `simulated_digilocker`, `simulated_sms` (for OTP display).

Create SQL **views** for dashboards: `v_intake_status` (per program: approved, enrolled regular, enrolled supernumerary, fill %), `v_quota_status` (per program per quota), `v_state_summary`, `v_category_summary` (NRI/OCI/FN counts), `v_submission_status` (per institution). Enable Supabase Realtime on `validation_issues`, `cross_matches`, `fraud_clusters`, `enrolments`, `audit_log`.

---

## 5. SECURITY (highest priority; implement exactly)

### 5.1 Authentication
Supabase Auth; sessions via httpOnly cookies; AICTE admin MFA (Section 3). Verifiers cannot access anything until `verifier_orgs.status='Approved'` (approval needs maker-checker).

### 5.2 Authorization (RBAC + least privilege)
- **Row Level Security on every table**, deny by default. Policies:
  - Institution roles: read/write only rows where `institution_id` = their own. Cannot read `cross_matches`, `fraud_clusters`, other institutions' issues, or `audit_log`.
  - University roles: only their own `university_results` and read-only aggregates for their affiliated students.
  - AICTE roles: read all; `aicte_officer` cannot change intake or approve verifiers (admin only, via maker-checker).
  - Student: only own record, own consents, own access log.
  - Verifiers/portals: no direct table access; only through server API routes that return minimal fields after consent check.
- Service-role key is used only in server code (`lib/supabase/admin.ts`, marked `server-only`). Write an RLS test script (`scripts/rls-test.ts`) proving a college user cannot read another college's rows; run it in `npm run smoke`.

### 5.3 Input security
- Upload: accept only `.csv`/`.xlsx`, max 5 MB, max 10,000 rows, MIME + extension check.
- **Formula injection:** reject or neutralise any cell beginning with `=`, `+`, `-`, `@` (except valid negative numbers in numeric columns), tab or CR. Exports also prefix such cells with `'`.
- Every API input validated by Zod (types, lengths, enums). All DB access via parameterised queries / Supabase client; no string-built SQL.
- Security headers in `next.config.js`: CSP, X-Frame-Options DENY, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, HSTS.
- Rate limits: login attempts, OTP requests (5/hour per student), verification lookups (30/min per verifier, plus a bulk-scrape alert), API keys (per key).

### 5.4 Cryptography (`lib/crypto/`)
- `hmacMatch(apaarId)`: HMAC-SHA256 with `HMAC_MATCH_KEY`, hex. **Cross-institution duplicate detection compares only these hashes.** (Plain SHA-256 of a 12-digit ID is brute-forceable, so the keyed hash is mandatory.) Institutions never see another institution's identity; they receive only "possible existing enrolment elsewhere; contact AICTE". AICTE alone sees both institutions.
- `encryptField/decryptField`: AES-256-GCM with random 12-byte IV, stored as `iv:tag:cipher` base64. Used for mobile, email, passport, apaar_id. Decrypt only server-side, only when role/purpose allows; UI shows masked values by default (`98••••••21`) with an audited "Reveal" action for AICTE admin only.
- `sign/verify`: Ed25519 over canonical JSON (sorted keys). Public key exposed at `/.well-known/aicte-public-key.json` and `/api/v1/public-key`.
- API keys: shown once on creation, stored as SHA-256 hash, prefix retained for display.

### 5.5 Isolation of validation
Validation runs as pure TypeScript functions inside a server route (serverless, one invocation per request). It receives only the batch rows plus lookups it is explicitly handed; it has no direct DB write access, and returns issues which the route persists. Document in README that the engine is designed to move into containerised workers at national scale (no Kubernetes now).

### 5.6 Tamper-evident audit trail (**full feature, a headline differentiator**)
- Every create/update/view/verify/revoke/login/export/API call/validation outcome writes an `audit_log` row via one function `appendAudit()`. Validation entries record rule code, counts and timestamp, never raw data.
- **Hash chain:** `hash = SHA256(prev_hash || canonicalJSON({seq, actor_id, actor_role, action, entity, entity_id, meta, at}))`. Implement the insert in a Postgres function `append_audit()` using an advisory lock so seq and prev_hash are race-safe.
- **Append-only:** triggers raise an exception on UPDATE/DELETE/TRUNCATE of `audit_log`; revoke those privileges from all roles; RLS limits reads to AICTE roles.
- **Integrity check:** page `/aicte/audit` with a "Verify audit integrity" button that recomputes the whole chain (stream in chunks) and shows a green "Chain intact: N entries verified" or a red "Tampering detected at entry #seq" with the exact break location. Include a "Simulate tampering" **demo-only** button (works only when `DEMO_MODE=true`, runs a service-role SQL update that bypasses the trigger in a transaction flagged for demo) so judges can watch detection fire, then a "Restore" button.
- **Daily anchor:** a script/route creates `audit_anchors` (date, last_seq, last_hash, Ed25519 signature). Public page `/transparency` lists anchors and the current head hash, and lets anyone paste a hash to check against the anchors. Add a "Create anchor now" button for the demo.
- Audit viewer: filterable table (actor, action, entity, date), CSV export, entry detail drawer showing prev_hash/hash.

### 5.7 Privacy and consent (minimal, as PS #8 requires; no separate "wallet" product)
- Data minimisation: every verifier/portal response is built from an allow-list of fields tied to the consent `scope`.
- Consent flow: verifier requests → student receives a request notification in the student portal → student approves (OTP-confirmed), choosing expiry (default 7 days) → verifier gets a one-time view. Students can revoke from a simple "Access & consents" page, which also lists the `access_log` for their record. Every step audited.
- Public verify page shows only: record validity, institution, program, years, status. No DOB, mobile, email.

### 5.8 AI safety
The Claude API never receives raw student data. Inputs are limited to aggregates, counts, rule codes, and masked tokens (`Student#4821`). Free text from uploads is never placed into prompts. Ask-the-Data cannot produce SQL (Section 9.4). Every AI call is audited (prompt template id, not content).

### 5.9 Sensitive actions: maker-checker
Changing approved intake, revoking a credential, and approving a verifier org create an `approvals` row; a *different* `aicte_admin` must approve. UI: `/aicte/approvals`.

### 5.10 Compliance note
Add `/privacy` page mapping features to DPDP Act principles (consent, purpose limitation, data minimisation, access, correction/withdrawal, security safeguards, breach logging via audit trail).

---

## 6. VALIDATION ENGINE (`lib/validation/`)

Single module used by upload preview, single-record form, and external API. Signature: `validateBatch(rows, context) → {issues[], cleanRows[], stats}`. Each rule: `{code, severity, check, message, suggest?}` with plain-language messages, **a proposed fix wherever possible** (Section 9.5).

| Code | Severity | Rule |
|---|---|---|
| `APAAR_MISSING` | Error | Empty APAAR ID |
| `APAAR_FORMAT` | Error | Not exactly 12 digits |
| `APAAR_NOT_FOUND` | Error | Not in registry (adapter lookup) |
| `APAAR_NAME_MISMATCH` | Error | Name differs from registry beyond fuzzy tolerance (normalise case/spaces/initials; Levenshtein ≤ 2 → Warning with suggestion instead) |
| `APAAR_DOB_MISMATCH` | Error | DOB differs from registry; suggestion = registry DOB |
| `DUP_IN_FILE` | Error | Same APAAR twice in the upload |
| `DUP_IN_DB` | Error | Same APAAR already enrolled in same program/year at this institution (offer "update existing") |
| `DUP_FUZZY` | Warning | Same name+DOB+mobile hash with a different APAAR |
| `CROSS_INST_DUP` | Warning (to institution) / Alert (to AICTE) | Active full-time enrolment elsewhere with overlapping dates, found via `apaar_hash` match |
| `OVER_INTAKE` | Error + AICTE alert | Regular enrolments would exceed approved intake |
| `OVER_SUPERNUMERARY` | Error + AICTE alert | Supernumerary count exceeds cap |
| `OVER_QUOTA` | Error + AICTE alert | A quota in `seat_matrix` exceeded (Section 8) |
| `QUOTA_NO_ALLOTMENT` | Error | CONVENOR quota without `counselling_allotment_no` |
| `FN_NEEDS_PASSPORT` | Error | NRI/OCI/FN without passport/OCI number |
| `SUPERNUM_BAD_CATEGORY` | Error | Supernumerary admission without NRI/OCI/FN/eligible category |
| `NATIONALITY_MISMATCH` | Warning | Indian national with only a passport and FN flag, or FN flag with Indian nationality |
| `DOB_AFTER_ADMISSION` | Error | Admission date before DOB |
| `AGE_OUT_OF_RANGE` | Warning | Age at admission outside program norms |
| `QUAL_YEAR_AFTER_ADMISSION` | Error | Prior qualification year after admission year |
| `ELIGIBILITY_FAIL` | Error | Fails `eligibility_rules` using verified university marks (Section 8) |
| `ELIGIBILITY_NO_DATA` | Warning | No verified marks found |
| `FORMULA_INJECTION` | Error | Cell starts with `= + - @` |
| `FIELD_FORMAT` | Error | Bad email/mobile/date/enum |

Severity behaviour: Errors block that row from submission (other rows can go through); Warnings allow submission but set `validation_status=Flagged` and appear in AICTE review. Alerts push to AICTE realtime feed and fire webhooks.

---

## 7. FEATURES BY REQUIREMENT (implement every one)

**R1 Secure upload/update API and platform.** Institution upload wizard `/institution/upload`: (1) pick program + academic year, (2) download CSV/Excel template or drop file, (3) client-side parse, server validation, preview table with row-level colour coding and filter by error type, (4) fix inline or apply suggested fixes (Section 9.5), (5) confirm and submit. Re-upload of an existing APAAR updates the record, bumps `version`, writes `enrolment_history`. Also: single-student add/edit form, and API `POST /api/v1/students` (Section 11). Show the pipeline stepper ("Uploaded → APAAR validated → Rules checked → Verified → In AICTE repository") per batch.

**R2 Data fields.** Implement all fields listed in Section 4. Program-level (AICTE-set): approved intake, supernumerary cap, seat matrix. Student-level: APAAR ID, name, DOB, gender, nationality, program, admission date, category, quota, NRI status, OCI status, FN status, passport/OCI number, mobile, email, previous qualification/marks/year, fee status, enrolment status. Institution dashboard shows approved intake vs actual enrolment vs supernumerary live.

**R3 Automated validation.** Section 6. Include a validation results page per batch with counts by rule, and a rules reference page `/docs/rules` auto-generated from the rule registry.

**R4 Real-time dashboards.**
- *AICTE* `/aicte`: KPI cards (institutions reporting, students recorded, intake vs enrolled national fill %, open alerts, cross-institution matches, verified records); India tile-map coloured by fill % or alert count with state drill-down; institution league table with filters (state, level, program, year, category); **live alert feed** (Supabase Realtime, toast on new alert); over-intake list; submission status tracker (who has/hasn't submitted); NRI/OCI/FN category breakdown; trend line charts.
- *Institution* `/institution`: per-program intake meter (e.g. "58 / 60 filled", with quota breakdown bars), pending issues, upload history, records awaiting verification, API key page, webhook page.
- Dashboards must update without refresh when a new upload is submitted during the demo.

**R5 Secure verification for authorised stakeholders.** Verifier org signup → AICTE approval queue (maker-checker). Verifier portal `/verifier`: enter APAAR ID (or scan/paste QR link) → system creates consent request → student approves (simulated SMS OTP) → returns minimal verified result ("Verified ✓: B.Tech CSE, XYZ Institute, 2024-2028, Active") → downloadable **verification receipt PDF** with its own QR. Regulators may be given broader scope by AICTE (configurable scope per org type). All lookups rate-limited and in `access_log`.

**R6 Verifiable student records ("generation").** On a clean + AICTE-verified enrolment, auto-generate a **Verifiable Credential** shaped after W3C VC (JSON): `@context`, `type: ["VerifiableCredential","EnrolmentCredential"]`, `issuer` (AICTE DID-style id), `issuanceDate`, `expirationDate`, `credentialSubject` (apaar id masked + hash reference, institution, program, admission year, expected completion, status), `credentialStatus` (revocation URL), `proof` (Ed25519 signature, public key id). Signed, stored in `credentials`, with PDF (pdf-lib, branded) containing QR → `/verify/[recordId]`. Public verify page checks signature + revocation and shows big **VALID / TAMPERED / REVOKED** status, minimal fields, and a "Check signature offline" explanation with the public key. Include a "Verify by uploading credential JSON" box. "Add to DigiLocker" button → `digilockerAdapter` (simulated; shows chip "Simulated: requires AICTE issuer onboarding"). Revocation (maker-checker) flips the public page to REVOKED. **Roadmap slide only (don't build): ABC credit sync, ZKPs.**

**R7 Integration APIs.** Section 11. Plus a `/institution/integration` page: API key create/revoke (shown once), webhook registration, sample curl snippets, link to `/docs`, CSV templates.

**R8 Security, privacy, RBAC, audit, consent.** Section 5 in full.

**R9 Reports** `/aicte/reports` and institution-scoped reports: templates = institution-wise enrolment, over-intake, category-wise (NRI/OCI/FN), state-wise trend, non-compliance/submission, quota-wise (convenor/non-convenor) audit, cross-institution duplicates (AICTE only), scholarship-eligibility mismatches. Filters (state, year, program, institution). Export **PDF, Excel, CSV**. "Accreditation pack" button bundles several reports for one institution into one PDF with cover page. Each export is audited.

**R10 APAAR on certificates** `/university/certificates` (degree-awarding bodies): upload student list or select enrolments → configure layout (position of "APAAR ID: xxxx-xxxx-xxxx" beside Student ID, optional QR, font size) with live preview → batch generate PDFs → ZIP download. Also API `GET /api/v1/certificate-line/{studentId}` returning the formatted line + QR URL for universities' own software. Include a sample certificate template in the preview.

---

## 8. MARKS VERIFICATION & SCHOLARSHIP SHIELD (additional module)

**Principle:** we never inspect marksheet images. The **university is the source of truth**: it submits results per APAAR; anything a student/college claims is compared against it.

1. **University portal** `/university`: upload semester results CSV (apaar_id, semester, percentage/SGPA, result_status) or API. Each batch is signed (Ed25519 over a batch digest), stored, audited. Dashboard: results published, batches, verification queries received.
2. **Marksheet check:** student/college enters claimed marks (or uploads marksheet data fields) → system compares with `university_results` by `apaar_hash` → outcome Match / Mismatch (show difference, e.g. "Claimed 78%, university record 54%") / NotFound. Stored in `marksheet_submissions`; mismatches go to AICTE alerts as `MARKS_MISMATCH`.
3. **Admission eligibility:** when an enrolment is validated, fetch verified qualifying marks and evaluate `eligibility_rules` (min qualifying %, age, stream; configurable per program/level) → `ELIGIBILITY_FAIL` / `ELIGIBILITY_NO_DATA`. Rules editable by AICTE admin at `/aicte/rules`.
4. **Seat matrix audit (convenor / non-convenor):** each program's `seat_matrix` (CONVENOR, NON_CONVENOR, NRI, SUPERNUMERARY, LATERAL) is checked at every admission. Flags: `OVER_QUOTA`, `QUOTA_NO_ALLOTMENT`, intake OK overall but one quota overflowing. Institution dashboard shows quota bars; AICTE has a quota audit report and drill-down. Quota labels configurable per state.
5. **Scholarship API for ePASS-style portals:** `POST /api/v1/scholarship/verify {apaar_id, scheme, scope}` with a portal API key. Flow: portal requests → student sees request in student portal → approves with OTP → portal calls again (or polls) and receives **only**: `{verified: true, enrolment_status, program, institution, latest_semester, result_status, aggregate_pct}`. Never the full marksheet. Also checks: student is Active (not dropped/failed/detained), no duplicate claim for same scheme+year across portals (via `apaar_hash`), and institution not flagged for quota violations.
6. **Mock scholarship portal** `/portal-demo` (clearly labelled "Simulated ePASS-style portal"): a student applies, the flow above runs live, and the portal shows the verified result or the denial reason (e.g. "Student detained in Sem 4", "Duplicate claim detected", "Marks mismatch").

New alert codes: `MARKS_MISMATCH`, `SCHOLARSHIP_DUP_CLAIM`, `SCHOLARSHIP_INELIGIBLE`.

---

## 9. DIFFERENTIATORS

### 9.3 Tamper-proof records (FULL, a showcase feature)
Everything in Section 5.6 (hash-chained append-only audit, integrity checker with exact break location, demo tamper/restore, signed daily anchors, public `/transparency`) plus Section R6 (signed credentials, signed QR, public verifier, revocation list). Add a **"Fake QR test"** on `/verify`: a button that loads a forged credential (one field altered) and shows TAMPERED, to demonstrate the signature check. Show a small "Integrity: ✓ chain intact" badge in the AICTE top bar (cached result, refreshed on demand).

### 9.4 Ask the Data (only what is not covered above)
AICTE-only chat box `/aicte/ask` (also a floating button on the AICTE dashboard). **Safe design:** Claude maps the question to one entry in a **catalog of pre-approved parameterised queries** (`lib/ask/catalog.ts`, about 15 entries: over-intake institutions by state/program/year, NRI/OCI/FN counts by state, fill rate by program, cross-institution duplicates count, quota violations, submission status, marks mismatches, scholarship denials, top programs by enrolment, etc.), returning `{queryId, params}` validated by Zod. The app runs that query itself and renders a table or chart (auto-picked) plus a one-sentence plain-language summary (the summary is generated from aggregate results only). If no query matches, reply "I can't answer that yet" and list suggested questions. Show an "Example questions" row of clickable chips. Fallback without API key: keyword matcher over the catalog. Never expose generated SQL or raw rows with PII. Audit every use.

### 9.5 Smart Fix-it Upload Wizard (the part beyond Section R1)
Each issue carries `suggestion`. Preview grid supports: per-cell "Apply suggestion" buttons, a **bulk "Apply all safe fixes"** (date formats like dd/mm/yyyy→ISO, trimming, name casing, DOB/name replaced with the APAAR registry value, phone formatting), a summary ("312 issues, 270 auto-fixable"), undo, plain-language messages ("Row 47: DOB 1999 doesn't match APAAR record (2001). Use 2001?"). Downloadable "error report" CSV with fixes. Fixes never silently overwrite: all applied fixes are listed before submit and audited.

### 9.6 Ghost Student & Fraud Pattern Detection (the part beyond Section 6)
Nightly-style job (also a "Run detection now" button) creating `fraud_clusters`: shared mobile hash across ≥ 5 students; shared email hash ≥ 3; shared address hash ≥ 8; one APAAR in two full-time programs (links to CROSS_INST_DUP); category spike (a quota category share > 3× peer median for the same program/state); last-48-hours admission surge (> 60% of intake admitted in final 2 days before submission). Page `/aicte/fraud`: cluster list with severity, member count (members shown as masked ids), AI-written plain-language explanation (aggregates only, deterministic template fallback), status workflow (Open → Under review → Cleared/Escalated), and drill-down. Counts surface on the AICTE dashboard.

*(Not in scope, do not build: institution trust score, consent wallet as a standalone feature.)*

---

## 10. SYNTHETIC DATA (`npm run seed`; deterministic with a fixed seed; idempotent; use `@faker-js/faker` with `en_IN` locale and `faker.seed(2026)`)

- **Mock APAAR registry:** 5,000 people (12-digit IDs, realistic Indian names, DOB 1998-2007, gender).
- **Universities:** 4 (e.g. JNTU Hyderabad, VTU, Anna University, SPPU) with `university_admin` users.
- **Institutions:** 24 across 10 states (Telangana, Karnataka, Maharashtra, Tamil Nadu, Delhi, Uttar Pradesh, Gujarat, Rajasthan, West Bengal, Kerala), mix of engineering, management (PGDM), pharmacy, architecture. Each has an admin user and 1 staff user.
- **Programs:** ~3 per institution (about 70), academic year 2026-27, approved intake 30-180, supernumerary cap, and a seat matrix summing to intake (e.g. 60% CONVENOR, 30% NON_CONVENOR, 10% NRI/others; plus supernumerary).
- **Students/enrolments:** ~2,200 enrolments across ~2,000 students. Mix: ~10% NRI/OCI/FN with passport numbers, ~8% lateral entry, ~3% withdrawn. Most programs 70-98% filled.
- **University results:** semesters 1-4 for ~1,500 students, plus qualifying marks for admissions. Realistic distribution; a few Fail/Detained.
- **Verifiers:** 3 orgs (2 employers approved, 1 regulator approved, 1 employer pending). **Scholarship portal:** 1 service account (API key printed once by seed).
- **Students with logins:** 10 demo students, all with consent flows working.
- Pre-generated credentials for verified enrolments, pre-existing audit chain (≥ 300 entries), one anchor, a few historical dashboard trends (spread `created_at` over the past 90 days).
- Provide ready-to-upload demo files in `/demo-files/`: `clean_upload.csv`, `messy_upload.csv` (about 120 rows containing a bit of everything), `university_results.csv`, `forged_credential.json`.

### Planted demo scenarios (use fixed names/ids, document in DEMO.md)
1. **Over-admitting college:** Institution "Deccan Institute of Technology" (Hyderabad), program CSE intake 60 has 58 enrolled; `messy_upload.csv` adds 8 more, so OVER_INTAKE fires, AICTE live feed alerts, intake meter turns red, webhook delivered.
2. **Student in two colleges:** one APAAR active at two institutions in different states; CROSS_INST_DUP appears for AICTE only (institution B sees only "possible enrolment elsewhere").
3. **Fake QR:** `forged_credential.json` and the "Fake QR test" show TAMPERED; a revoked record shows REVOKED.
4. **Mismatched marksheet:** student claims 78% in Sem 4, university record says 54% → MARKS_MISMATCH; scholarship portal denial.
5. **Quota abuse:** a college with NON_CONVENOR seats filled beyond matrix → OVER_QUOTA; CONVENOR student without allotment number.
6. **Ghost cluster:** 40 students sharing 3 mobile numbers at one college → fraud cluster.
7. **Audit tamper:** demo tamper button → integrity checker pinpoints the entry.
8. **Fixable messy upload:** 300+ issues, most auto-fixable through "Apply all safe fixes".

---

## 11. EXTERNAL API (`/api/v1`, header `X-API-Key`, JSON, rate-limited, audited, documented in OpenAPI + Swagger at `/docs`)

- `POST /students`: create/update one or many (max 500) enrolments by APAAR ID; returns per-row validation results.
- `POST /students/validate`: dry run, no save.
- `GET /students/{apaarId}/verify`: verifier key + consent token; minimal fields.
- `GET /programs/{id}/intake-status`: approved, enrolled, quotas, fill %.
- `GET /credentials/{recordId}`: public status + signature check.
- `GET /certificate-line/{studentId}`: APAAR line + QR URL for certificates.
- `POST /scholarship/verify`: Section 8.5.
- `POST /university/results`: results batch (university key).
- `GET /public-key`, `GET /openapi.json`.
- Webhook events: `over_intake`, `over_quota`, `cross_match`, `marks_mismatch`, `credential_revoked`; HMAC-signed header `X-Signature`.
Errors use a consistent `{error:{code,message,details}}` shape; never leak stack traces.

---

## 12. UI / UX STANDARDS

- Clean government-tech look: deep navy primary, saffron accent used sparingly, white cards, generous spacing, readable 14-16px text. Light mode only is fine. Fully responsive (judges may use phones). Accessible contrast and focus states.
- Plain language everywhere, no jargon: "Over intake" explained by tooltip; every rule code has a human message.
- Every page has loading skeletons, empty states with guidance, and error states.
- Status colours consistent: green = verified/clean, amber = warning/flagged, red = error/alert/revoked, grey = pending.
- Landing page `/`: product name, one-line value prop, the 7-step pipeline graphic, role cards (each leads to login), and a small "Simulated integrations" disclosure for APAAR/DigiLocker/ePASS.
- Top bar: global search (APAAR hash prefix for AICTE, student for institution), notifications, integrity badge (AICTE).
- Student portal `/student`: my record card with QR credential download, "Add to DigiLocker (simulated)", pending consent requests (approve/deny with OTP), "Who accessed my record", scholarship requests, marksheet check status.

### Expected final output per user
- **AICTE admin/officer:** live national dashboard and map, alert feed, quota/fraud/duplicate pages, Ask the Data, reports and exports, verifier approvals and maker-checker queue, audit integrity page, rules editor.
- **Institution:** intake and quota meters, upload wizard with auto-fix, issue list, history, API keys and webhooks, reports, certificate-ready records.
- **University:** results upload, verification stats, certificate generator with APAAR ID.
- **Employer/Regulator:** verification request, consent status, minimal verified result, receipt PDF.
- **Student:** record, credential, consents, access log, scholarship requests.
- **Scholarship portal (simulated):** consent-based verified marks retrieval, denial reasons.
- **Public:** `/verify/[recordId]` and `/transparency`.

---

## 13. BUILD PHASES (commit after each; run typecheck + lint)

1. **Foundation:** project scaffold, Tailwind/shadcn theme, Supabase clients, migrations (all tables, enums, RLS, views, triggers), crypto module + tests, `append_audit()` + hash chain + tests, env/keys script, auth + role redirect + login with demo panel, layout shells for all portals.
2. **Seed:** full seeder (Section 10) incl. planted scenarios, credentials, audit chain, demo files. Run it and verify counts.
3. **Validation engine + Institution upload wizard (incl. fix-it, history, single add, pipeline stepper)** with unit tests for every rule code.
4. **Dashboards:** institution + AICTE (map, KPIs, live feed with Realtime, filters), alerts, webhooks.
5. **Verification and credentials:** consent flow, verifier portal, credential generation/signing/PDF/QR, public verify page, fake-QR test, revocation with maker-checker, DigiLocker adapter, student portal.
6. **Audit and security pages:** audit viewer, integrity checker, tamper demo, anchors, `/transparency`, `/privacy`, approvals queue, security headers, rate limits, RLS test.
7. **Marks and scholarship module:** university portal, marksheet check, eligibility rules, seat matrix audit, scholarship API, `/portal-demo`.
8. **Reports and APIs:** report builder with PDF/Excel/CSV, accreditation pack, certificate tool, OpenAPI + Swagger, API keys UI.
9. **AI features:** Ask the Data (catalog), fraud detection page, anomaly explanations, with fallbacks.
10. **Polish:** landing page, empty/loading states, responsive pass, README, DEMO.md, `npm run smoke` (runs RLS test, seed counts, validation on `messy_upload.csv`, sign/verify, chain verify), final full run-through of all 8 demo scenarios; fix anything broken.

If time is constrained, never cut: Phases 1-6 and 8's API/Swagger. Cut order if needed: certificate batch ZIP, accreditation pack, webhooks UI polish.

---

## 14. ACCEPTANCE CHECKLIST (verify before finishing; report results in your final message)

- [ ] `npm run dev` works from a clean clone after setup steps; `npm run seed` and `npm run smoke` pass.
- [ ] Each of the 10 PS requirements demonstrably works (list the page/route for each in README).
- [ ] RLS test proves cross-institution isolation; no raw PII appears in logs, audit meta, validation issues, or AI prompts.
- [ ] Cross-institution duplicate detection uses only keyed hashes; institution B cannot see institution A's identity.
- [ ] Over-intake upload triggers a live AICTE alert without page refresh.
- [ ] Credential verify page shows VALID, TAMPERED (forged file) and REVOKED correctly; signature check works with only the public key.
- [ ] Audit integrity check passes; tamper demo is detected with the exact entry; restore works.
- [ ] Scholarship flow denies mismatched marks and returns only minimal fields on success.
- [ ] Ask the Data answers at least 8 example questions through the catalog only.
- [ ] Every simulated integration is labelled "Simulated" in the UI.
- [ ] Final message: list what was built, anything cut, and the 3-minute demo order below.

### 3-minute demo order (write into DEMO.md)
1. AICTE live dashboard → 2. Institution uploads `messy_upload.csv` → fix-it wizard → submit → live over-intake alert on AICTE screen → 3. Cross-institution match and fraud cluster → 4. Employer verification with student consent → 5. Scan valid QR, then forged QR (TAMPERED) → 6. Scholarship portal denial on mismatched marks → 7. Audit tamper demo caught → 8. Ask the Data question → 9. Roadmap line: real APAAR/DigiLocker/ePASS onboarding, container workers, ZKP matching, ABC credit sync.

---

Begin now with `PLAN.md`, then Phase 1. Work autonomously through all phases.
