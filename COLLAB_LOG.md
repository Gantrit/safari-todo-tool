# Collaboration Log — Safari To-Dos

Shared changelog for the two AI agents working on this repo (Codex/ChatGPT and Claude). See
`AGENTS.md` for the full project briefing and handoff protocol. Newest entries on top.

## 2026-07-12 — Claude (Fable 5) — Security hardening (migration 034)

**NEW migration `034_security_hardening.sql`** — ⚠️ **NOT yet applied. Run it in Supabase.**
Pure DB/RLS change (only `lib/version.ts` bumped to v0.34 client-side). Fixes three holes from
a full RLS/API security review:
1. **profiles privilege escalation (was CRITICAL):** `profiles_update` had `USING (auth.uid() =
   id)` with no `WITH CHECK` and no column guard, so any member could
   `update({ role: 'admin', xp: 99999, deactivated_at: null })` on their own row via the client
   SDK. Added `WITH CHECK` + a `protect_profile_columns` BEFORE UPDATE trigger that freezes
   role/xp/level/streak_days/deactivated_at against direct client writes (detected via
   `current_user = 'authenticated'`; the SECURITY DEFINER admin RPCs run as `postgres` and pass
   through). full_name/avatar_url stay client-editable (Account page still works).
2. **subtasks IDOR:** insert/update/delete were `USING (true)` — any user could write/delete any
   subtask on any task by id. Scoped to task access (creator/assignee/can_manage), mirroring
   checklist_items. SELECT stays broad.
3. **audit_logs forging:** client insert was `WITH CHECK (true)`; restricted to
   `actor_id = auth.uid()`. Real inserts are SECURITY DEFINER triggers (bypass RLS), so unaffected.
Verified before writing: Settings/Guild change roles/XP/deactivation ONLY via RPCs (never direct
profile writes); AccountForm only writes full_name/avatar_url; audit trigger is SECURITY DEFINER;
no client inserts into audit_logs. So the trigger + tightened policies break no legit path.

## 2026-07-12 — Claude (Sonnet 5) — Status flow simplified, task file uploads, shift-report review, labels removed, manager template-assign

**NEW migrations `031_simplify_status_flow.sql`, `032_task_file_attachments.sql`,
`033_shift_report_review.sql`** — ⚠️ run all three BEFORE (or right after) deploying:
- Without 031, members can't advance ASSIGNED → IN_EDIT (old trigger only allows → NOTICED);
  admins/managers are unaffected (may do any transition).
- Without 032, task file uploads fail with a visible error ("bucket not found").
- Without 033, the approve/reject buttons on /reports show a graceful "migration 033 required" hint.

Changes:
- **NOTICED removed** (user decision): flow is now `ASSIGNED → IN_EDIT → DONE → APPROVED`.
  031 migrates NOTICED rows to IN_EDIT, tightens the CHECK, and redefines
  `enforce_task_status_transitions` — including NEW back-steps for assignees
  (`IN_EDIT → ASSIGNED`, `DONE → IN_EDIT`) surfaced as a "Back to …" button in TaskModal.
  `noticed_at` (12h SLA) is stamped server-side on the first move into IN_EDIT. Do NOT
  reintroduce the NOTICED literal in TS — it's gone from the `TaskStatus` union.
- **Real file uploads on tasks**: private `task-files` bucket, `attachments.storage_path`
  (+`file_type`, `url` now nullable), helper `lib/taskFiles.ts` (upload/sign/delete, 15 MB cap).
  Upload UI in TaskForm (create+edit, files upload after save) and in TaskModal's
  "References & files" (instant upload, per-file delete for uploader/admin/manager).
- **Labels removed from all UI** (TaskForm field, TaskModal header chips, TaskCard chips).
  DB column stays; inserts write `labels: []`.
- **Shift-report review**: green ✓ / red ✗ per report on /reports (admin+manager, direct
  RLS-gated update), Pending/Approved/Rejected filter pills, optimistic state, click-again-to-undo.
- **Template assign for managers**: the Templates page passed `isAdmin` only, so managers
  (e.g. Marian) saw the assign button disabled even though the `assign_template` RPC allows
  `can_manage()`. New `canManage` prop gates assign; create/edit/delete stays admin-only (RLS).
- Private todos now toggle ASSIGNED ↔ DONE (previously NOTICED-based).
- APP_VERSION → v0.33. Build green; live-verified on the dev server (create task without labels +
  with Files field, ASSIGNED → IN EDIT → back to ASSIGNED as admin, reports filter pills render;
  /reports data itself can't load locally — `.env.local` has a placeholder service-role key).

## 2026-07-11 — Claude (Opus 4.8) — Board columns = board_access members; per-user column drag

**NEW migration `030_board_members_fn.sql`** — deploy-safe (the board page falls back to the old
all-workspace-members query if the RPC is missing), but run it to actually get the filtering.

- **Board columns were showing everyone.** Regression from 028: the board page listed all
  `workspace_members`, and since 028 auto-enrolls every account, all 8 appeared as columns on every
  board regardless of `board_access`. Migration 030 adds `board_members(board_id)` (SECURITY
  DEFINER, gated to admins / members-with-access) returning only the profiles that have
  `board_access` for that board — needed because RLS (010) only lets a non-admin read their own
  board_access row, so a plain client query would collapse the roster to just themselves. The
  board page now calls this RPC, with a graceful fallback to the pre-030 query if it isn't there.
- **Per-user column reordering (columns view).** Each user can drag their columns via a grip handle
  in the column header (`MemberColumn` `dragHandleProps`). Order is personal, stored in
  localStorage keyed by user+board (`loadColumnOrder`/`saveColumnOrder` in `lib/boardViews.ts`) —
  NOT shared. Default order = your own column first, then everyone else A→Z; new members fall in at
  their default slot. A custom `boardCollisionDetection` keeps task-dragging and column-dragging
  from interfering (task drags never see the full-height column droppables and vice-versa).
- Bump APP_VERSION to v0.30.

## 2026-07-11 — Claude (Opus 4.8) — Time-of-day target on template tasks

**NEW migration `029_template_due_time.sql`** — ⚠️ **NOT deploy-safe: run 029 BEFORE deploying**
this code. The template save now sends a `due_time` column; if the deploy lands before the
migration, template creation errors with "column due_time does not exist".

- **Optional per-task time-of-day on templates** (`template_items.due_time TIME`, nullable). Some
  to-dos have a hard daily cutoff (e.g. "first login done by 06:05"). In the Create/Edit template
  modal each task now has a "Due by" time input (optional).
- **`assign_template` builds the first deadline at that wall-clock time in Europe/Berlin** (the
  app's canonical tz, same as the streak logic in 020): DAILY → next occurrence of the time (today
  if still future, else tomorrow, so it's never born overdue); WEEKLY → today+7d at the time;
  MONTHLY → today+1mo at the time. `due_time` NULL keeps the old NOW()+period behaviour.
- The recurring regeneration in `approve_task` (020) already carries deadline_at forward by one
  period, so the clock time propagates to every future copy automatically — 020 untouched.
- Because `deadline_at` now has a real cutoff, the near-deadline XP bonus / overdue penalty apply
  to it: finishing after the set time counts as overdue. Intended (user wants a hard target); the
  "5-min buffer" is just entering 06:05 instead of 06:00.
- Bump APP_VERSION to v0.29. Not yet pushed at time of writing — deploy only after 029 is run.

## 2026-07-11 — Claude (Opus 4.8) — Auto-enroll members, member-visibility fix, onboarding card by role

**NEW migration `028_auto_enroll_workspace_members.sql`** — Tan must run it in the Supabase SQL
editor after 027. Backfill + trigger update, idempotent, no deploy ordering constraints.

- **Members invisible in Settings — root cause + fix.** `handle_new_user` only ever inserted a
  `profiles` row; the `workspace_members` row was written solely by `/api/invite` AFTER a
  successful invite email. With no custom SMTP the mailer failed, so the route returned before the
  insert → auth user + profile existed but no `workspace_members` row → invisible in Settings
  (which lists `workspace_members`, not `profiles`). Migration 028 (a) backfills every orphaned
  profile into the canonical/oldest workspace and (b) makes `handle_new_user` enroll future
  signups automatically. This removes the whole bug class — members appear regardless of whether
  the invite email went out. `/api/invite`'s own upsert is now redundant but harmless (kept).
- **Dashboard onboarding card is role-aware** (`app/(app)/dashboard/page.tsx`): admins still see
  "Set up your workspace" → Create workspace. Everyone else (manager/employee/guest) with no
  accessible board now sees a "Waiting for board access" card telling them an admin or manager
  must add them — no misleading Create-workspace button.
- **Removed the "Defaults & links" section** from Settings (`SettingsForm.tsx`) — it was a static
  info blurb with no controls. Dropped the now-unused `ExternalLink` import.
- **Ops note (no code):** custom SMTP (Resend, sender `onboarding@resend.dev` until
  `safarixstudios.com` is verified in Resend — GoDaddy DNS still pending) was enabled in Supabase
  Auth to fix invite/reset emails. See `docs/current_status.md`.

## 2026-07-10 — Claude (Opus 4.8) — Date-picker icon, chatter↔member link, admin rename, quests on board

**NEW migration `027_chatter_link_and_member_rename.sql`** — Tan must run it in the Supabase SQL
editor. Deploy-before-migration safe (chatter_id insert only happens when a member is picked, and
locally/without the column it just won't match; rename & member dropdown degrade gracefully).

- **Date picker (`components/ui/DateField.tsx`):** the popup is no longer clipped by the
  `.app-card` `overflow:hidden` (moved into its own overlay layer — desktop dropdown, mobile
  centered modal). Added a SEPARATE, clearly visible **"Open calendar" icon button** next to the
  date text (Tan repeatedly couldn't find the trigger). Both open the same picker.
- **Shift/Time are fixed dropdowns now** (not free text): Shift = 1st/2nd/3rd shift, Time =
  6am-2pm / 2pm-10pm / 10pm-6am.
- **Chatter ↔ member link (027 part 1):** `shift_reports.chatter_id` (nullable FK to profiles).
  The public form shows a **member dropdown + "External / other" free-text** fallback (external
  chatters with no account still work). For members the name is snapshotted server-side from the
  profile in `lib/shiftReport.ts` (never trusted from the client) → `/reports` filtering no longer
  splits on typos ("Lloyd" vs "Loyd"). Public + edit pages read active members via service role.
- **Admin can rename members (027 part 2):** `set_member_name(p_user_id, p_name)` SECURITY DEFINER
  RPC (admin-only, 1–80 chars). Inline pencil-edit in Settings → Members & roles.
- **Quests surfaced on the board (light):** a member's own accepted/submitted quests
  (`quest_acceptances` RLS only exposes own rows anyway) now render as a **read-only "Quests"
  section at the top of their MemberColumn** (columns view) with deadline + urgency colour,
  linking to `/quests`. NO duplicate task rows, NO XP change — quests keep their own flow. Only
  wired into the `columns` view for now; MemberRowsView/TableView not yet. NOTE: these are visual
  to-dos only — real reminder *notifications* for quests are NOT built yet.
- Sidebar version → **v0.27**.

## 2026-07-10 — Claude (Fable 5) — Shift-report edits/PDF/delete, board reorder + view defaults, avatars, mobile pass

**NEW migrations `024_shift_report_edits.sql`, `025_board_positions.sql`, `026_avatars.sql`** —
Tan must run them in the Supabase SQL editor. The app is deploy-before-migration safe (edit token
fetched best-effort, board order sorted in JS via `sortBoards()`, avatar upload just errors until
the bucket exists) but the new features only work after they ran.

- **Public form fixes:** `/submit-report` was UNSCROLLABLE (global `body { overflow:hidden }`,
  page had no own scroll container) → submit button unreachable. Wrapper is now `h-dvh
  overflow-y-auto`. Native date input replaced by `components/ui/DateField.tsx` (custom
  month-by-month popover calendar, submits hidden `yyyy-mm-dd`).
- **Shift-report self-service edits (024):** submit returns a secret `edit_token`; success screen
  shows a copyable edit link → `/submit-report/edit/[token]` (public prefix already covered by
  middleware) → `/api/shift-report/edit`. Policy (Tan's decision): **max 2 edits within 8h**,
  enforced ONLY server-side. Every edit inserts in-app notifications (new type `shift_report`,
  CHECK widened in 024) for all active admins/managers with an old → new field diff. Existing
  files can be removed, new ones added (total ≤6). Shared validation extracted to
  `lib/shiftReport.ts` — submit + edit routes both use it.
- **Reports list:** admin-only hard delete (`/api/shift-report/delete`, removes storage files
  too), per-report + multi-select-checkbox **PDF export** (`lib/shiftReportPdf.ts`, jspdf added
  as dependency, images normalized to JPEG via canvas since jsPDF can't embed webp/gif), and an
  "edited ×n" badge. The public form's success screen also offers a PDF download.
  **`edit_token` is stripped server-side in `reports/page.tsx` — never send it to the list.**
- **Sidebar brand block** now shows `APP_VERSION` from `lib/version.ts` (currently `v0.26`)
  instead of "Safari Studios · internal". Convention: bump the minor to the latest migration.
- **Board order (025):** `boards.position` + drag-to-reorder (dnd-kit) in Settings → Boards &
  access. All board lists sort via `sortBoards()` in JS (deliberately NOT `.order('position')` —
  see deploy-safety above). NB: `DndContext` there needs its stable `id="settings-board-order"`
  or React logs a hydration mismatch.
- **Board views:** default view is now **Columns**; switcher order Columns → Member rows → Table
  → Selection (saved localStorage state still wins). Toolbar label fixed to "N open tasks" ("5
  active" read like active members). Collapsed member lanes show a compact summary ("2 Daily ·
  1 Weekly · next Fri 12 Jul"). **Empty WEEKLY/MONTHLY sections are now hidden** in member-rows
  AND columns views until a task of that category exists (Tan's explicit 2026-07-10 decision —
  supersedes the old "sections always render" note; DAILY always renders, creation happens via
  the Create-task modal's category dropdown). Consequence: you can't drag a task INTO a hidden
  empty section — change its category via task edit instead.
- **Avatars (026):** public `avatars` bucket + own-folder storage policies
  (`profiles.avatar_url` existed since 001). Upload/remove in Account settings (≤2 MB, unique
  path per upload to dodge caching). New `components/ui/Avatar.tsx` (photo or initials fallback)
  used in sidebar footer + leaderboard; member lanes/columns render the photo inline.
- **Mobile pass:** dashboard attention banners wrap on phones (`flex-wrap` + `min-w-[200px]`
  text). Dashboard/board/quests/submit-report verified at 375px in browser preview — usable.
- Verified in browser preview (logged in as admin): scroll fix, date picker (month nav + pick),
  view defaults/order, lane summaries, hidden empty sections, settings drag handles, account
  avatar UI, sidebar v0.26. Edit/PDF/delete flows compile + build green but need prod
  (service-role key + migrations) for end-to-end testing.

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
