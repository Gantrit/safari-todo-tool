# Collaboration Log — Safari To-Dos

Shared changelog for the two AI agents working on this repo (Codex/ChatGPT and Claude). See
`AGENTS.md` for the full project briefing and handoff protocol. Newest entries on top.

## 2026-07-09 — Claude (Fable 5) — Full security/QA/polish/docs pass (pre-production review)

No migration. Committed to `main`, NOT pushed. Full-repo security audit + live browser QA
(logged in as admin via preview) + surgical polish + docs cleanup.

- **Security — `/api/shift-report/submit` hardened** (public service-role endpoint): free-text
  fields now length-capped server-side (2000 chars; name 120), numbers clamped to the NUMERIC(10,2)
  ceiling instead of 500ing, `shift_date` format-validated, files with a MISSING MIME type no
  longer bypass the allowlist, and a content-length gate (~49 MB) rejects oversized bodies early.
  `ShiftReportForm` now pre-validates file type/size client-side and SHOWS which files were
  rejected (server silently skipping them looked like success before). Rest of the audit came
  back clean: all API routes gate correctly (invite/creators = admin, email/notify = webhook
  secret, reports page = admin/manager), service role never imported client-side, XP RPCs still
  client-revoked, storage bucket private, signed URLs 1h. Known accepted risk: no rate limiting
  on the public submit endpoint (v1, obscure URL, small team).
- **Real bug fixed — `/reports` hydration mismatch**: `submitUrl` read `window.location` during
  render (server/client HTML disagreed → React error + full client re-render on every load).
  Now `useSyncExternalStore` with a '' server snapshot.
- **UI polish**: `/reports` now uses the standard `page-shell`/`page-header` pattern (it was the
  only page with its own mini-header — looked like a different product). Sidebar: brand no longer
  truncates ("Safari To-D…"), stale "Task Tracker · v0.2-workspace" label replaced, and the
  refresh/close icon buttons are now conditionally rendered in JSX — the `hidden`/`lg:hidden`
  utilities NEVER worked on them because unlayered `.icon-button { display:inline-flex }` in
  `globals.css` beats layered Tailwind display utilities (both buttons always showed, squeezing
  the brand). Watch for this pattern with other custom classes. "1 open tasks" grammar fixed.
- **Docs**: SETUP.md rewritten (was: "run migrations 001–003", old XP tables, old rank names —
  now: all 23 migrations, env vars incl. service role/email, redirect-URL allowlist, shift-report
  setup). README replaced (was create-next-app boilerplate). AGENTS.md updated (023, shift
  reports, API-route auth note, implicit-flow warning). COLLAB_LOG compressed: entries older than
  2026-07-07 moved verbatim to `docs/archive/COLLAB_LOG_ARCHIVE_2026-07.md`, do-not-undo
  decisions summarized at the bottom of this file. NEW `docs/current_status.md` (compact live
  status). Stale `PLAN_clickup_style_board.md` (claimed "not implemented") archived + corrected;
  generated `repo-tree.txt` deleted.
- **Deps**: `npm audit fix` (non-breaking) fixed @babel/core + js-yaml advisories. Remaining: 2
  moderate (postcss < 8.5.10 pinned inside next@16.2.6 — only "fix" is downgrading to next@9,
  nonsense; wait for a Next.js bump).
- Verified: lint clean on all touched files (36 pre-existing errors in old V1 files remain —
  `no-explicit-any` etc., documented since June), `npm.cmd run build` green (incl. TS check),
  browser QA of every page/all four board views/task+create modals/mobile viewport — zero
  console errors. NB: hit the documented OneDrive/Turbopack stale-cache bug twice (React dead on
  page, no errors) — delete `.next\dev` + restart fixes it; don't chase phantom bugs first.
- Old test data left in prod on purpose (don't alter production data): archived task
  "XP-Flow-Test (Claude, wird gelöscht)" + quest/category "test" — Tan deletes in-app.

## 2026-07-09 — Claude (Opus 4.8) — Shift Reports v1 (native, public submission + in-app list)

Pushed to `main`. **NEW migration `023_shift_reports.sql` — must be run in Supabase before it works.**

- New "Shift Reports" module so chatters submit end-of-shift reports (sales, counts, notes,
  screenshots) in-app instead of WhatsApp. Migration `023_shift_reports.sql` creates
  `shift_report_creators`, `shift_reports`, `shift_report_files` + a PRIVATE storage bucket
  `shift-report-files`, and seeds 7 models (Alanna, Juan, Dasha, Zoey, Millie, Luna, Davis).
- `shift_reports.creator_name` is a name SNAPSHOT taken at submit time, so deleting a creator
  never blanks old reports. `chatter_name` is free text (NOT a profiles FK) on purpose — external
  emergency chatters have no profile.
- Public no-login form at `/submit-report` (added to middleware `isPublicRoute`) → posts to
  `/api/shift-report/submit` which runs on the SERVICE ROLE (validates, inserts the report, uploads
  files to the private bucket, ≤6 files ≤8 MB each). Tables stay RLS-locked; only admin/manager get
  direct read via policies.
- In-app list `/reports` (admin/manager only, gated + sidebar entry under Tools) reads via service
  role and mints 1h signed URLs for screenshots; model/chatter/date filters + "Copy submission link".
- Creator management (add / activate-deactivate / DELETE) lives in **Settings → Creators / Models**
  (`CreatorsSettings.tsx`), backed by `/api/shift-report/creators` (POST / PATCH / DELETE, admin-only).
- Built deliberately WITHOUT the Claude/Anthropic screenshot auto-verification (that's v2 — needs a
  separate Anthropic API key as a Supabase secret + its own migration for the `verification_*`
  columns). User wants to judge real screenshot quality before paying for the auto-check.
- NB: This is the FIRST file-upload feature in the app — there was no prior storage/upload code to
  reuse (the old FEATURE spec's "reuse task-attachment upload" was wrong; `attachments` only stored
  URLs). Needs `SUPABASE_SERVICE_ROLE_KEY` in the env (already set on Vercel; the invite route uses it).
- Verified: `npm.cmd run build` green; `/submit-report` renders without login; Settings Creators
  section + sidebar entry render. Full submit→list flow runs in prod after migration 023 is applied.

## 2026-07-09 — Claude (Opus 4.8) — fix broken invite / password-reset links

Pushed to `main` (`bdd0338`). No migration.

- `lib/supabase/client.ts` now builds the browser client with `flowType: 'implicit'` (was PKCE by
  default). `/set-password` and `/callback` were already written for the implicit hash flow (wait for
  a session from the URL hash, never call `exchangeCodeForSession`), but the PKCE default meant links
  opened in a fresh browser had no code_verifier to exchange the `?code=` → always "Link expired or
  invalid". Also hardened `/set-password` to parse `#error_code`/`#error_description` and show the real
  reason (clear `otp_expired` message) instead of the generic text.
- Follow-up (NOT code, user's step): in Supabase → Authentication → URL Configuration, confirm
  `${APP_URL}/set-password` and `${APP_URL}/callback` are in the Redirect URLs allowlist. Single-use
  links can still be pre-consumed by email security scanners — now diagnosable via the surfaced error.

## 2026-07-07 - Claude (Opus 4.8) - Email wiring, account security, quest edit/categories, archive split, calendar filter

User feedback batch. `npm run build` green. **TWO NEW MIGRATIONS — must be run in Supabase (021, 022).**

- **Account: change email + password** (`app/(app)/account/AccountForm.tsx`, page passes `currentEmail`):
  two new sections using `supabase.auth.updateUser({ email })` / `({ password })`. No migration. Email
  change sends a Supabase confirmation link; password change is instant (needs Supabase SMTP for the
  email side, fine for a small team).
- **Email notifications actually wired (Resend)** — before, `email_enabled` + `RESEND_API_KEY` existed
  but NOTHING sent mail (`create_notification` only inserts in-app rows). Now:
  - **NEW migration `021_email_notifications.sql`**: enables `pg_net`; single-row `email_webhook_config`
    (admin RLS) holding `app_url` + `webhook_secret`; AFTER INSERT trigger on `notifications` fires an
    async `net.http_post` to `/api/email/notify`. No-ops until `app_url` is set; wrapped so it can never
    break the notification insert.
  - **NEW route `app/api/email/notify/route.ts`**: verifies `x-webhook-secret` (env `EMAIL_WEBHOOK_SECRET`),
    respects `notification_preferences.email_enabled`, sends via Resend HTTP API (no SDK dep). Env:
    `RESEND_API_KEY`, `EMAIL_WEBHOOK_SECRET`, `EMAIL_FROM`. Setup steps documented in `SETUP.md`.
- **Quests: edit + delete** (`QuestBoard.tsx`) — there was NO edit/delete before. Admin now edits a quest
  in the same modal (edit mode) and soft-deletes via `deleted_at` (page already filters it out). Uses the
  existing `quests_admin_all` RLS — no migration.
- **Quest categories = editable `departments`** (they already back `quests.department_id`):
  - **NEW migration `022_quest_categories.sql`**: adds admin write RLS to `departments` (was seed-only).
  - Quest create/edit form gets a category dropdown; quest board gets a category filter bar; cards show a
    category pill. Settings has a new **"Quest categories"** CRUD section (add/rename/delete). NB categories
    are shared with tasks' `department_id` — deleting one just SET NULLs, nothing is lost.
- **Archive rebuilt two-column** (`app/(app)/archive/ArchiveView.tsx` + page): left = approved to-dos
  (unchanged data), right = the user's APPROVED quest acceptances, with a period filter (All / 7 / 30 / 90d)
  applied to both. No migration.
- **Calendar board filter** (`components/calendar/CalendarView.tsx` + page passes `boards` + `userId`):
  toggle chips "Focus (mine)" + one per kanban board, multi-select union. Default = Focus only (own to-dos).
- **Decision:** permissions stay role-based (no matrix). To let Marian create templates / approve, set her
  to **Manager** in Settings (`can_manage()` = admin OR manager). Settings auto-saves — no save button.


---

## Older history (compressed) — full entries in `docs/archive/COLLAB_LOG_ARCHIVE_2026-07.md`

Everything below is a summary of 2026-06-19 … 2026-07-07. The verbatim entries live in the
archive file. **The do-not-undo decisions still apply:**

**Migrations** (all applied in production as of 2026-07-09; never re-run them, next free: 024):
001–004 schema/product model · 005 RLS-recursion helpers (`is_workspace_member/admin` — reuse
them in new `workspace_members` policies) · 006 atomic admin-only workspace creation RPC ·
007 security hardening (XP RPCs `approve_task`/`reject_task`/`reopen_task`/quest lifecycle;
`award_xp`+`create_notification`+`seed_demo_workspace` revoked from clients; status-transition
trigger) · 008/009 roles (admin/manager/employee/guest, `can_manage()`) + `soft_delete_task` ·
010 board_access enforcement · 011 board soft delete (`soft_delete_board` RPC; `tasks.board_id`
FK is SET NULL — don't restore CASCADE) · 012 Guild XP (`admin_adjust_xp`, `xp_leaderboard`) ·
013 `handle_new_user` search_path fix · 014 single-workspace consolidation · 015 board rename ·
016 board access is **opt-in** (auto-grant triggers dropped — don't reintroduce) · 017 IMMINENT
section removed (near-deadline XP bonus replaced it) · 018 `xp_settings` (ALL XP amounts DB-
configured, admin-editable — never hardcode client-side) · 019 template bundles +
`assign_template` RPC · 020 recurring regeneration in `approve_task` · 021 email notifications
(pg_net trigger → `/api/email/notify`, Resend) · 022 quest categories (= `departments`, admin
CRUD) · 023 shift reports + private storage bucket.

**Do not reintroduce / do not undo:**
- Client-side XP writes or direct `status: 'APPROVED'` updates — the DB rejects them by design.
- The WorkspaceSwitcher / ORGANIZATION sidebar block (single-org model since 014).
- The board **Focus view** (removed 2026-07-07; `normalizeViewMode()` maps stale state) or the
  **IMMINENT** board section.
- The full leaderboard on the Dashboard (replaced by a link strip to `/leaderboard`).
- The empty-section "+ Section" chip experiment (explicitly reverted — sections always render
  as compact collapsible headers).
- An **unlayered universal CSS reset** (`* { margin:0; padding:0 }`) in `globals.css` — it beats
  Tailwind's layered utilities and zeroes all spacing (2026-07-07 incident). Related: custom
  component classes in `globals.css` are unlayered and win over display utilities like `hidden`
  — handle visibility in JSX where they collide (see Sidebar 2026-07-09).
- Hardcoded gold rgba/hex values — use the `globals.css` tokens (`--accent-dim` etc.).
- The fixed-sidebar + margin-hack layout (sidebar is a normal flex child at `lg`+).
- PKCE flow in `lib/supabase/client.ts` (implicit flow is required for emailed links).

**Environment facts:** Turbopack file-watching on this OneDrive path is unreliable — if a CSS
edit doesn't show up, delete `.next` and restart. Windows builds via `npm.cmd run build`.
Both agents work on `main`; old `origin/master` is obsolete.
