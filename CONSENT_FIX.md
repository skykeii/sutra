# Consent fix

## Findings, before any code change

Checked on 3 Nov 2026 against the code at `pre-consent-fix` and the shared database.

### What `demo:reset` seeds for student10 and Navayuga

- **Student10** (Aditya Rao, `900000000010`): no seeded consents and no seeded `access_log` rows. Their only enrolment is B.Tech CSE at **Yamuna Institute of Technology**, 2024-2028, Active, Verified. That is the institution the verification result shows, and the demo docs already say so.
- **Navayuga seeded consents:**
  - Ananya (`900000000001`): pending, asked a day before the seed date.
  - Priya (`900000000003`): pending, asked 2 days before.
  - Divya (`900000000009`): approved and consumed 5 days before.
- **Seeded `access_log` rows:** Divya × 2 (Navayuga and the Council) and Sneha × 1 (scholarship portal).
- **Seed date:** `REF_DATE` is today at 00:00 UTC, which is 05:30 in India. A reset run on 3 Nov therefore dates Ananya's request "2 Nov, 05:30".

### Bug 1: a "Verified ✓" row right after a reset

The cause is a reset that is only partial.
- **What reset does:** `scripts/seed.ts` re-upserts each seeded consent with `approved_at`, `consumed_at`, `revoked_at` and `expires_at` put back to null.
- **What it misses:** `receipt`, `denied_at`, `otp_hash`, `otp_expires_at` and `otp_attempts` keep whatever a test or demo left there.
- **Why the page then shows "Verified ✓":** `/verifier/requests` passes `receipt.payload.result` to `ViewResult`, which shows "Verified ✓ … Receipt PDF" whenever a result exists, whatever the consent's state.
- **Evidence in the shared database:** Ananya's seeded consent `90122ba0` is approved and has a receipt from 15:44 today, with the result naming Deccan Institute of Technology.
- **Why it looks like reuse:** that row's "Asked" time is its seed time, 2 Nov 05:30.

**The ask reuses old consents.** `POST /api/app/verifier/request` creates a new consent only when no open consent exists for the same verifier and student. "Open" means not yet approved or denied, with no check of purpose or age and none on `revoked_at`. So asking about a student with an old pending seeded request returns that request, dated from the seed.

**For student10 specifically**, nothing seeded exists, so a reset alone cannot pre-verify them. The "Verified ✓" row that looked like theirs was Ananya's. The verifier page shows no student identity, by design.

### Bug 2: "Who accessed my record" stays empty

- **The write exists but is fragile.** "View result" does write `access_log`, in `app/api/app/verifier/view/[id]/route.ts`, keyed by `students.id` (a uuid). That is the same key the student page filters on, and the one RLS allows: `student_id = app_student_id()`. But the consent update and the log insert are two separate calls, with no transaction and no error check, so a failed insert would go unnoticed.
- **The more likely cause is a page that doesn't update.** `access_log` and `consents` are not in the Realtime publication, and the page watches only `enrolments`. Its list therefore changes only on a reload. An earlier rehearsal saw the entry appear after a reload.
- **There is no consent link.** `access_log` has no `consent_id`, so an entry cannot be tied to the consent that allowed it.

### Bug 3: a new request missing from "Waiting for your answer"

This is a page-update problem. The data is fine: the consent row exists at once, with the right `student_id`.
- **Nothing triggers a refresh.** The student page cannot hear a new consent, for the publication reason above.
- **A refresh doesn't reliably show either.** `router.refresh()` re-renders server pages, but in a browser test only 1 of 6 refreshes changed the screen, even though every response carried the new numbers. This happens under plain `next start` as well, so `serve.mjs` is not the cause. It is the same problem behind the dashboard that stayed on 58 / 60.

### Bug 4: "Take back access" on a consent already used

The page shows the button only when the state is `Approved`, and a used consent's state is `Viewed`. So this is the same stale page. It still shows the consent from before the verifier used it. The status wording also reads "Viewed", not "Used once".

### Access-log RLS

`access_log_read` already limits students to their own rows. It needs no change for reading, though a test now proves another student is refused. Writes go through the service role only.
