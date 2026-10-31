# Sutra demo guide

Before each rehearsal, run `npm run demo:reset`, then `npm run dev`. The password for every account is `Demo@12345`. Use two browser windows, one normal and one private, to show live updates.

## 3-minute demo order

1. **AICTE live dashboard.** Sign in as `aicte.admin@sutra.example`. Show the KPIs, India map, live alert feed and submission tracker.
2. **Upload and fix-it.** In the second window, sign in as `admin.deccan@sutra.example`. Open **Upload students**, choose *B.Tech Computer Science & Engineering (CSE)*, and drop `demo-files/messy_upload.csv`. Show the issue summary and **Apply all safe fixes**, then **Undo** so the file is back to its original state. Submit. Watch the over-intake alert arrive on the AICTE screen with no refresh, and the CSE meter turn red.
3. **Cross-institution match and fraud cluster.** On AICTE, open **Duplicates** (both institutions visible), then **Fraud patterns** (40 students sharing 3 mobile numbers, shown as masked IDs).
4. **Employer verification with consent.** Sign in as `verifier.navayuga@sutra.example`. Enter APAAR ID `900000000010` under **Verify a student**. Sign in as `student10@sutra.example`, open **Access and consents**, choose **Approve with a code**, and use the code from the simulated SMS inbox. Back as the employer, open **My requests**, view the result once, and download the receipt PDF.
5. **Valid and forged QR.** Open `/verify/SUTRA-DEMO-VALID` (VALID). Open `/verify` and press **Fake QR test** (TAMPERED). `/verify/SUTRA-DEMO-REVOKED` shows REVOKED.
6. **Scholarship denial on mismatched marks.** Sign in as `student4@sutra.example`. Under **Marksheet check**, claim 78% for Semester 4 (the university record is 54%). Open `/portal-demo`, choose **Arjun: after a marks mismatch**, apply, approve as the student, and watch the portal show the denial.
7. **Audit tamper caught.** On AICTE, open **Audit trail**. Run **Verify audit integrity** (intact). Press **Simulate tampering**, verify again (exact entry named), press **Restore**, and verify again (intact).
8. **Ask the Data.** Open **Ask the Data** and pick an example, such as *Show quota violations*.
9. **Roadmap line.** Real APAAR, DigiLocker and ePASS onboarding, containerised validation workers, zero-knowledge proof matching, and ABC credit sync.

## The 8 planted scenarios

| # | Scenario | How to show it | Expected |
|---|---|---|---|
| 1 | Over-admitting college | Deccan CSE (58 of 60) uploads `messy_upload.csv` | Two rows fill the last seats. Six more fire OVER_INTAKE and OVER_QUOTA. Live AICTE alert, red meter, signed webhook delivered |
| 2 | Student in two colleges | Kabir Khan (`900000000008`), active at Bharat (Karnataka) and Sabarmati (Gujarat) | AICTE sees both at **Duplicates**. `admin.sabarmati` sees only "Possible existing enrolment elsewhere" |
| 3 | Fake QR | `/verify` **Fake QR test**, or upload `demo-files/forged_credential.json` | TAMPERED. `/verify/SUTRA-DEMO-REVOKED` shows REVOKED |
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

- Maker-checker: propose as `aicte.admin`, approve as `aicte.admin2`. One intake change is already waiting at **Approvals**.
- After Scenario 1 the Deccan college has an open OVER_QUOTA alert, so its students are denied scholarships until AICTE resolves it. `npm run demo:reset` clears this.
- A student's consent code lasts 5 minutes, and each student can request 5 codes an hour.
