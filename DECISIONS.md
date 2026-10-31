# Decisions

- Sutra has its own git repo in this folder, because the enclosing repo is the home directory with an unrelated `aura` remote.
- Next.js is pinned to 15 because the brief's `next lint` was removed in Next 16.
- Tailwind is pinned to v3 for the shadcn config format in `components.json`; shadcn components are hand-copied, not installed via CLI.
- Later-phase libraries (Recharts, PapaParse, SheetJS, pdf-lib, qrcode, Anthropic, Swagger) are installed by the phase that first uses them.
- `npm run keys` trims `/rest/v1/` from `NEXT_PUBLIC_SUPABASE_URL`, because the client needs the bare project URL.
- Added tables the brief implies: `universities`, `scholarship_portals`, `alerts`, `notifications`, `webhook_deliveries`, `university_result_batches`, `rate_limits`, `audit_tamper_backup`.
- Added `ADMISSION_SURGE` to `cluster_type` for the 48-hour surge rule in Section 9.6.
- `consents` gains `approved_at`, `denied_at`, `consumed_at`, `otp_expires_at`; one-time view needs a consumed marker and OTPs need a 5-minute expiry.
- `scholarship_requests` gains `academic_year` and `denial_reason`, needed for duplicate-claim checks and the portal's denial message.
- `verifier_orgs` gains `scope`, so regulators can have broader per-org scope.
- Seat-matrix totals are enforced by `seat_matrix_valid()` called from code, not a table constraint, since rows are written one chunk at a time.
- Column-level grants hide `students.created_by_institution_id` from all logged-in users, so a second institution cannot learn who created a shared student.
- Sessions use httpOnly cookies, so all auth runs server-side; the browser Supabase client is for Realtime only.
- Realtime token handoff from the httpOnly session is built with the dashboards in Phase 4.
- MFA enrolment (`/settings/security`) and login rate limiting are built in Phase 6 with the other security pages.
- Sidebar items for later phases are shown but not linked until they are built.
