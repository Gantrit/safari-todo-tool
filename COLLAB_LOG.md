# Collaboration Log — Safari To-Dos

Shared changelog for the two AI agents working on this repo (Codex/ChatGPT and Claude). See
`AGENTS.md` for the full project briefing and handoff protocol. Newest entries on top.

## 2026-07-19 (3) — Claude (Fable 5) — Reject is final: full XP penalty + streak break + no member reopen

⚠️ **ONE NEW migration: `041_reject_is_final.sql`** (run AFTER 040). It: adds protected column
`profiles.streak_broken_at`; **drops `reject_task(UUID, BOOLEAN)` and replaces it with 1-arg
`reject_task(UUID)`**; redefines `approve_task` (streak bonus ignores gain-days ≤ streak_broken_at)
and `enforce_task_status_transitions` (removes the member's REJECTED→IN_EDIT self-reopen).
`npm run build` green. v0.41.

Behaviour change (Tan): a rejection is now a real final decision, not a soft nudge —
- **Always deducts the task's full base XP** (category value + priority surcharge, same figure as
  the overdue penalty), clamped so XP never goes below 0. The old opt-in "-5 quality issue" second
  button is gone; there is a single "Reject task" action.
- **Breaks the streak** via `streak_broken_at`. The streak is derived from days with positive XP
  (no stored counter), so both consumers now filter it: `approve_task`'s streak bonus AND the
  character page ([character/page.tsx](app/(app)/character/page.tsx)) skip every gain-day on/before
  the stamp. So the streak restarts from 0 after a rejection.
- **Final for the member:** they can no longer drag/advance a REJECTED task back to IN_EDIT
  (`STATUS_FLOW['REJECTED']` is now null client-side, and the DB trigger raises). Only admin/manager
  `reopen_task` revives it.
- The neutral **"Back to IN EDIT (no penalty)"** reset (added earlier today) stays — that's the
  path for an accidental submit: plain status update, no XP/streak effect. Reject = intentional.

Do NOT reintroduce the two-button reject or the `p_quality_penalty` arg. `reject_task` is 1-arg now.

## 2026-07-19 (2) — Claude (Fable 5) — Dashboard deep-link fix, admin reset-to-IN_EDIT, notification delete, reports filter swap

⚠️ **ONE NEW migration: `040_notification_delete.sql`** (DELETE policy on `notifications`, own
rows only) — without it the new delete buttons show a "Migration 040 required" toast (the client
detects the silent 0-row RLS delete via `.select('id')`). `npm run build` green. v0.40. Migrations
038 + 039 were confirmed applied in prod today; next free number: **041**.

- **Dashboard banners linked to the wrong board** ([app/(app)/dashboard/page.tsx](app/(app)/dashboard/page.tsx)):
  the "Review"/"Review now" attention banners linked the workspace's FIRST board (Managers), so
  admins landed on a board with zero DONE tasks. Both banners now deep-link the board of the
  nearest relevant task (`?status=DONE` / `?urgency=overdue` — BoardView already understood these
  params, the banner just never sent them).
- **TaskModal: neutral admin reset for DONE tasks** — approvers now get "Back to IN EDIT (no
  rejection)" under Approve/Reject: plain status update, no XP, no rejection notification. Mirrors
  the assignee's own step-back (Tan's request after Jasmin's accidental submit).
- **Notifications are deletable** — per-row trash button (optimistic, [NotificationList.tsx](app/(app)/notifications/NotificationList.tsx))
  + "Clear all" with confirm ([MarkAllRead.tsx](app/(app)/notifications/MarkAllRead.tsx)). Both
  surface a policy-missing state instead of failing silently.
- **/reports filters swapped** (Tan): dropdown now lists distinct **chatter names** (free-text
  field — no member FK, so options derive from the reports themselves), the search field matches
  the **creator/model** name. Review pills reordered Pending/Approved/Rejected/**All** and default
  to **PENDING**; `creators` prop + its fetch removed from [reports/page.tsx](app/(app)/reports/page.tsx).
  Empty state explains the active filter instead of claiming "no reports yet".
- **Do not "fix" the Browser-pane ghost bug:** the embedded preview browser reports
  `document.visibilityState === 'hidden'`, so Next 16 parks page content in a hidden
  `<template>`/Activity — pages look empty and clicks/state changes appear to do nothing THERE.
  Real browsers are unaffected. Verify UI in a real browser; don't chase this as an app bug
  (it explains the 2026-07-18 "Reject click did nothing in preview" mystery).

## 2026-07-19 — Claude (Fable 5) — CRITICAL reject fix, action feedback, template sync, optimistic UI

⚠️ **TWO NEW migrations — run in the Supabase SQL editor: `039_fix_notification_types.sql` FIRST
(urgent bug fix, independent), then `038_template_sync.sql`.** `npm run build` green. v0.39.

1. **CRITICAL: "Reject task" has been silently broken since migration 024 (2026-07-05).**
   024 redefined `notifications_type_check` from the 001 list (+`shift_report`) instead of the
   012 list, dropping `rejected`/`comment`/`overdue`/`need_clarification`/`notice_sla_missed`/
   `xp_adjusted`. Because the RPCs insert their notification in the same transaction, the CHECK
   violation rolled back the WHOLE action: task reject (both variants), quest reject, and Guild
   Hall manual XP adjustments all no-opped while the client swallowed the error. **039 restores
   the full type union.** Found by clicking Reject with the new error toasts (see 2) — the DB
   answered `violates check constraint "notifications_type_check"`.

2. **Every task action now visibly reacts** (Tan: "buttons feel clunky / reject does nothing").
   NEW `lib/toast.ts` (DOM-based toast stack, same idiom as gamification fx helpers; styles in
   `globals.css`). `TaskModal`: `adminDecision`/`updateStatus` are now optimistic (status flips
   immediately, reverts on error), every outcome toasts (success AND the verbatim DB error — do
   not go back to swallowing RPC errors), per-button spinners via `pendingAction`. The Reopen
   button (APPROVED/REJECTED) got a hint line explaining it undoes the decision. `SubtaskList`
   toggle is optimistic now; `TaskCard.toggleItem` reverts + toasts on failure; BoardView drag
   moves/quick-add revert + toast on failure.

3. **Template edits can now propagate to already-assigned tasks** (migration 038 + UI):
   - `tasks.template_id` / `tasks.template_item_id` provenance columns; `assign_template` stamps
     them; `approve_task` carries them onto the recurring respawn (otherwise the link dies after
     one recurrence). Backfill links existing open recurring tasks by unambiguous (title, section).
   - NEW RPC `sync_template_tasks(template_id)` (admin-only): updates title/description/priority/
     section/reference + replaces checklists (ticked items stay ticked when title unchanged) on
     OPEN tasks only (ASSIGNED/IN_EDIT/REJECTED — never DONE/APPROVED). Deadlines untouched.
   - `TemplateLibrary` edit modal: **"Save + update assigned tasks"** button + explainer. Saving
     an edit now UPSERTS `template_items` (update kept ids / insert new / delete removed) instead
     of delete+reinsert — **stable item ids are load-bearing for the sync links, do not revert**.
   - The plain "Save changes" button keeps the old behaviour (no retro-apply).

4. Board hygiene (prod, via UI): deleted Jasmin's duplicate "LOGIN (Tomorrow)" task — it was the
   recurring respawn of a prematurely-approved LOGIN; tonight's real approval will respawn it.

Verified locally against prod Supabase: optimistic flip + revert + error toast on reject
(constraint error reproduced exactly), delete flow, quick-add. Reject can only fully succeed
after 039 runs.

## 2026-07-18 — Claude (Opus 4.8) — Approval notifications, quest visibility, template UX, board speed

⚠️ **NEW migration `037_notify_on_submit_for_approval.sql` — run it in Supabase after 036.**
(036 from the previous entry must be run too if it hasn't been yet.)

Five things from Tan, launch-day polish:

1. **Template assign no longer yanks you to the board.** `TemplateLibrary.tsx` used to
   `router.push('/board/...')` on success. Now it shows an inline success banner (with a "View
   board →" link) and stays in the Assign modal, so you can assign the same bundle to several
   members in a row. Button flips to "Assign again"; "Cancel" → "Done".

2. **Approval notifications were never sent (real bug).** The only "submitted for review" trigger
   was `notify_on_result_submit` (003), which fires on `tasks.result_url` NULL→set. But marking a
   task DONE only sets `status`+`completed_at` (see TaskModal.updateStatus) and never touches
   `result_url`, so admins/managers got NOTHING when work needed approval — only shift-report
   notifications worked. **Migration 037** adds `notify_on_submit_for_approval`: AFTER UPDATE OF
   status, when a task enters DONE, notify active admins (any task) + active managers (only when
   the assignee is a plain member, matching the 035 approval hierarchy), excluding the submitter.
   Uses the existing `result_submitted` type; the email webhook (021) picks it up for free.

3. **Quests — who accepted + board section.** QuestBoard now shows an "Accepted by" roster on each
   quest card (name + status: In progress / Awaiting review / Approved / Not approved). Non-admins
   only see their own acceptance (RLS), so it's mainly an admin/manager view — verified live
   ("Cindy Ling · In progress"). The board's per-member quest section was already separate (it is
   NOT stored under WEEKLY — quest acceptances are their own table surfaced read-only); renamed the
   header "Quests" → **"Open Quests"** in `MemberColumn.tsx` and added a "View details →" affordance.

4. **Deep-linking.** The board "Open Quests" card now links to `/quests?quest=<id>`; QuestBoard
   reads that param on mount and scrolls to + briefly flashes the matching quest (imperative
   `.classList` toggle + a `quest-deeplink-flash` keyframe in globals.css — done on the DOM node,
   not via React state, so a background refresh can't wipe the flash). Effect confirmed running
   with the right id via console; couldn't fully eyeball the flash this session (preview tooling
   was stuck — screenshots timing out).

5. **Board load speed.** Folded the quest-acceptances query into the board page's main
   `Promise.all` so it's one parallel batch instead of a chained round-trip. Modest win — the
   bigger cost is the tasks query's nested joins (comments+profiles+reactions, attachments,
   subtasks per task); lazy-loading comments/attachments into the modal is the real optimization
   but it's a riskier refactor (TaskCard shows comment/attachment counts) — left as a follow-up.

`APP_VERSION` → **v0.37**. Build green. Migrations 036 + 037 still need running in Supabase.

## 2026-07-18 — Claude (Opus 4.8) — Orphan tasks: surface them + block at the source (migration 036)

⚠️ **NEW migration `036_assign_template_board_access.sql` — run it in Supabase after 035.**

**Symptom (Tan):** dashboard showed "6 open / 4 overdue" but the tasks were nowhere on the board —
clicking through landed on the Managers board with all columns empty. The Managers header even
said "4 members · 6 open tasks" while every visible column showed 0.

**Root cause:** leftover from the pre-fix template mis-assignment (see 2026-07-16 entry). 6 tasks
had been created on the **Managers** board assigned to **Aj**, who only has board_access to
**Chatting**. The board renders one column per `board_access` member (`board_members` RPC), so Aj
had no column on Managers → the 6 tasks were counted (header + dashboard) but rendered in NO
column: invisible and impossible to find/delete. 4 of them were past deadline → the overdue alert.

**Two-part fix:**
1. **Surface orphans (`app/(app)/board/[boardId]/page.tsx`):** the board member list is now
   `board_access members ∪ {anyone who actually has a task on this board}`. Any assignee with a
   task here gets a visible column even without a board_access row, so a task can never again be
   counted-but-invisible. After the guard below, this only ever surfaces legacy orphans for
   cleanup. Verified live: Managers now shows "5 members · 6 open tasks" with an Aj column holding
   the 6 (findable + deletable).
2. **Block at the source (migration 036):** `assign_template` now raises unless the assignee has a
   `board_access` row for the target board (admins exempt — implicit access everywhere). Combined
   with the 2026-07-16 UI dropdown scoping, a wrong board/member pair can no longer create orphans,
   whatever calls the RPC. Body otherwise identical to 029 (due_time logic preserved).

`APP_VERSION` bumped to **v0.36**.

**NOTE — leftover prod data:** the 6 Aj/Managers tasks (2 LOGIN, 2 LOGOUT+SHIFT REPORT, 2 Feedback
Call — two accidental assigns at 14:07 + 14:08) are pure duplicates; Aj already has the correct
copies on Chatting. They are now visible in Aj's Managers column and can be soft-deleted in-UI (or
were cleaned — check with Tan). Deleting them clears the dashboard overdue alert.

## 2026-07-16 — Claude (Sonnet 5) — Fix: template assignment ignored per-board access

**Bug:** assigning a template to a member who only has `board_access` to one board (e.g. Chatting)
while the "Assign to member" form's Board dropdown was left on its default (the first board,
Managers) silently created the tasks on the WRONG board. The member never saw them (their board
column only exists on boards they actually have access to), and the redirect after assigning
landed the admin on that wrong board too, looking empty.

**Root cause:** `app/(app)/templates/page.tsx` fetched `workspace_members` (every org member) and
`TemplateLibrary.tsx`'s `availableMembers` filtered only by `workspace_id`, not by actual
`board_access` per board. Since all boards share one workspace, every member showed up as a
selectable assignee regardless of which board was selected — nothing enforced that the chosen
board and chosen member were actually consistent.

**Fix:** `page.tsx` now calls the existing `board_members(p_board_id)` RPC (migration 030 — the
same SECURITY DEFINER function the board page already uses to build columns) once per board and
passes a `{ [boardId]: profiles[] }` map into `TemplateLibrary`. The Member dropdown is now scoped
to `boardMembers[selectedBoardId]`, so a member with no access to the selected board simply isn't
selectable — the mismatch this bug required is now structurally impossible. Verified the RPC
values directly (Managers → 4 members, Chatting → 8 members, no overlap in the reported case) and
via `npm run build`; could not do a full click-through in the browser preview this session (the
preview tooling itself was stuck/flaky), so a manual smoke test of Templates → Assign to member is
still worth doing after deploy.

## 2026-07-16 — Claude (Sonnet 5) — Fix: dashboard KPIs leaked other users' private tasks

**Bug:** admin dashboard showed "1 task is overdue" / "Open tasks: 1" even though both boards
(Managers, Chatting) genuinely had 0 open tasks. Root cause: `app/(app)/dashboard/page.tsx`'s
`allOpenTasks` query (used for the Open/Overdue/Awaiting-approval KPI tiles) selected from
`tasks` with no `board_id` filter — so it picked up **private todos** (`board_id IS NULL`,
see `/private`) belonging to *any* user, not just the viewing admin. Confirmed via REST query:
the phantom overdue task was Cindy Ling's private "make 400 sales a day" (due 2026-07-14).

**Fix:** added `.not('board_id', 'is', null)` to that query so team-wide dashboard counters only
count real board tasks. Private tasks stay private and no longer leak into anyone else's KPI
tiles. No migration needed (query-only change). Verified live in browser: banner and Overdue
tile correctly clear once the filter is applied.

**Note for next agent:** RLS currently lets an admin's session `SELECT` another user's private
task via the REST API (used to debug this) — private tasks may not be as RLS-isolated as the
`/private` page implies. Not fixed here (out of scope for this bug), but worth a look if privacy
of `/private` tasks becomes a concern.

## 2026-07-14 — Claude (Opus 4.8) — PLANNED (NOT built): shift-report screenshot retention

⚠️ **This is a DECIDED design, deliberately NOT implemented yet** (Tan wants it recorded, not
built). No code/migration/cron exists for this — it's a spec for whoever builds it next.

**Goal:** stop Supabase Storage growing forever from chatter sales screenshots. Screenshots live in
the private `shift-report-files` bucket (DB only holds tiny `shift_report_files` rows: path/name/type).
Task files (`task-files`) and avatars (`avatars`) are separate buckets. There is currently **NO
auto-wipe/retention anywhere** — files persist until an admin manually deletes a report
(`/api/shift-report/delete` already removes the storage objects + rows, keeps nothing).

**Agreed retention rule (Tan, 2026-07-14):**
- Delete the **screenshots only** (storage objects + `shift_report_files` rows); **keep the
  `shift_reports` row forever** (sales/subs/notes stay — history preserved). This is why option
  "compress on upload" was rejected: sales figures must stay pixel-exact while they matter.
- **APPROVED** reports: wipe screenshots **40 days after `reviewed_at`** (approval time).
- **PENDING / REJECTED** reports: also wipe **40 days after `created_at`** (submission), so
  forgotten/never-reviewed reports don't keep images forever. (Tan chose the broader scope.)
- 40 days = deliberately ">1 month, so everything is safe" per Tan.

**Suggested implementation (not built):**
- Daily **Vercel Cron** → protected API route (guard with a `CRON_SECRET` header) → runs with the
  now-true service-role `createAdminClient` → selects due reports, `storage.remove(paths)` from
  `shift-report-files`, deletes `shift_report_files` rows, leaves `shift_reports` intact.
- Add a `files_wiped_at TIMESTAMPTZ` column to `shift_reports` so the reports UI can show
  "Screenshots removed after 40 days" instead of an empty gap vs. "no screenshots uploaded".
- Alternative to Vercel Cron: Supabase `pg_cron` (pg_net is already used by migration 021).

**Not decided:** exact cron mechanism (Vercel Cron vs pg_cron) — pick at build time. Check Tan's
Supabase plan/storage headroom (Dashboard → Settings → Billing/Usage) when prioritising.

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
