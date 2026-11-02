# Sutra demo guide

Live address: <https://sutra.teentechindia.com>. Before each rehearsal, run `npm run demo:reset` from this PC. The password for every account is `Demo@12345`. Use two browser windows, one normal and one private, to show live updates.

## 3-minute demo order

1. **AICTE live dashboard.** Sign in as `aicte.admin@sutra.example`. Show the KPIs, India map, live alert feed and submission tracker.
2. **Upload and fix-it.** In the second window, sign in as `admin.deccan@sutra.example`. Open **Upload students**, choose *B.Tech Computer Science & Engineering (CSE)*, and drop `demo-files/messy_upload.csv` (it works on the first try). Show the issue summary and **Apply all safe fixes**, then **Undo** so the file is back to its original state. Submit. Watch the over-intake alert arrive on the AICTE screen with no refresh, and the CSE meter turn red.
3. **Cross-institution match and fraud cluster.** On AICTE, open **Duplicates** (both institutions visible), then **Fraud patterns** (40 students sharing 3 mobile numbers, shown as masked IDs).
4. **Employer verification with consent.** Sign in as `verifier.navayuga@sutra.example`. Enter APAAR ID `900000000010` under **Verify a student**. Sign in as `student10@sutra.example`, open **Access and consents**, choose **Approve with a code**, and use the code from the simulated SMS inbox. Back as the employer, open **My requests**, view the result once, and download the receipt PDF.
5. **Valid and forged QR.** Open <https://sutra.teentechindia.com/verify/SUTRA-DEMO-VALID> (VALID). On `/verify`, upload `demo-files/valid_credential.json` (VALID), then `demo-files/forged_credential.json`, which has one letter changed (TAMPERED). `/verify/SUTRA-DEMO-REVOKED` shows REVOKED.
6. **Scholarship denial on mismatched marks.** Sign in as `student4@sutra.example`. Under **Marksheet check**, claim 78% for Semester 4 (the university record is 54%). Open `/portal-demo`, choose **Arjun: after a marks mismatch**, apply, approve as the student, and watch the portal show the denial.
7. **Audit tamper caught.** On AICTE, open **Audit trail**. Run **Verify audit integrity** (intact). Press **Simulate tampering**, verify again (exact entry named), press **Restore**, and verify again (intact).
8. **Ask the Data.** Open **Ask the Data** and pick an example, such as *Show quota violations*.
9. **Roadmap line.** Real APAAR, DigiLocker and ePASS onboarding, containerised validation workers, zero-knowledge proof matching, and ABC credit sync.

## The 8 planted scenarios

| # | Scenario | How to show it | Expected |
|---|---|---|---|
| 1 | Over-admitting college | Deccan CSE (58 of 60) uploads `messy_upload.csv` | Two rows fill the last seats. Six more fire OVER_INTAKE and OVER_QUOTA. Live AICTE alert, red meter, signed webhook shown as delivered under **API and webhooks** |
| 2 | Student in two colleges | Kabir Khan (`900000000008`), active at Bharat (Karnataka) and Sabarmati (Gujarat) | AICTE sees both at **Duplicates**. `admin.sabarmati` sees only "Possible existing enrolment elsewhere" |
| 3 | Fake QR | `/verify` **Fake QR test**, or upload `demo-files/forged_credential.json` | TAMPERED. `demo-files/valid_credential.json` shows VALID, so you can change one letter and change it back. `/verify/SUTRA-DEMO-REVOKED` shows REVOKED |
| 4 | Mismatched marksheet | `student4` (Arjun Mehta) claims 78% for Sem 4 | "Claimed 78%, university record 54%", a MARKS_MISMATCH alert, and a later portal denial |
| 5 | Quota abuse | Vindhya College of Engineering at **Quota audit** | Non-Convenor 21 of 15 with intake fine, and one Convenor seat with no allotment |
| 6 | Ghost cluster | Ganga Valley Institute at **Fraud patterns** | 40 students sharing 3 mobile numbers |
| 7 | Audit tamper | **Audit trail** controls | "Tampering detected at entry #N", and restore works |
| 8 | Fixable messy upload | Same file, **Apply all safe fixes** | 300+ issues, about 300 auto-fixable, listed before submit |

Also on `/portal-demo`: **Sneha** gets a verified answer with minimal fields, **Vikram** is denied ("Student detained in Sem 4"), and **Meera** is denied ("Duplicate claim detected").

## Who is who

| Login | Student | APAAR ID | Role in the demo |
|---|---|---|---|
| `student1` | Ananya Reddy | `900000000001` | Valid credential `SUTRA-DEMO-VALID`, with a consent request waiting |
| `student2` | Rohan Verma | `900000000002` | Revoked credential `SUTRA-DEMO-REVOKED` |
| `student3` | Priya Nair | `900000000003` | A consent request waiting |
| `student4` | Arjun Mehta | `900000000004` | Marks mismatch |
| `student5` | Sneha Kulkarni | `900000000005` | Scholarship success |
| `student6` | Vikram Singh | `900000000006` | Detained in Sem 4 |
| `student7` | Meera Iyer | `900000000007` | Duplicate scholarship claim |
| `student8` | Kabir Khan | `900000000008` | Enrolled at two institutions |
| `student9` | Divya Sharma | `900000000009` | Rich access history |
| `student10` | Aditya Rao | `900000000010` | Clean verification flow |

## Tips

- On `/student`, a student can download their credential as a PDF or as JSON. The JSON can be uploaded on `/verify`.
- Use **B.Tech Electronics & Communication** (42 of 60) for `clean_upload.csv`, which shows no issues, and **B.Tech CSE** for `messy_upload.csv`. On CSE (58 of 60) the clean file's 12 rows correctly hit the seat limits.
- Maker-checker: propose as `aicte.admin`, approve as `aicte.admin2`. One intake change is already waiting at **Approvals**.
- After Scenario 1 the Deccan college has an open OVER_QUOTA alert, so its students are denied scholarships until AICTE resolves it. `npm run demo:reset` clears this.
- A student's consent code lasts 5 minutes, and each student can request 5 codes an hour.

## Acceptance checklist results

These are the first round's results; the latest are in `FINAL.md`. Run on 2026-11-01 against a production build (`next build` and `next start`) and the real Supabase project. The evidence is `npm run e2e` (8 sections, data reset before each), `npm run smoke` and `npm run test`. Together they made more than 400 checks with none failing, including 80 unit tests.

**How the screens were tested.** Signed-in pages were tested over HTTP with real session cookies, checking status and page content. Nobody has clicked through them in a browser, because the automated browser was not used to sign in to the hosted Supabase project. Public pages were also loaded in a browser. Items marked **Partly** say what is still open.

| Item | Result | Evidence and limits |
|---|---|---|
| `npm run dev` works from a clean clone after setup; seed and smoke pass | **Partly** | `npm run setup`, `seed` and `smoke` pass in this project. A fresh `git clone` installs, typechecks, passes unit tests and builds, and setup gives plain messages for a missing env file or `DATABASE_URL`. The full setup was not run inside the clone, to avoid copying your secrets |
| Each of the 10 requirements works (routes in README) | **Partly** | R1 to R10 are covered by HTTP and API tests and mapped in `README.md`. See the open items below for what was not used by hand |
| RLS proves cross-institution isolation | **Pass** | `scripts/rls-test.ts`: reads, writes and deletes are blocked for colleges, universities, students, verifiers, the portal and anonymous visitors |
| No raw PII in logs, audit meta, validation issues or AI prompts | **Partly** | Stored issues and alerts are clean, and prompts hold only catalog text, the officer's question and aggregates. **Four audit entries (seq 446, 447, 501, 502) hold a synthetic APAAR ID in an API path**, written before this was fixed. The log is append-only, so they remain; a fresh Supabase project will not have them. `npm run smoke` lists them and fails on any new one. Server logs were not separately scanned; the code logs only route paths and error names |
| Duplicate detection uses only keyed hashes; institution B cannot see A | **Pass** | Matching uses HMAC hashes, a live upload gets only the generic notice, and column grants hide who created a student |
| Over-intake upload triggers a live AICTE alert without refresh | **Partly** | A real Realtime subscription with an AICTE token received the alert during an upload, while another college's token received nothing. The dashboard component that shows it has not been watched in a browser |
| Verify page shows VALID, TAMPERED and REVOKED; signature check needs only the public key | **Pass** | Tested over HTTP and in a browser (Fake QR test shows TAMPERED) |
| Audit check passes; tamper detected at the exact entry; restore works | **Pass** | Tamper at entry 50 reports entry 50, and restore brings the chain back to intact |
| Scholarship denies mismatched marks and returns only minimal fields | **Pass** | Marks mismatch, detained and duplicate claim are all denied; success returns exactly 7 fields |
| Ask the Data answers at least 8 example questions through the catalog only | **Pass, keyword mode** | All 15 catalog examples are answered and a SQL attempt runs nothing. No `ANTHROPIC_API_KEY` is set, so **the live Claude path has never run**; only its fallback has |
| Every simulated integration is labelled | **Pass** | APAAR, DigiLocker and ePASS on the landing page, plus the DigiLocker chip, SMS inbox and portal page banner |

**Update after the fix round (see `FIXLOG.md`):** Playwright now drives real signed-in browsers through the upload wizard preview, the single-student form and the live alert toast, and all 32 signed-in pages fit at 375 px.

### Not yet exercised

Try these by hand before presenting. Everything else from the earlier list is now covered by `npm run check:final` (see `FINAL.md`):

- MFA with a real authenticator app (the check generates the codes itself)
- The verifier rate limit and the bulk-lookup alert
- Swagger "Try it out" with a real key (public endpoints are checked)

### Cut

Scanning a QR with the camera. Verifiers paste the QR link or record ID instead. Nothing else in Sections 3 to 12 was cut.

### Dependency audit

`npm audit fix` without force changed nothing: 21 vulnerabilities remain (2 high, 17 moderate, 2 low, no critical), and each fix needs a breaking upgrade or does not exist.

- **`xlsx` (high, no fix on npm):** prototype pollution and ReDoS. The app parses uploaded `.xlsx` files only in the uploader's own browser, and on the server it only writes files. Consider moving to SheetJS's own distribution before real use.
- **`postcss` via `next` (high in the report):** a build-time dependency whose fix needs Next 16, which also removes the `next lint` this brief requires.
- **The rest:** mostly `eslint` tooling and `swagger-ui-react` dependencies.
