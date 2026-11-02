# Final build report

Live at <https://sutra.teentechindia.com>, served from the Mac mini. Tag `pre-final` marks the starting point and `v1.0-final` the result.

## Baseline against final

Local checks ran on a production build served by `serve.mjs`. The final `e2e` ran after a reset.

| Check | Baseline | Final |
|---|---|---|
| `tsc --noEmit` | Pass | Pass |
| `next lint` | Pass | Pass |
| `npm run test` | 101 pass | 157 pass |
| `npm run verify:seed` | Pass | Pass, after the last reset |
| `npm run smoke` | Pass; lists the 4 known audit entries | Same, after the last reset |
| `npm run e2e` (preview-only) | 338 pass | 347 pass |
| `npm run e2e:ui` (read-only) | 2 pass, 2 skipped | 2 pass, 2 skipped, locally and on the domain |
| `mobile-overflow` at 375 px | 32 of 32 | 32 of 32, locally and on the domain |
| `npm run check:final` | Did not exist | 28 pass |
| `npm run live-check` on the domain | Did not exist | 32 of 32 |

The skipped browser tests are the ones that write data. They were left out on the shared database, and last passed in the fix round.

## Status of each item

| Item | Status | Evidence |
|---|---|---|
| C1 Webhook sink and SSRF guard | Done | The seeded Deccan webhook delivered through the domain, recorded as success with status 200. `https://127.0.0.1/x` and `https://192.168.1.1/x` are refused on the live site with a plain message. The address is checked at registration, before delivery, and again as the connection opens. An unsigned call gets 401, a 17 KB body 413 |
| C2 Real visitor for rate limits | Done | Locally, one visitor's burst did not limit a second, and a changing spoofed header from a non-loopback address was still limited. On the domain, the limit bucket holds the visitor's public address, not `127.0.0.1`. Needed `serve.mjs`, because Next hides the socket address |
| C3 Ollama option | Done, **never run against a real Ollama** | Mocked tests cover a valid choice, invalid JSON, timeout, refusal, an unreachable server and PII rejection. See D7 |
| C4 Domain defaults | Done | Seed, `.env.example` and docs. The demo credential files carry the new domain |
| C5 Presentability | Done | See below |
| C6 Untested items | Done, with limits below | `npm run check:final` |
| C7 Public-site check | Done | `npm run live-check -- <url>` |
| C8 Docs | Done | `README.md`, `DEMO.md`, `DEPLOY.md` |
| D1 Prepare | Done | Node 26.5, 8 GB memory, 58 GB free, no Ollama |
| D2 Build | Done | Built in `~/sutra-next`, passed on port 3101 before any swap |
| D3 Domain tunnel | **Already in place, nothing built** | `com.sutra.cloudflared`, added at 20:01 on 2026-11-02, already served the domain. It was kept, and not moved under `~/sutra` as the brief describes |
| D4 Swap | Done, twice | Healthy within 2 s each time, rollback not needed. The previous build is in `~/sutra.prev` |
| D5 Verify on the domain | Done | Certificate valid to 11 Dec 2026, cookies `Secure; HttpOnly; SameSite`, headers present, login works, credential links use the domain |
| D6 Remove the random address | Done | The agent and plist are gone, and the old address returns 530 |
| D7 AI on the Mac | Done, Gemini | Ollama was not installed, because 8 GB is under the 16 GB limit. Numbers below |
| D8 Status and reboot notes | Done | `~/sutra/scripts/status.sh`; manual steps in `DEPLOY.md` |

## C5: what was checked and fixed

52 screenshots at 1440 px and 375 px were reviewed. No console errors, except the deliberate 404 on the not-found test.

- A REVOKED record read "Status: Active". That field is the enrolment, so it now says "Enrolment status".
- Hashes on `/transparency` wrapped to 13 lines on phones. They now take two lines and scroll inside the table.
- Added a favicon, an error page for public routes, and a title for the not-found page.

## C6: results

| Check | Result |
|---|---|
| Login limit with a fake email | Limited on try 11 with a clear message. A real account still signs in |
| OTP limit, throwaway student | 5 codes sent, the 6th refused with a clear message. Student deleted |
| MFA, throwaway admin, `DEMO_MODE=false` | Without MFA: sent to set it up, no data shown, APIs 403. A wrong code is refused, a correct TOTP is accepted, the dashboard opens. User deleted |
| `DEMO_MODE=false` | Demo logins and shared password hidden, sink 404, tamper demo refused |
| Formula in a name, PNG or PDF upload | Refused |
| Certificate PDF | Contains APAAR ID, student ID and a QR image |
| Swagger Try it out, public endpoint | 200 |
| Ask the Data refusals | Weather and SQL both refused |
| Consent wall | Covered by the `verify` e2e section |

**Limits.** TOTP codes came from the check script, not a real authenticator app. The verifier lookup limit and bulk-lookup alert were not hit. Swagger with a real API key was not tried.

## AI provider

**Gemini, `gemini-3.5-flash-lite`, set only in the Mac's `.env.local`.** Run through the live site, including the app's two calls per question.

| Test | Right answer | Answered by the model | Median | p95 |
|---|---|---|---|---|
| One question every 10 s | 15 of 15 | 15 of 15 | 5.2 s | 12.9 s |
| No gap between questions | 15 of 15 | 8 of 15, then fell back at once | 2.9 s | 11.7 s |

Both refusals held. The fall-back after 8 questions looks like the free-tier rate limit, though the audit log records only "error". Answers stayed correct and were labelled `AI: offline mode`. In the paced run, 2 of 34 model calls failed.

`/aicte/fraud` shows `AI: offline mode` until **Run detection now** is pressed, because seeded explanations came from the template. The `AI: gemini` label on an answer was seen in the API reply; it was not looked at on screen.

## Timings on the domain

Median of 3 requests from this PC, after the last reset.

| Page | Time |
|---|---|
| `/` | 347 ms |
| `/login` | 337 ms |
| `/verify/SUTRA-DEMO-VALID` | 578 ms |
| `/aicte` | 992 ms |
| `/aicte/records` | 846 ms |

## Found along the way

- **Certificate line (older bug, fixed).** A lateral entrant's old diploma enrolment could hide their credential, returning no QR link. It depended on row order, which is why it passed at baseline.
- **My own errors, fixed.** The warm-up import broke the build once, and `serve.mjs` caused a logged TLS error after each login, without breaking login.

## Where the result differs from the brief

- `demo:reset` ran three times, not once, because `e2e` writes data and needs a clean start. The last action on the database was a reset, and only read-only checks and logins followed.
- The sink does not write its own row. The sender already records each delivery, and a second row would double-count.
- D3 used the existing tunnel, as above.

## Blockers

None.

## Do these by hand

1. Add `https://sutra.teentechindia.com` as the Site URL and `https://sutra.teentechindia.com/**` to the Redirect URLs in Supabase Auth.
2. Add `AI_PROVIDER`, `AI_MODEL`, `GEMINI_API_KEY` and `DEMO_PUBLIC_URL` in Vercel.
3. Enable the Mac's automatic login, so the site returns after a reboot. See `DEPLOY.md`.
4. Run `npm run demo:reset` before every rehearsal.
5. After the event: remove this PC's SSH key from the Mac's `~/.ssh/authorized_keys`, change the Mac's login password (it was shared in chat), and rotate the shared demo keys.
6. Check the `cloudflared tunnel run --token` process started by hand at 19:53 on the Mac. It was left alone, and if it belongs to Sutra's tunnel it will stop with that terminal.
