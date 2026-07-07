# Collaboration Log — Safari To-Dos

Shared changelog for the two AI agents working on this repo (Codex/ChatGPT and Claude). See
`AGENTS.md` for the full project briefing and handoff protocol. Newest entries on top.

## 2026-07-07 - Claude (Sonnet 5) - Actually fix empty-section collapse (previous fix was incomplete)

User reported the bug from 2026-07-06 was still happening: their own column's Daily/Weekly/Monthly
sections stayed expanded as empty header rows instead of the slim "+ Section" chip. Root cause the
previous fix missed: `manuallyOpened` in `TaskSection.tsx` was only reset when the user clicked the
header *themselves* while empty — but if the section's last task disappeared some other way (task
approved/archived, deleted, moved to another section), `manuallyOpened` stayed `true` forever and
the section never collapsed back to a chip on its own.

- Added a `useEffect` that resets `manuallyOpened` to `false` as soon as the section has real tasks
  again (`tasks.length > 0`). This makes the flag purely transient — it only exists to keep the
  section open while the user is mid-typing their first task into a freshly-opened empty section;
  once that task lands, the flag clears, so if the section empties out again later (by any means)
  the `tasks.length === 0 && !manuallyOpened` chip check fires correctly.
- Verified live in browser: opened Tan's empty Daily To-Dos chip, added a task (section stayed
  open, as expected), then deleted that task via the task's trash icon — section collapsed back to
  the "+ DAILY TO-DOS" chip immediately, no stale expanded empty box. `npm run build` clean.

## 2026-07-06 - Claude (Sonnet 5) - Empty-section collapse fix + personal Account settings

Two follow-ups from user testing of the same session's board redesign:

- **Fixed `TaskSection.tsx`**: collapsing an empty, manually-expanded section (clicking the header
  chevron) previously left it as a full-width empty header row instead of reverting to the slim
  "+ Section" chip — `manuallyOpened` state was never reset. Header click handler now checks
  `tasks.length === 0` and resets to the chip in that case instead of toggling `collapsed`.
- **NEW `/account` page + `AccountForm.tsx`, all roles** (previously missing entirely): `/settings`
  redirects any non-admin straight to `/dashboard`, so regular members had no UI to change their
  display name or toggle notifications, even though `profiles.full_name` and
  `notification_preferences` (in_app_enabled/email_enabled) already existed and already had
  working self-service RLS — just no route. Sidebar gets a new "Account" group (visible to
  everyone) linking to it. Notification prefs are upserted (`onConflict: 'user_id'`) since
  `handle_new_user()` never seeds a `notification_preferences` row for new signups (only migration
  004's one-time backfill did, for users that existed at that time) — new users hit this page with
  no existing row, upsert handles it, no migration needed.
- Added `NotificationPreferences` type to `lib/types.ts`.
- Verified live in browser: name save round-trips, notification checkboxes persist across reload,
  empty-section chip open/collapse cycle behaves correctly (Daily To-Dos expand → collapse →
  back to chip, Weekly/Monthly untouched). `npm run build` clean.

## 2026-07-06 - Claude (Sonnet 5) - Remove IMMINENT section, ClickUp-style Create Task

User feedback on the board UI: IMMINENT was redundant as a section since Priority
(LOW/MEDIUM/HIGH) already exists, and the Create Task modal wasted space with an always-expanded
assignee list and bulky reminder toggles. Full plan in `PLAN_clickup_style_board.md`.

- **`TaskSection` is now `'DAILY' | 'WEEKLY' | 'MONTHLY'`** — dropped `IMMINENT`. **NEW migration
  `017_remove_imminent_section.sql`** (not yet run by user as of this entry — confirm before next
  session assumes it's live): backfills existing `IMMINENT` tasks/templates to `DAILY`, tightens
  the `tasks`/`task_templates` section CHECK constraints, and redefines `approve_task()`.
- **The old +10 "imminent" XP bonus is now a deadline-proximity bonus**, not a section flag:
  completing a task within `NEAR_DEADLINE_WINDOW_HOURS` (24h, confirmed with user) before its
  deadline earns the same +10, regardless of Daily/Weekly/Monthly. Mirrored in both
  `approve_task()` (SQL, migration 017) and the client-side preview in
  `calculateApprovalXp` (`lib/types.ts`) — keep these two in sync if the window ever changes.
  Also added `isNearDeadline()` in `lib/utils.ts` (used by `TaskCard.tsx`'s `.is-imminent` visual
  accent) so the board highlight matches the XP rule instead of the old section check.
- **`TaskSection.tsx`**: sections with zero tasks now collapse to a slim dashed "+ {label}" chip
  (droppable, so drag-and-drop into an empty section still works) instead of rendering an empty
  header + card-stack. Click to expand in place. Viewers (no write access) don't see the chip at
  all if a section is empty — nothing to add, nothing to show.
- **`TaskForm.tsx`** (Create Task modal): Assignees list is now a disclosure (collapsed by default,
  shows selected-avatar chips + chevron, click to expand) instead of always-expanded. Reminders
  are plain checkboxes instead of big toggle switches. Added a **Category** field (Daily/Weekly/
  Monthly select, default Daily) between Reminders and Recurring task — this is the new home for
  what section a task lands in; the `section` prop passed in from the board's "+" button is now
  just the field's initial default, not the value used on submit (`category` state is).
- Verified live in browser (Tan/Admin login, Backend board): empty-section chips, disclosure
  toggle, and the new Category field all behave as designed. `npm run build` clean.
- **Don't re-scaffold**: if migration 017 hasn't been run yet by the time you read this, existing
  `IMMINENT` rows in the live DB will simply not render anywhere on the board (no matching
  section in the UI) until it's applied — expected, not a bug.


## 2026-07-06 - Claude (Sonnet 5) - Board rename, board-access opt-in, invite error surfacing

Triggered by user hitting a real "duplicate key value violates unique constraint
board_access_pkey" error while manually testing the invite → register → grant-access flow live
(Marian's account) in Settings.

- **Board rename was fully broken at the DB level, not just missing UI:** `boards` had `INSERT`/
  `DELETE` RLS policies (002, 009) but **no `UPDATE` policy at all**, so any rename attempt was
  silently denied by RLS regardless of UI. **NEW migration `015_board_rename.sql`** (admin-only
  `boards_update` via `is_admin()`) — **run by user, confirmed**. Added a pencil-icon inline
  rename control per board row in `app/(app)/settings/SettingsForm.tsx` (`renameBoard()`,
  `renamingBoard`/`renameValue` state).
- **Root cause of the duplicate-key error:** migration 010's `seed_member_board_access_trigger`
  auto-grants a new workspace member access to *every* existing board immediately on
  `workspace_members` insert (it was written to avoid lockout when 010 first shipped, but keeps
  firing for every new member since). So Marian already had `board_access` rows for both boards
  in the DB the moment she was added — but `SettingsForm`'s local `access` React state (seeded
  once via `useState(boardAccess...)`) goes stale after any `router.refresh()` (component stays
  mounted, prop changes don't reset `useState`'s initial value), so the UI still showed her
  checkbox as unchecked. Clicking it then tried to `INSERT` a row that already existed.
  - Fixed the stale-state bug generally: added a `useEffect` in `SettingsForm.tsx` that
    resyncs `access` whenever the `boardAccess` prop changes.
  - Made `toggleAccess`'s grant path an `upsert` (`onConflict: 'board_id,user_id'`) instead of
    a plain `insert`, so a duplicate grant is a no-op instead of an error, as defense in depth.
- **Product decision (explicitly asked, user chose "opt-in"):** board access should NOT
  auto-grant on join. New members must start with zero board access; admin grants per board in
  Settings, member sees it after a refresh. **NEW migration
  `016_board_access_opt_in.sql`** drops both 010 auto-grant triggers/functions
  (`seed_board_access_trigger`/`seed_member_board_access_trigger` and their functions) and
  clears existing auto-seeded `board_access` rows for all non-admin members (one-time cleanup,
  re-grant as needed in Settings afterward) — **run by user, confirmed**.
- **`/api/invite`** now returns the actual error if the `workspace_members` upsert fails instead
  of silently reporting `{ success: true }` — this silent failure is the likely reason Marian's
  account existed in `auth.users`/`profiles` but had no `workspace_members` row for a while
  (fixed by hand via a one-off SQL insert before 016 existed).

## 2026-07-06 - Claude (Opus 4.8) - Invite/auth flow + single-org model

- **Fixed the production invite failure** (two bugs). (1) "Database error saving new user" was
  `handle_new_user()` missing `SET search_path` → the auth-schema trigger couldn't resolve
  unqualified `profiles` (`42P01` in Postgres logs). **NEW migration `013`** pins
  `search_path = public, pg_temp` + qualifies `public.profiles`. (2) The app had NO auth callback
  or set-password route, so the invite link (session in URL hash) dead-ended on `/login`. Added
  `app/(auth)/set-password` (invite/recovery → choose password) and `app/(auth)/callback`
  (magic link → dashboard); `middleware.ts` treats both as public so the hash token survives;
  invite + reset now redirect to `/set-password`, magic link to `/callback`.
  **Requires:** Supabase Auth → URL Configuration → Redirect URLs must include the Vercel + local
  URLs (`/**`), or Supabase rejects the redirect.
- **Collapsed to a single-organization model** (user decision). App had 2 accidental workspaces;
  deleting a board left its workspace in the switcher. **NEW migration `014`** (idempotent) merges
  all workspaces into the oldest (moves boards + workspace_members, deletes empties, renames to
  "Safari Studios"). Sidebar `WorkspaceSwitcher` now static when ≤1 workspace + no "New workspace";
  settings reworded to "Organization & team". Boards are the departments. Guild KPI clipping fixed
  (`.metric-value` line-height 1→1.08).
- **Migrations 013 + 014 must be run in the Supabase SQL editor** (013 already run by user; 014 pending).
- Open: deeper Settings visual redesign still wanted (only wording/switcher cleanup done so far).

## 2026-07-06 - Claude (Opus 4.8) - Character spacing + AGENTS.md rewrite

- `app/(app)/character/page.tsx`: more generous, consistent spacing (hero p-7→p-8 + more
  internal gaps, stat grid gap-4→gap-5 & cards p-5→p-6, section rhythm mb-6→mb-7, list bodies
  py-4→py-5). Purely visual — build green, verified live.
- **Rewrote `AGENTS.md`** — the old version was stale: it claimed Codex is the sole builder and
  Claude only reviews (both build now), listed only the `admin`/`user` role model, missed the
  character/guild/leaderboard pages and the board view variants, and said migrations stop at 003.
  New version reflects the current roles (admin/manager/employee/guest), full page/component map,
  migrations 001–012, and the server-side-only XP RPCs (approve_task/review_quest/admin_adjust_xp).
  Shorter and accurate. If anything here drifts again, trust the code + COLLAB_LOG over it.
- Also earlier this session: surfaced the real `/api/invite` error in Settings (was a generic
  "Invite could not be sent"). Known open issue: production invite still returns Supabase
  "Database error saving new user" — a DB-side trigger/constraint on user creation, NOT an env
  var problem (service-role key + APP_URL are set and the auth/v1/invite call is reached). Needs
  a look at the `handle_new_user` trigger / profiles insert on invited signups. Deferred by user.

## 2026-07-06 - Claude (Fable 5) - Guild Hall / Character / Leaderboard + pre-launch fixes

Full live screening (logged into local dev via browser preview; complete task flow incl. real
XP payout verified end-to-end) plus the missing gamification surface. Build passes; all new
pages verified live in the browser.
- **NEW MIGRATION — run in Supabase SQL editor after 011:** `012_guild_xp_management.sql`.
  Adds admin-only SELECT policy on `xp_log`, `admin_adjust_xp(user, amount, reason)` RPC
  (is_admin gate, ±1000 cap, mandatory reason, pays through `award_xp` → xp_log + audit +
  notification, new `xp_adjusted` notification type), and `xp_leaderboard(p_since)` RPC for
  weekly/monthly standings. **Until applied, Guild XP buttons and weekly/monthly leaderboard
  tabs show a clear "migration 012 required" message (verified live) — nothing breaks.**
- **NEW `/guild` (admin-only, sidebar "Guild Hall"):** member roster sorted by XP, guild KPI
  cards, per-member expandable panel (tasks approved, quests, next level), Award/Deduct XP
  flow (quick amounts + custom + reason), per-member XP history.
- **NEW `/character` (all users, sidebar "My character"):** hero card (level/rank/XP bar/
  streak), stat cards (week XP, tasks approved, on-time rate, quests), rank ladder, quest
  log, XP history.
- **NEW `/leaderboard` (all users):** All-time / This week / This month tabs, top-3 podium
  cards, rest as list. Weekly/monthly call `xp_leaderboard` client-side.
- **Dashboard:** the big leaderboard section is REPLACED by a compact link strip to
  `/leaderboard`. Don't reintroduce the full leaderboard there.
- **Sidebar:** new "Progress" group (My character, Quests, Leaderboard); "Guild Hall" under
  Administration. Footer XP label fixed (no more "Next: Rookie" for same-rank level-ups).
- **Settings workspace-scoping bug fixed:** `settings/page.tsx` picked `workspaceMembers[0]`
  regardless of the selected workspace (showed "Safari" while sidebar was on "Backend"). Now
  honors `?workspace=` and shows workspace switcher pills when the admin has several.
- Quest cards: removed forced `min-h-[290px]` (dead empty space on short cards).
- Launch notes for the human: only 1 real user exists so far (invites need
  `SUPABASE_SERVICE_ROLE_KEY` + `NEXT_PUBLIC_APP_URL` set on Vercel for /api/invite), and two
  near-empty duplicate workspaces ("Backend" + "Safari") should be consolidated.

## 2026-07-05 - Claude (Opus 4.8) - Post-merge screening fixes (3 bugs)

Static review of the merged `redesign-2026` work found 3 real bugs; fixed on branch
`redesign-2026-fixes`. Build passes.
- **NEW MIGRATION — run in Supabase SQL editor after 010:** `011_board_soft_delete.sql`.
  Root cause: `tasks.board_id` had `ON DELETE CASCADE`, so deleting a board in Settings
  permanently hard-deleted every task on it (bypassing soft-delete + audit; only a `confirm()`
  guarded it). Fix relaxes that FK to `ON DELETE SET NULL` and adds admin-only
  `soft_delete_board()` RPC that soft-deletes the board's live tasks first, then removes the
  board. **Until 011 is applied, the "Delete board" button errors safely (function missing) —
  no more silent data loss either way.**
- `SettingsForm.tsx` `deleteBoard` now calls `rpc('soft_delete_board')` instead of a raw
  `boards.delete()`; button shows a spinner while busy.
- `BoardView.tsx` drag-and-drop no longer silently collapses a **multi-assignee** task to a
  single assignee: cross-member drag only reassigns to the target member when the task isn't
  already assigned to them; otherwise it keeps all assignees and just changes the section.
  Applied to both the optimistic update and the position-persistence patch.
- `BoardView.tsx` "Created by" filter is now built from actual task creators (resolved via
  members → task.creator_profile → fallback), so tasks created by non-board-members are
  filterable instead of invisible in the filter.
- Not undo: keep the `board_id` FK as `SET NULL` and route board deletion through
  `soft_delete_board` — don't restore the raw cascade delete.

## 2026-07-05 - Claude (Opus 4.8) - TaskModal sidebar spacing polish
- `components/task/TaskModal.tsx` only, no logic/schema changes. Right-hand action column felt
  cramped ("nah dran"): the "Need clarification?" and "Task details" blocks were separated by thin
  `border-t` dividers directly under the primary action button.
- Change: aside vertical rhythm `space-y-6` → `space-y-7`, aside padding `sm:px-7` → `sm:px-8`,
  section labels `mb-3` → `mb-3.5`. The "Need clarification?" block is now a self-contained
  `var(--surface)` card (matching the Task-details card) instead of a `border-t` section — clearer
  grouping + breathing room. Purely visual; build passes.

## 2026-07-05 - Claude (Opus 4.8) - redesign-2026 Phase 4: roles + board permissions
- Branch `redesign-2026`. Most sensitive phase — extends the EXISTING role model, no parallel system.
- **TWO NEW MIGRATIONS — run in the Supabase SQL editor, in order, after 008:**
  * **`009_roles_and_permissions.sql`** — retires `user` (→`employee`), adds `manager` to the role
    CHECK (profiles + workspace_members), default role now `employee`. Adds `can_manage()`
    (admin OR manager). Fixes board creation: `boards_insert`/`boards_delete` now gate on
    `is_admin()` (the old member-join policy denied admins who weren't in `workspace_members`).
    Extends team powers to managers: status-transition trigger, `approve_task`/`reject_task`/
    `reopen_task`, `tasks_update`, and `soft_delete_task` now use `can_manage()`. New admin-only
    RPCs `set_member_role`, `set_member_deactivated` (needed because profiles_update RLS is self-only).
  * **`010_board_access.sql`** — enforces the (previously dormant) `board_access` table. SEEDS
    access for every existing (member × board) pair FIRST (nobody gets locked out), lets users read
    their own access rows, then makes `boards_select`/`tasks_select` require a `board_access` row
    (admins bypass). Triggers auto-grant access on new boards and new memberships.
- **Role mapping (stored value = product name):** admin=Admin, manager=Manager (new),
  employee=Member, guest=Viewer. Chosen over a full value-rename (safer, no data churn). Labels +
  helpers live in `lib/types.ts` (`ROLE_LABELS`, `roleLabel`, `canManageTeam`, `isViewerRole`,
  `canWriteTasks`). `Role` type dropped `user`.
- Rights: Viewer read-only (UI hides create/quick-add/delete/status; RLS enforces), Member = own
  tasks + delete own, Manager = team-wide manage + delete (approved by user), Admin = everything.
- Settings (`SettingsForm.tsx` + page): per-member role dropdown, deactivate/reactivate + remove
  (confirm dialogs), and per-board access toggles per member. Deactivated users are blocked in
  `app/(app)/layout.tsx` via `DeactivatedNotice` (data kept, access off).
- Client gating added in TaskModal (managers can approve/reject/reopen; viewers read-only), TaskSection
  (no quick-add/create for viewers), BoardView (no Create task for viewers). `canDeleteTask` now
  includes managers.
- Not undo: don't re-narrow the manager gates back to admin-only; don't enforce board_access without
  the seed step (would lock everyone out).

## 2026-07-05 - Claude (Opus 4.8) - redesign-2026 Phase 3: board view switcher
- Branch `redesign-2026`. Makes the board usable at ~25 members. No schema/data changes.
- New segmented view switcher at the top of the board with 5 views, all inside ONE `DndContext`
  and all reusing the Phase-2 `TaskCard`/`TaskSection` (no re-built rows):
  * `members` (default) — `MemberRowsView`: each member is a collapsible lane with an open-count
    badge; **collapsed lanes render no tasks at all** (only expanded members mount their
    `TaskSection`s — the perf story for 25 members).
  * `table` — `TableView`: flat, sortable list (Deadline/Priority/Status/Member/Title, asc/desc)
    of the same rows with `showAssignee` (member shown as an avatar column in each row).
  * `focus` — one member (default = current user), rows always expanded, member picker above.
  * `selection` — multi-select members via chips, shows only the chosen ones.
  * `columns` — the existing `MemberColumn` matrix, kept as-is.
- **Structural decision:** kept the column matrix as the `columns` view rather than retiring it.
  It's the only view with cross-member drag-and-drop reordering (an existing feature), so dropping
  it would silently remove that. The four new views are additive and share one row renderer + one
  filter pipeline, so there's no duplicated task-row logic. `members` is the new default.
- Filters (`lib/boardViews.ts` `filterTasks`): Status + Urgency + **Created-by** (the "creator"
  filter — `department_id`/`project_id` aren't meaningfully populated, so I used `created_by`,
  which is). Combinable, apply across ALL views. `BoardFilterBar` = toggle chips in a panel.
- View + filters + focus/selection persisted per board in `localStorage` (`safari:boardview:<id>`),
  hydrated in an effect after mount (SSR-safe; not a lazy initializer, to avoid hydration mismatch).
- New files: `lib/boardViews.ts`, `components/board/{MemberRowsView,TableView,BoardViewSwitcher,
  BoardFilterBar}.tsx`. `TaskCard` gained an optional `showAssignee` prop (table only).
- Note: dragging works in columns + member-rows (section droppables); in table it technically
  reorders global position — low risk (thin bar handle) but flag if you want it disabled there.
- Still pending: Phase 4 (rights UI, role-model cleanup in `lib/types.ts`).

## 2026-07-05 - Claude (Opus 4.8) - redesign-2026 Phase 2: task rows, quick-add, delete
- Branch `redesign-2026` (continues from Phase 1). First phase with real logic changes.
- **NEW MIGRATION `008_task_delete_rpc.sql` — must be run in the Supabase SQL editor after 007.**
  Adds `soft_delete_task(p_task_id)` (SECURITY DEFINER): sets `deleted_at` if the caller is the
  task's creator OR an admin (`is_admin()` from 007). Needed because `tasks_update`/`tasks_delete`
  RLS only allow creator/assignee — an admin who is neither could not delete otherwise. Uses the
  EXISTING role model, no parallel roles. Until it runs, the delete button will error.
- What changed:
  1. `TaskCard` rebuilt as a compact, collapsible ClickUp-style row: colour bar (combined
     status/priority, doubles as drag handle) + title + urgency chip when collapsed; description,
     checklist progress, assignees, reminders, labels, reference + "Open details" on expand.
     Expand is animated via `grid-template-rows 0fr→1fr`, multiple open at once,
     `prefers-reduced-motion` respected. The full `TaskModal` is still reachable via "Open details".
  2. Graded urgency in `lib/utils.ts` `getUrgency()` — overdue (red) / today·≤2h (orange) /
     tomorrow·≤3d (yellow) / further (neutral), colour AND text. New `--orange`/`--yellow` tokens.
     Also `taskAccentColor()` and `canDeleteTask()` helpers.
  3. Quick-add: per-section single-line input in `TaskSection` — type a title, Enter inserts a task
     with defaults (that section, **assignee = the column's member**, priority MEDIUM, status
     ASSIGNED, Berlin end-of-period deadline). Optimistic insert in `BoardView.handleQuickAdd`,
     reconciled with the server row (rolls back on error). The full "Create task" modal is unchanged.
     Design note: assignee defaults to the column owner (not always the current user) so the task
     appears in the lane where it was typed — for your own column that is you.
  4. Delete: trash button on each row, visible only to creator/admin (`canDeleteTask`). Confirmation
     modal, then optimistic removal via `soft_delete_task` RPC (rollback + error on failure).
- Not undo: don't reintroduce a whole-card `onClick`→modal on the row (drag/click conflict); the
  colour bar is the drag handle, chevron/title toggle expand, "Open details" opens the modal.
- Still pending: Phases 3–4 (view switcher, rights UI, role-model cleanup in `lib/types.ts`).

## 2026-07-05 - Claude (Opus 4.8) - redesign-2026 branch, Phase 1: visual polish
- Context: User (Tan) commissioned a full 4-phase UI/UX + feature redesign. **This work is on a new
  branch `redesign-2026`, not `main`.** Deliberate, user-approved deviation from the usual
  "Codex builds / Claude reviews" split — for this engagement Claude does the whole rebuild.
- What changed (Phase 1 = pure visual polish, NO logic/data/rights/view changes):
  1. `app/globals.css` token overhaul. Warmed the dark ramp (olive-charcoal, 6 elevation steps
     `--surface`…`--surface4`) away from flat green-black; warm ivory text; kept gold `#C8A96A`.
     Added `--shadow-sm/md/lg/accent`, `--hairline-top`, a 4pt `--space-*` scale, softer radii,
     and slightly warmer/desaturated semantic colors (meaning preserved). Cards now have real
     elevation (`--shadow-md` + inset hairline) instead of flat borders.
  2. Typography: introduced **Fraunces** (warm display serif) via `--font-display`, applied ONLY
     to `.page-title` + `.metric-value` (big statement moments); Manrope stays for all UI/body.
     Note: this is NOT the old Syne prototype — Fraunces is a deliberate warm/edel choice.
  3. Recurring motif: gold hairline rule on `.card-header::before` + `.page-eyebrow::before` tick
     (echoes the active nav indicator), plus a unified `.icon-chip` treatment for standalone icons.
  4. Dashboard hierarchy: new `.attention-banner` (overdue dominates, else admin review); overdue
     KPI card + "My tasks" overdue rows get red emphasis; non-urgent rows recede. Presentational
     only — reads existing `overdueTasks`/`pendingApproval`.
  5. Empty/Loading/Error states: new reusable `components/ui/{EmptyState,Skeleton,ErrorState}.tsx`,
     branded skeleton in `app/(app)/loading.tsx`, new `app/(app)/error.tsx` boundary. Dashboard
     empties migrated to `EmptyState`. Added `prefers-reduced-motion` guard.
- Why: User wants warm/edel dark theme with real visual hierarchy; ui-ux-pro-max consulted (CSVs)
  for luxury palette + Fraunces/Manrope pairing direction.
- Anything the other agent should know / not undo:
  * All design tokens live centrally in `app/globals.css` `:root` — theme via tokens, not per-file hex.
  * `.env.local` is placeholders only on this machine, so the app can't be run/screenshotted here;
    visual verification was done via a token-accurate static preview, not the live app.
  * Phases 2–4 (collapsible task rows, view switcher, rights UI, role-model cleanup) still pending.

## 2026-07-04 - Claude (Fable) - security hardening, gameplay engine, quest lifecycle, page polish
- What changed:
  1. **NEW MIGRATION `007_security_and_gameplay.sql` — must be run in the Supabase SQL editor.**
     Locks down `award_xp`/`create_notification`/`seed_demo_workspace` (were callable by ANY
     authenticated user → unlimited self-XP). Adds a status-transition trigger (non-admins can no
     longer set APPROVED/REJECTED directly — self-approval was possible via raw update). Adds
     SECURITY DEFINER RPCs `approve_task`, `reject_task`, `reopen_task` (atomic XP math: early
     bonus now based on `completed_at` not approval time, streak bonus, overdue penalty per spec,
     row-locked against double awards, archive rows, approve/reject notifications). Adds quest
     lifecycle RPCs `accept_quest` (enforces `allow_multiple_accepts`), `submit_quest`,
     `review_quest` (pays out bonus XP — quests previously NEVER paid XP). Fixes archive RLS
     (admin inserts were silently blocked → archive was always empty). Fixes SLA cron duplicate
     notifications.
  2. `/api/invite` now requires an authenticated admin (was completely unauthenticated while
     using the service-role key) and assigns role `employee` instead of legacy `user`.
  3. TaskModal approve/reject/reopen now call the new RPCs instead of client-side XP writes.
     QuestBoard rebuilt with the full lifecycle (accept → mark done → admin review queue → XP).
  4. Drag & drop now persists card order (`position`) and keeps `assignee_ids` in sync on
     cross-column drops (order was lost on reload before). New tasks get creation-time positions.
  5. Dashboard "My tasks" + Calendar now exclude soft-deleted tasks.
  6. New `lib/gamification.ts`: Web-Audio synth sounds (approve chime, quest fanfare, level-up,
     XP coin, reject) + confetti bursts + XP toasts + level-up overlay; `LevelUpWatcher` in the
     app layout celebrates level-ups/XP gains for the assignee on next page view. Buttons got
     springy press/hover physics; XP bars shimmer; leaderboard has medals + per-member progress.
     `--purple` token fixed (was a duplicate of blue).
  7. Notifications, Archive, Private, and Login pages migrated to the page-shell/app-card design
     system (they were still on the old Syne-font prototype look).
- Why: User (Tan) explicitly asked Fable to polish/finish the app, fix real bugs, and make the
  XP system playful with animations and sounds. Full-code audit found the security holes above.
- Anything the other agent should know / not undo:
  * **Run migration 007 in Supabase before relying on approve/reject/quests in production.**
    Until it runs, TaskModal approve/reject will fail (RPCs don't exist yet) — the old
    client-side XP path was removed deliberately because it was insecure.
  * Do NOT reintroduce direct `award_xp` RPC calls or client-side `status: 'APPROVED'` updates —
    the DB now rejects them by design.
  * AGENTS.md XP table was stale (old 5-level spec); `lib/types.ts` + migration 007 implement the
    current spec (100 XP/level, Rookie→Safari Legend ranks).
  * `npm.cmd run build` passes. Local browser QA impossible: `.env.local` only has placeholder
    Supabase values (real ones are in Vercel).

## 2026-06-23 - Codex - enforce spacious task UI and visible quest actions
- What changed: Added dedicated Create Task layout classes with 12px label/control gaps, 28px
  group spacing, 48px desktop columns, 44-48px body padding, and a 24px footer. Rebuilt board
  sections as separated surfaces and task stacks as 152px-minimum cards with 14px gaps and clear
  top/title/bottom regions. Open quests now always expose the existing Accept Quest action,
  including for admins, and accepted quests show a disabled Accepted button. Strengthened the
  sidebar brand/version block and active navigation pill.
- Why: Utility-only spacing remained visually compressed in production and the quest action was
  hidden for admin users.
- Anything the other agent should know / not undo: Presentation and action exposure only. The
  existing quest acceptance insert is reused unchanged; no schema, migration, auth, RLS, XP,
  status, or notification logic changed. `npm.cmd run build` and `git diff --check` pass. Browser
  screenshot QA remains unavailable because the in-app browser cannot initialize in this sandbox.

## 2026-06-22 - Codex - finalize Finance Tool UI alignment
- What changed: Removed card-wide red warning borders from overdue/Notice SLA task cards in favor
  of compact semantic pills, and replaced the workspace menu's remaining hardcoded dark color with
  the shared Finance Tool surface token.
- Why: Complete the premium dark UI acceptance pass while keeping task warnings readable but calm.
- Anything the other agent should know / not undo: Presentation only; task, quest, auth, XP,
  notification, schema, and RLS behavior is unchanged. `npm.cmd run build` and `git diff --check`
  pass. Browser screenshot QA remained unavailable because the in-app browser could not initialize
  in the Windows sandbox.

## 2026-06-22 - Codex - improve task detail and board polish
- What changed: Rebuilt Task Detail as a `max-w-5xl` premium workspace with a dedicated title/badge
  header, designed description/checklist/files/comments cards, a 310px action rail, and structured
  assignee/creator/deadline/section/reminder rows. Polished comments and checklist presentation,
  increased board/member/task-card spacing, added persistent designed add-task rows and empty states,
  and moved the sidebar active accent fully inside its navigation pill.
- Why: Task Detail still looked like raw debug UI, while board cards, columns, empty actions, and the
  active navigation state remained visually compressed.
- Anything the other agent should know / not undo: Presentation only. Existing task status,
  approvals/rejections, XP, clarification, result, checklist, comment, drag/drop, query, and mutation
  behavior is unchanged. `npm.cmd run build` and `git diff --check` pass. Browser screenshot QA was
  unavailable because the in-app browser runtime could not initialize in the Windows sandbox.

## 2026-06-22 - Codex - redesign create-task modal layout
- What changed: Expanded Create Task to a dedicated `max-w-5xl` modal size with a compact subtitle
  header, stronger header/content/footer dividers, 40px desktop content padding, a true wide-left
  two-column grid, larger controls and textareas, 32px main-form rhythm, and a more substantial
  assignment/automation card with aligned reminder rows and a clearly grouped recurrence frequency.
- Why: The first refinement remained compressed, especially around labels, paired fields, the
  automation column, and the footer at desktop widths.
- Anything the other agent should know / not undo: Frontend presentation only. Task creation,
  Supabase writes, schema, auth, RLS, XP, reminders, and notification behavior are unchanged.
  `npm.cmd run build` and `git diff --check` pass. Browser screenshot QA was unavailable because
  the in-app browser runtime could not initialize in the Windows sandbox.

## 2026-06-22 - Codex - refine layout density and create-task modal
- What changed: Reworked the sidebar active item into an inset gold-accented pill; added a bounded
  board surface with calmer header, toolbar, column, section, and empty add-task spacing; capped the
  single-member board width; widened and restructured Create Task into a spacious two-column form
  with a dedicated assignment/automation card, aligned switches, and a separated footer. Also
  increased shared form-control, label, and helper-text spacing.
- Why: The functional UI remained compressed and table-like compared with the Safari Finance Tool,
  especially on the board and in task creation.
- Anything the other agent should know / not undo: Presentation only. No schema, migration, auth,
  RLS, task status, XP, notification, query, or mutation logic changed. `npm.cmd run build` and
  `git diff --check` pass. Browser screenshot QA was unavailable because the in-app browser runtime
  could not start in the Windows sandbox.

## 2026-06-22 - Codex - premium product pages and missing admin creation flows
- What changed: Reworked Board column sizing/empty actions, Calendar month and agenda layouts,
  Settings information architecture, Audit Log filtering/table details, and sidebar version/refresh
  and workspace-board labels. Added existing-schema template create/edit/soft-delete/use flows and
  quest create/accept flows with polished modals and cards.
- Why: Production pages remained visually dense or scaffold-like, while admins could not create
  templates or quests and the template use control was not functional.
- Anything the other agent should know / not undo: No migration, schema, auth, RLS, XP, or task
  status changes were made. Template/quest writes rely on migration 004's existing tables and
  policies. Settings intentionally describes task-level reference links because workspaces have no
  persisted default-link column. `npm.cmd run build` and `git diff --check` pass. Browser screenshot
  QA was unavailable because the in-app browser runtime could not start in the Windows sandbox.
  Not committed or pushed.

## 2026-06-21 - Codex - make workspace creation atomic and admin-only
- What changed: Added `006_secure_workspace_creation.sql` with the authenticated-admin-only
  `create_workspace_with_defaults(name)` SECURITY DEFINER function. It atomically creates the
  workspace, creator admin membership, and default Team Board. Settings now calls this RPC instead
  of issuing three client-side inserts. The migration also restricts direct workspace inserts to
  admin profiles and replaces the unrestricted workspace-members INSERT policy with an admin check.
- Why: The old workspace INSERT used `.select()` before the creator had a membership, so the new row
  could not satisfy the workspace SELECT policy used by `RETURNING`; setup was also non-atomic and
  the membership policy allowed every authenticated user to insert arbitrary memberships.
- Anything the other agent should know / not undo: Apply migration 006 manually in Supabase before
  testing production. It depends on migration 005's `is_workspace_admin` helper. Do not restore the
  three separate browser inserts or `workspace_members_insert WITH CHECK (true)`. `npm.cmd run build`
  passes. Not committed or pushed.

## 2026-06-21 — Codex — premium dashboard composition and sidebar footer polish
- What changed: Refined the dashboard header rhythm; rebuilt the no-workspace setup state as a
  structured onboarding card; increased KPI hierarchy and equal-height spacing; balanced the task
  and notification panels with stronger empty states; gave the leaderboard more breathing room; and
  simplified the sidebar identity, XP, role and logout footer into a cleaner account block.
- Why: The dashboard still felt sparse and visually fragmented compared with the Safari Finance Tool.
  This pass uses the available width more deliberately while retaining flat surfaces, restrained
  borders and the existing shared design tokens.
- Anything the other agent should know / not undo: Changes are presentation-only in
  `app/(app)/dashboard/page.tsx`, `app/globals.css`, and `components/sidebar/Sidebar.tsx`. No data
  queries, schema, migrations, auth, RLS, routing, XP, notifications or task logic changed.
  `npm.cmd run build` passes. Not committed or pushed.

## 2026-06-21 — branch cleanup — Windows and MacBook standardized on `main`
- What changed: The Windows local branch was renamed from `master` to `main`, and local `main` now
  tracks `origin/main`. Both development machines now use the same branch and upstream.
- Workflow going forward: On Windows and MacBook, use `git pull`, make changes, run
  `npm.cmd run build` on Windows, then `git add`, `git commit`, and `git push`.
- Anything the agents should know / not undo: Do not use `git push origin master:main` anymore.
  `origin/master` may still exist remotely for historical reasons, but it is obsolete and must not
  be used. No application or database files changed as part of this cleanup.

## 2026-06-20 — Codex — finish dashboard and sidebar density polish
- What changed: Strengthened shared page/card/button/nav/metric/row classes in `globals.css`; rebuilt
  the sidebar footer as a readable identity, rank/XP, role and logout block; increased workspace
  selector height; made the active nav state a calm surface with a narrow gold indicator; enlarged
  dashboard spacing and equal-height KPIs; upgraded task, notification and leaderboard cards with
  consistent headers, rows and empty states; removed technical scaffold copy from Quests/Templates.
- Why: The first flat-theme pass had the right palette but dashboard internals and the account footer
  still used cramped, ad hoc layouts that looked thinner than the Safari Finance Tool reference.
- Anything the other agent should know / not undo: The sidebar stays 256px and in normal desktop flex
  flow. Dashboard presentation now relies on shared classes (`dashboard-kpi`, `dashboard-row`,
  `card-empty`, metric classes) rather than route-specific border/padding combinations. No product,
  database, auth, RLS, XP or task logic changed. `npm.cmd run build` passes. Not pushed.

## 2026-06-20 — Codex — widen and unify premium app layout
- What changed: Widened the in-flow desktop sidebar to 256px and increased navigation/header/footer
  spacing and type sizes; added shared `page-shell`, page-header, card-header and metadata-pill design
  primitives; enlarged dashboard KPI cards and converted workspace setup into a compact horizontal
  onboarding card; moved Quests and Templates onto the same page/card/button system; removed the
  remaining board-column gradient/shadow and increased board/task-card spacing.
- Why: The UI was still cramped and Quests/Templates used route-specific scaffold styling despite
  the flat Safari Finance Tool direction. This pass establishes one calmer spacing, type, surface,
  border and button hierarchy without adding gradients or large shadows.
- Anything the other agent should know / not undo: The 256px sidebar remains a normal desktop flex
  child, so no matching main-content margin is needed. Shared page classes live in `globals.css` and
  should be reused by future top-level pages. No schema, migration, auth, RLS, XP, or other business
  logic changed. `npm.cmd run build` passes. Not pushed.

## 2026-06-20 — Claude (Windows) — extend flat design tokens to board/quests/templates (priority 4/6/7)
- What changed: `app/(app)/board/[boardId]/page.tsx` and `components/board/BoardView.tsx` — the
  board header, department-tab pills, and board toolbar previously used hardcoded
  `rgba(12,15,11,.88)`/`rgba(8,10,8,.74)` backgrounds and `rgba(216,195,106,...)` gold tints left
  over from before the Mac side's flat-design pass (that pass explicitly only touched
  dashboard+sidebar). Swapped to the same tokens (`var(--bg)`, `var(--surface)`,
  `var(--accent-dim)`, `var(--border-strong)`) so the board page matches the dashboard/sidebar.
  Also swapped the same leftover hardcoded gold rgba values in `app/(app)/quests/page.tsx`,
  `app/(app)/templates/page.tsx`, `components/board/TaskCard.tsx`, and
  `components/sidebar/WorkspaceSwitcher.tsx`'s selected-workspace chip to `var(--accent-dim)`/
  `var(--border-strong)`. Confirmed the board entry flow itself was already safe (no board →
  `notFound()`; no team members → existing empty-state card; dashboard only links to a board
  when one exists) — no logic changes needed there, just visual consistency.
- Why: User's priority 4/6/7 ask was "no raw/inconsistent colors, consistent button hierarchy,
  board entry flow doesn't break." The board/task/quest/template pages were the only surfaces
  still on the pre-flat-redesign hardcoded gold, which stood out next to the now-flat
  dashboard/sidebar.
- Anything the other agent should know / not undo: Don't reintroduce hardcoded
  `rgba(216,195,106,...)` literals anywhere — use `var(--accent-dim)` / `var(--border-strong)` /
  `var(--accent)` from `globals.css` instead, consistent with the Mac side's token system.
  `npm.cmd run build` passes. Pushed to both `master` and `main`.

**Historical branch note (superseded by the 2026-06-21 cleanup above):** this repo was previously
worked on from a Windows `master` branch and a Mac `main` branch. Both machines now use local
`main` tracking `origin/main`; do not restore the old cross-branch push workflow. On 2026-06-20 the
Windows side pushed 2 commits while the Mac side had pushed 15 commits directly to `main` in
the meantime, causing a rejected push and a manual merge (commit `f471adb`) with one real
conflict in `app/(app)/dashboard/page.tsx` (resolved in favor of the Mac side's deliberate flat
finance-tool-styled cards over a from-Windows gradient/accent-strip redesign that directly
contradicted an explicit "don't reintroduce the gradient" note further down this log).

## 2026-06-20 — Claude (Windows) — merge Mac's finance-tool styling pass, drop conflicting redesign
- What changed: Merged `origin/main` (15 commits from the Mac clone: RLS recursion fix, flat
  finance-tool design-token alignment, sidebar restructure with logout button, KPI card
  tightening) into the Windows `master` branch. One conflict in
  `app/(app)/dashboard/page.tsx` — resolved by taking the Mac side's version entirely, discarding
  the gradient/accent-strip/icon-chip KPI card redesign done earlier in this Windows session.
- Why: The Mac-side work explicitly and deliberately flattened `.app-card` (no gradient, no
  shadow) and tightened the KPI cards to match `safari-finance-tool` — done *after* my earlier
  Windows-session redesign that went the opposite direction (added a gradient top accent strip
  and colored icon chips). Newer, more deliberate, and explicitly logged as "don't undo" — so it
  wins over my own concurrent work.
- Anything the other agent should know / not undo: Don't reintroduce gradients/shadows on
  `.app-card` or accent-strip/icon-chip treatments on the dashboard KPI cards — see the entries
  below for the full rationale. `npm.cmd run build` passes on Windows after the merge. Pushed to
  both `master` and `main` (now in sync at `f471adb`). Migration `005_fix_workspace_members_recursion.sql`
  was already applied to production per the entry below — no action needed unless you're setting
  up a fresh Supabase project.

## 2026-06-20 — Claude — match design tokens 1:1 against safari-finance-tool reference
- What changed: `app/globals.css` — replaced all CSS variables (`--bg`, `--surface`, `--surface2`,
  `--surface3`, `--border`, `--border-strong`, `--text`, `--muted`, `--accent`, `--green`, `--red`,
  `--amber`, `--blue`, `--purple`) with the exact hex/rgba values used in
  `safari-finance-tool` (`~/Desktop/safari-finance-tool-reference/index.html`, a single-file
  Supabase/Vercel app with inline CSS). Added `--text-secondary`, `--accent-hover`, `--accent-dim`,
  `--green-dim`, `--red-dim`, `--amber-dim` to match. Removed the decorative radial-gradient on
  `html, body` (finance tool has a flat background outside the auth screen). `.nav-item.active` now
  uses `var(--accent-dim)` instead of a hardcoded rgba value.
  `components/sidebar/Sidebar.tsx` — sidebar width `272px` → `220px` (finance tool's fixed
  `.sidebar` width); replaced the gradient "S" logo badge with a plain two-line text block
  (brand + "Safari Studios" sub-label) inside a bottom-bordered header, matching
  `.sidebar-logo`/`.brand`/`.sub`; nav-item padding/gap now `9px`/`10px` (was `10px`/`2.5`), group
  labels now `10px`/`tracking-[0.1em]`/`var(--muted)` (was `0.18em` and a separate
  `rgba(244,240,230,.38)`), matching `.nav-section`. `app/(app)/dashboard/page.tsx` — KPI label
  tracking `0.12em` → `0.09em` (finance tool's `#page-dashboard .metric-label`); leaderboard
  "is me" row highlight now `var(--accent-dim)` instead of a hardcoded `#1c2118`.
- Why: User said the dashboard still looked unpolished and asked to copy the structure/framework
  of `safari-finance-tool.vercel.app` 1:1 where applicable — but explicitly not to populate fields
  that don't have an equivalent there. Read the finance tool's full inline `<style>` block plus its
  actual sidebar DOM to get the real values rather than guessing from screenshots.
- Anything the other agent should know / not undo: Don't reintroduce the gradient sidebar logo
  badge, the `272px` sidebar width, or the old golden-tinted `rgba(226,215,168,...)` border colors —
  the finance tool uses solid `#24302D`/`#2F3E3A` borders and a flatter, cooler-gray palette. Kept
  to-do-tool-only features (XP bar, avatar circle, WorkspaceSwitcher) since the finance tool has no
  equivalent — only their colors/spacing were aligned, not removed. Build not verified locally (no
  Node/npm on this machine, per earlier entries) — relies on Vercel's build. Pushed directly to
  `main` (commit `7e0de33`).

Entry template:
```
## YYYY-MM-DD — <agent> — <one-line summary>
- What changed:
- Why:
- Anything the other agent should know / not undo:
```

---

## 2026-06-20 — Claude — fix RLS recursion, missing profile row, private-form styling
- What changed: `supabase/migrations/005_fix_workspace_members_recursion.sql` (new) — adds
  `is_workspace_member(ws_id)` / `is_workspace_admin(ws_id)` SECURITY DEFINER functions and
  rewrites `workspace_members_select`/`workspace_members_delete` policies to use them instead of
  querying `workspace_members` from within their own USING clause. Also tightened `.app-card`
  border contrast in `app/globals.css`, simplified the dashboard header copy and KPI accent
  colors in `app/(app)/dashboard/page.tsx`, flattened the no-workspace sidebar hint in
  `WorkspaceSwitcher.tsx`, and restyled the inline add-task form in
  `app/(app)/private/PrivateTodos.tsx` to use `app-card`/`btn` classes instead of raw inline
  styles + the unstyled native date picker.
- Why: User (Tan) reported "Create Workspace" silently doing nothing. Root cause was two-fold:
  (1) `profiles` table was completely empty in production — Tan's auth.users row predates the
  `handle_new_user` trigger (migration 001), so it never got a profile row, so `role` read as
  undefined and `settings/page.tsx`'s `if (profile?.role !== 'admin') redirect('/dashboard')`
  silently bounced every click. Fixed by manually inserting Tan's profile row with role=admin
  via Supabase Table Editor (no code change for this part — future signups go through the
  trigger fine, but it defaults new users to role='user', so any future second admin still needs
  a manual role bump). (2) Once profile/role was fixed, workspace creation still failed with
  Postgres error "infinite recursion detected in policy for relation workspace_members" —
  `workspace_members_select`/`_delete` policies queried `workspace_members` inside their own
  `USING` clause. Fixed via migration 005. Styling pass continued the earlier "match
  safari-finance-tool" dashboard work, addressing concrete follow-up complaints (cards merging
  together with no visible border, marketing-y header copy, unstyled private-task form).
- Anything the other agent should know / not undo: migration 005 **must be run manually in the
  Supabase SQL editor** — it's not auto-applied by Vercel deploys. It was run against production
  already (confirmed working — workspace creation succeeds now). If you add new RLS policies on
  `workspace_members`, reuse `is_workspace_member`/`is_workspace_admin` instead of re-querying the
  table directly, or you'll reintroduce the same recursion. Don't reintroduce the `.app-card`
  gradient/shadow or the marketing-style dashboard header — both were deliberately removed.

## 2026-06-20 — Claude — align dashboard/sidebar styling with safari-finance-tool reference
- What changed: `app/globals.css` — `.app-card` is now flat (`background: var(--surface)`, no gradient,
  no box-shadow) instead of the gradient+shadow card look. `app/(app)/dashboard/page.tsx` — KPI cards
  (`Your progress` + metric cards) tightened: smaller padding, smaller number size, metric icons are
  muted-gray instead of accent-colored, removed fixed `min-h-[178px]`. `components/sidebar/Sidebar.tsx`
  — active nav item no longer has a gold gradient background + border; now a flat `var(--surface2)`
  background with a small accent dot on the right (icon/text are no longer accent-tinted when active).
- Why: User asked for the to-dos dashboard to look as clean/dense as `safari-finance-tool.vercel.app`
  (another Safari Studios internal tool, also Next.js/Supabase/Vercel, same gold-on-near-black palette).
  Visually compared the finance tool's dashboard via screenshots — its cards are flat (no gradient),
  borders are barely visible, and the active sidebar item uses a flat highlight + a small dot indicator
  instead of a glowing accent border. This pass only touched dashboard + sidebar; board/task-modal/other
  pages were not touched.
- Anything the other agent should know / not undo: Don't reintroduce the `.app-card` gradient/shadow —
  flat is intentional now, matches the finance tool. If you touch other pages that use `.app-card`,
  consider applying the same flat treatment for consistency. Pushed directly to `main` (this repo's
  local clone tracks `main` directly, no `master` branch involved here). Build not verified locally
  (no Node/npm on this machine) — relies on Vercel's build. KPI card visual changes are CSS/JSX only,
  no logic/data changes.

## 2026-06-20 — Claude — fix desktop app shell layout and consolidate empty state
- What changed: `components/sidebar/Sidebar.tsx` — sidebar `<aside>` now uses `lg:static` instead
  of staying `fixed` at desktop width, so it occupies real space in the flex layout instead of
  floating over content (still `fixed`/off-canvas drawer below `lg`). `app/(app)/layout.tsx` —
  removed the `lg:ml-[272px]` margin hack on `<main>` since it's no longer needed once the
  sidebar is in-flow. `components/sidebar/WorkspaceSwitcher.tsx` — removed the "Create
  Workspace" button from the sidebar's no-workspace state (now just calm status text) so there's
  only one CTA. `app/(app)/dashboard/page.tsx` — removed the duplicate "Set up workspace" header
  button + "Open setup" dashed-card combo; replaced with a single empty-state card ("Set up your
  workspace" / one "Create Workspace" button) when no board exists, and the header CTA now only
  renders ("Open team board") when a board does exist.
- Why: User reported (with screenshots) that the desktop sidebar/workspace panel visually
  overlapped main content, and the no-workspace state had two competing CTAs ("Set up
  workspace" + "Open setup"). Scoped to layout/empty-state only per explicit instruction — no
  product logic, no Supabase/schema/auth changes.
- Anything the other agent should know / not undo: This is a layout-architecture change, not
  just a class tweak — the sidebar is now a normal flex child at `lg`+ instead of `fixed` with a
  matching margin on `<main>`. Don't reintroduce the fixed+margin pattern; if the sidebar width
  needs to change, change it in one place (the `w-[272px]` on `<aside>`) and it'll still line up
  since `<main>` no longer hardcodes an offset. `npm.cmd run build` passes (only the pre-existing
  middleware-deprecation warning). Not pushed — only push if Tan asks explicitly.

## 2026-06-20 - Codex - polish V1 app shell, dashboard, and board UX
- What changed: Rebuilt the responsive fixed sidebar/mobile navigation, workspace selector and creation flow, dashboard KPI/task/notification/leaderboard cards, board header/department tabs/member columns, global button/card styles, and visible board/section Create Task entry points.
- Why: The deployed V1 foundation looked scaffold-like and key actions were undersized, unclear, or non-functional. This pass establishes a consistent premium dark SaaS hierarchy and explicit setup empty states.
- Anything the other agent should know / not undo: No migrations or schema changes. Workspace creation uses existing `workspaces`, `workspace_members`, and `boards` tables and creates a default Team Board. `npm.cmd run build` passes; lint still reports pre-existing `no-explicit-any` issues across older V1 files. No push or commit was performed.

## 2026-06-20 - Codex - build V1 product foundation
- What changed: Expanded Safari To-Dos from scaffold toward V1: premium dark Manrope UI, department-tab board, multi-assignee task creation, ASSIGNED -> NOTICED -> IN_EDIT -> DONE -> admin APPROVED/REJECTED flow, clarification requests, deadline labels/defaults, checklist fallback, quests/templates/audit pages, richer dashboard/leaderboard, password reset, and migration `004_v1_product_model.sql`.
- Why: User clarified the scaffold is not final and requested the real lean internal task board V1 with admin approval, deadlines, XP, quests, templates, notifications, soft delete, and audit log foundations.
- Anything the other agent should know / not undo: `npm.cmd run build` passes. Apply `supabase/migrations/004_v1_product_model.sql` after the first three migrations before relying on new V1 fields/tables. No push was performed; user explicitly said not to push automatically.

## 2026-06-19 — Claude — set up cross-agent collaboration files
- What changed: Rewrote `AGENTS.md` into a full project briefing (product model, status flow,
  XP system, file structure, division of labor). Created this `COLLAB_LOG.md` for handoffs.
- Why: User builds the main app with Codex/ChatGPT and brings Claude in for improvements
  afterward. Neither agent previously had a way to know what the other did without the user
  repeating it.
- Anything the other agent should know: No code changes yet — repo currently has scaffolded
  app/components from an earlier Claude Code session (board, calendar, archive, private,
  notifications, settings pages + matching components), but only one git commit exists
  ("Initial commit from Create Next App"), so nothing past scaffolding has been committed.
  No GitHub remote is configured yet either. Whoever sets up the remote/pushes first should
  note it here.
