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

## What changed

| Requirement | Change | Evidence |
|---|---|---|
| 1. Clean start for the demo student | The seed now resets every per-use column of a seeded consent: `receipt`, `denied_at`, the OTP columns. `demo:reset` also clears `rate_limits`, so rehearsals no longer use up a student's 5 codes an hour. The employer page shows a result only for a consent that was actually used | `verify:seed`: the demo student has no approved, used or receipted consent, and no seeded consent keeps a receipt. The browser test sees no "Verified ✓" row after a reset |
| 2. A new consent per ask | An ask reuses a consent only if it has the same verifier, student and purpose, is still pending and is under 10 minutes old | The browser test checks that the consent is new, not seeded, and created just now |
| 3. One transaction | New SQL function `consume_consent()` in `0011_consent_access.sql`. It uses the consent only if it is approved, unused, not revoked and not expired, and inserts `access_log` with a new `consent_id` column, all in one transaction. **View result** and the API path both use it. A second view returns 409, and the receipt PDF writes no second entry | The browser test finds exactly one entry for the consent, and the second view gets 409 |
| 4. The student's access list | The page now listens to `consents` and `access_log`, both added to the Realtime publication. The existing RLS policy already limited reads to the owner, so it was left as is | The entry appears without a reload and after a reload. Signed in as another student, the same query returns nothing |
| 5. Seed consistency | Each seeded access entry now names its consent | A new `verify:seed` check: every seeded used consent has its access entry |
| 6. Status wording | A used consent shows **Used once** with its time, and has no **Take back access**. Unused approved consents keep the button; expired ones show **Expired** | Browser test |
| 7. Waiting list updates live | Removed `app/(portal)/loading.tsx`. With that loading boundary, refresh responses carried the new data but the screen kept the old render. Without it, every refresh in the trace reached the screen. This also fixes the institution dashboard that stayed on 58 / 60 | Browser test: the request appears on an open page |
| 8. Demo text | The result for `900000000010` is "B.Tech Computer Science & Engineering (CSE), Yamuna Institute of Technology, 2024-2028, Active". `DEMO.md` now says so. There is no `Sutra_Demo_Script.md`; `presentation/demo-video-script.html` already had it right | Read from the database |
| 9. Marksheet copy | The text under the title is now the requested line. It replaces the old description, which said much the same | |

## Results

Local checks ran against a production build. **Baseline** is the tag `pre-consent-fix`, after committing yesterday's two tested fixes.

| Check | Baseline | After |
|---|---|---|
| `tsc`, `lint` | Pass | Pass |
| Unit tests | 157 pass | 157 pass |
| `smoke`, `verify:seed` | Pass | Pass, with 3 new seed checks |
| `e2e` (preview-only) | 343 pass | 343 pass. One check now expects a second view to be refused with 409, not to return the old result again |
| `e2e:ui`, read-only | 2 pass | 2 pass |
| `e2e:ui` with writes | Not run | 6 pass, including the new consent test and the dashboard-after-submit test |
| Phone width | Not run | 32 of 32 pages fit |
| Live site | | Deployed through a spare port and swap, healthy within 2 s. `live-check` 32 of 32. The consent test also passes against `https://sutra.teentechindia.com` |

## Notes

- **Migration on the shared database:** `0011` was applied with `npm run migrate`. It only adds a column, a function and two publication entries, so the code that was live before the deploy kept working.
- **The first deploy was incomplete:** a failed `git add` left the first commit holding only the loading-file deletion, and that is what was deployed first. It passed its health checks. The local commit was amended to the full tested tree before anything was pushed, and redeployed.
- **More than one reset:** `demo:reset` ran several times, because the write tests need a clean start. The last action was a reset, followed by `verify:seed`.
- **Navigation:** with the loading boundary gone, a link keeps the current page on screen until the next one is ready, instead of showing a skeleton.
