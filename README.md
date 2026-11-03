# Sutra

**One thread. Every verified student.**

Sutra is an APAAR-based student data platform for AICTE (SIH 2026, PS 26263). Institutions submit student-level data keyed by APAAR ID, the system checks it automatically, AICTE monitors it live, stakeholders verify records with the student's consent, and verified records become digitally signed credentials with QR codes.

`Institution → Student Data Upload → APAAR Validation → Data Verification → AICTE Central Repository → Analytics & Monitoring → Authorized Verification`

The APAAR registry, DigiLocker and ePASS connections are simulated and labelled as such. All data is synthetic.

Live demo: <https://sutra.teentechindia.com>. `DEPLOY.md` explains how it is hosted.

## Setup in 5 steps

You need Node.js 20 or newer and a free Supabase project.

1. Install the packages:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and fill in the four Supabase values from your project's **Connect** and **API keys** pages: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `DATABASE_URL` (the session-pooler URI).

3. Generate keys, create the tables and load the demo data:

   ```bash
   npm run setup
   ```

4. Start the app:

   ```bash
   npm run dev
   ```

5. Open <http://localhost:3000> and sign in using a one-click demo login.

## Demo logins

The password for every account is `Demo@12345`. The login page offers one-click fill when `DEMO_MODE=true`.

| Role | Email | Use it for |
|---|---|---|
| AICTE Admin | `aicte.admin@sutra.example` | National dashboard, approvals, audit |
| AICTE Admin 2 | `aicte.admin2@sutra.example` | The second approver for maker-checker |
| AICTE Officer | `aicte.officer@sutra.example` | Read-only monitoring role |
| Institution Admin | `admin.deccan@sutra.example` | Deccan Institute of Technology |
| Institution Staff | `staff.deccan@sutra.example` | Same college, no key management |
| Second college | `admin.sabarmati@sutra.example` | Sees only the generic duplicate notice |
| University Admin | `admin.jntuh@sutra.example` | Results and certificates |
| Employer | `verifier.navayuga@sutra.example` | Approved verifier |
| Regulator | `verifier.council@sutra.example` | Approved, broader scope |
| Pending employer | `verifier.pending@sutra.example` | Waiting for AICTE approval |
| Students | `student1` to `student10` `@sutra.example` | See `DEMO.md` for who is who |

## Demo script

`DEMO.md` has the 3-minute order, all 8 planted scenarios and the latest acceptance results. To go back to the planted state between rehearsals:

```bash
npm run demo:reset
```

## Requirements map

| # | Requirement | Where |
|---|---|---|
| R1 | Secure upload and update | `/institution/upload`, `/institution/students`, `POST /api/v1/students` |
| R2 | Data fields | `/institution/students/new`, `supabase/migrations/0002_tables.sql`, `/institution` |
| R3 | Automated validation | `lib/validation/`, `/institution/history/[id]`, `/docs/rules` |
| R4 | Real-time dashboards | `/aicte`, `/institution` |
| R5 | Secure verification | `/verifier`, `/verifier/requests`, `/student/consents`, `/aicte/approvals` |
| R6 | Verifiable records | `/aicte/records`, `/student`, `/verify`, `/verify/[recordId]` |
| R7 | Integration APIs | `/docs`, `/institution/integration`, `/api/v1/*` |
| R8 | Security, privacy, audit, consent | `/aicte/audit`, `/transparency`, `/privacy`, `/settings/security`, `scripts/rls-test.ts` |
| R9 | Reports | `/aicte/reports`, `/institution/reports` |
| R10 | APAAR on certificates | `/university/certificates`, `GET /api/v1/certificate-line/{studentId}` |
| Extra | Marks and Scholarship Shield | `/university/results`, `/student/marksheet`, `/aicte/rules`, `/aicte/quota`, `/portal-demo` |
| Extra | Ask the Data and fraud patterns | `/aicte/ask`, `/aicte/fraud` |

## Commands

| Command | What it does |
|---|---|
| `npm run setup` | Runs keys, migrate and seed, with plain error messages |
| `npm run keys` | Generates signing and encryption keys into `.env.local`, skipping existing ones |
| `npm run migrate` | Applies `supabase/migrations` in order and tracks them |
| `npm run seed` | Loads deterministic demo data; safe to re-run |
| `npm run demo:reset` | Removes anything created during a demo and restores seeded rows |
| `npm run test` | Unit tests: validation rules, crypto, hash chain, HMAC matching, Ask the Data, fraud |
| `npm run smoke` | Seed counts, validation on `messy_upload.csv`, sign and verify, chain check, PII scan, RLS test |
| `npm run e2e` | HTTP tests of every page and flow. Needs the app running, and works best after `demo:reset`. It stops uploads at preview unless `E2E_ALLOW_INTAKE_WRITES=1`, for a private database |
| `npm run e2e:ui` | Browser tests with Playwright. Needs the app running and `npx playwright install chromium`, and skips with a message if Chromium is missing. `E2E_ALLOW_WRITES=1` adds the tests that write data |
| `node scripts/mobile-overflow.mjs` | Checks every signed-in page for sideways scrolling at 375 px |
| `npm run measure` | Times the slowest signed-in pages against a running app |
| `npm run serve` | Production server that can see the real visitor behind a tunnel. Set `HOST` and `PORT`, default `127.0.0.1:3100` |
| `npm run check:final` | Rate limits, MFA, `DEMO_MODE=false` and spot checks, using throwaway accounts it deletes afterwards. Needs a build and the app running |
| `npm run live-check -- <url>` | Read-only pass or fail table for a public address: pages, login, credentials, headers, timings |
| `node scripts/screenshots.mjs <folder>` | Saves key pages at desktop and phone width and reports console errors |

## AI options

AI is optional. With nothing set, Ask the Data and the fraud page run in offline mode, using a keyword matcher and templates.

### On the server, with Ollama

AI runs on the server itself with Ollama, so questions never leave the machine. It needs no key, but a small model wants about 16 GB of memory to answer in time.

```bash
AI_PROVIDER=ollama
AI_MODEL=a-model-you-have-pulled
```

The address defaults to `http://127.0.0.1:11434/v1`; change it with `OLLAMA_BASE_URL`. Replies get 15 seconds, because the first call loads the model; change this with `AI_TIMEOUT_MS`. The server loads the model once at start, without delaying start-up. The code path is covered by unit tests with a mocked server. **It has not yet run against a real Ollama**, because the current host has 8 GB of memory.

### In the cloud, for comparison

The question text leaves the machine, though never student records.

1. Get a key from [Google AI Studio](https://aistudio.google.com/) or the [Groq console](https://console.groq.com/).
2. Add these to `.env.local` and to your Vercel environment variables. For Groq, use `AI_PROVIDER=groq`, `GROQ_API_KEY` and a model from its current list.

   ```bash
   AI_PROVIDER=gemini
   AI_MODEL=gemini-3.5-flash-lite
   GEMINI_API_KEY=your-key
   ```

3. Restart the app, or redeploy on Vercel.

Use a fast model: replies must arrive within 4 seconds, unless you set `AI_TIMEOUT_MS`. On 2026-11-02, `gemini-3.8-flash` missed this (no answer in 30 s, or 503 high demand) and `gemini-3.5-flash-lite` met it. `AI_PROVIDER=anthropic` with `ANTHROPIC_API_KEY` also works. Ask the Data and the fraud page show `AI: <provider>` when the model answered and `AI: offline mode` when the fallback did. Any error, timeout, rate limit or invalid reply falls back silently. The model only ever chooses from the approved query catalog and sees totals, never student data.

## Hosting

The live demo runs on a Mac mini behind a Cloudflare tunnel. See `DEPLOY.md`. A Vercel copy also works.

`vercel.json` runs functions in Mumbai (`bom1`), next to the Supabase project. This only takes effect on the deployed site. If your Supabase project is elsewhere, choose the nearest Vercel region.

## Design notes

- **Consent.** Every employer request is a new consent that the student approves with a one-time code. The result can be viewed once: using the consent and recording the access happen in one database transaction (`consume_consent`), and the student sees each access live under **Who accessed my record**.
- **Security.** Row-level security on every table, deny by default. Keyed HMAC-SHA256 for all cross-institution matching. AES-256-GCM for mobile, email, passport and APAAR ID. Ed25519 for credentials, receipts, result batches and audit anchors. Two-person approval for intake changes, revocations and verifier approvals. See `DECISIONS.md`.
- **Tamper-evident audit.** `append_audit()` hash-chains every entry under an advisory lock; triggers block update, delete and truncate. Daily signed anchors are public at `/transparency`.
- **Isolated validation.** `validateBatch` is a pure function that gets only the rows and the lookups it is handed, with no database or secrets. It runs in one serverless invocation per request today, and that boundary lets it move into containerised workers at national scale.
- **AI.** Optional, through one entry point (`lib/ai/provider.ts`). A model only picks from a fixed catalog of approved queries and writes summaries from aggregates. Without a provider, a keyword matcher and templates take over.
- **Simulated integrations.** `lib/adapters/` holds the APAAR, DigiLocker and ePASS adapters. Each has a one-line note on what the real integration would swap in.
- **Webhooks.** Addresses must be https and must not resolve to a private, loopback, link-local or CGNAT range, checked at registration and again as each delivery connects. Redirects are not followed. Set `ALLOW_PRIVATE_WEBHOOKS=true` only for local development against `http://localhost`.
- **Rate limits behind a tunnel.** `serve.mjs` passes the socket address to the app. `CF-Connecting-IP` is trusted only when the connection comes from loopback, so visitors get their own limits and nobody can pick theirs.
- **Going live.** Set `DEMO_MODE=false` to enforce MFA for AICTE admins, hide demo logins and turn off the tamper controls, and move the anchor to a daily schedule. For production, drop `demo_tamper_audit` and `demo_restore_audit`.

## Known limitations

- APAAR, DigiLocker, ePASS and SMS are simulated, and labelled so on screen.
- Verifiers paste a QR link or record ID. There is no camera QR scanning.
- Four early audit entries (seq 446, 447, 501, 502) hold a synthetic APAAR ID in an API path, written before that path was redacted. The log is append-only, so they stay. `npm run smoke` lists them and fails on any new one.
- `npm audit` reports warnings. `xlsx` has no fix on npm; it parses uploads only in the uploader's own browser. The rest need breaking upgrades, mostly in build tooling.
- Demo mode shows one-click logins and the shared password by design. Set `DEMO_MODE=false` for anything real.
