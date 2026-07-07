# Safari To-Dos — Agent Briefing

Read this file and the last 2–3 entries of `COLLAB_LOG.md` at the start of every session, and
append a `COLLAB_LOG.md` entry at the end of any session where you changed something. Do it
automatically — the user shouldn't have to ask.

Two AI agents work on this repo at different times: **Claude Code** (reads `CLAUDE.md` →
`@AGENTS.md`) and **Codex/ChatGPT** (reads `AGENTS.md`). Same repo, same `main` branch. Either
agent may build features, fix bugs, or refactor — always check `git log` and the file tree first
so you don't re-scaffold or silently revert the other's work.

## What this is

Internal gamified task tool for **Safari Studios** (small team). Every member has a board column;
tasks move through an approval flow; completing work on time earns XP toward a level/rank. Must
stay lean — not a heavy PM/KPI tool.

**Stack:** Next.js (App Router) + TypeScript + Tailwind · Supabase (Postgres/RLS/Auth/Realtime) ·
@dnd-kit for drag-and-drop · Resend for optional email · deployed on **Vercel** (`main` branch,
`safari-todo-tool.vercel.app`), source on GitHub.

## Core model

**Board** = matrix grid, one column per member, each column split into sections `DAILY`,
`WEEKLY`, `MONTHLY` (IMMINENT was removed in migration 017). Board offers several views
(member rows, table, selection, columns — the Focus view was removed 2026-07-07). Plus
Calendar, Archive, per-user Private todos.

**Status flow** (enforced by RLS trigger, migration 007):
`ASSIGNED → NOTICED → IN_EDIT → DONE → APPROVED`, plus `REJECTED` and a `NEED_CLARIFICATION`
flag. Assignee drives up to `DONE`; only admin/manager can `APPROVE`/`REJECT`/reopen. On approval
the task is archived and XP awarded.

**Roles:** `admin` (full control), `manager` (task approval + most admin task rights), `employee`
(= "Member", normal user), `guest` (= "Viewer", read-only). Legacy `user` maps to `employee`.
Per-board visibility via `board_access`. Deactivated users keep data but lose access.

**XP / levels** — cumulative, never resets. **Only ever written server-side** via RPCs, never
from the client. All XP amounts are **admin-configurable** in the single-row `xp_settings`
table (migration 018, edited via Settings → XP Management) — never hardcode XP values:
- `approve_task` (018, redefined in 020 to also regenerate recurring tasks): base = category
  value (Daily/Weekly/Monthly) + priority surcharge (Low/Medium/High), plus a near-deadline bonus
  (completed within a configurable window before the deadline), an early-completion bonus (per full
  day, capped) and a streak bonus (per day, capped). Overdue penalty mirrors the full base and is
  applied on admin review.
- `review_quest` (007): pays a quest's fixed bonus XP on approval.
- `admin_adjust_xp` (012): admin-only manual correction with mandatory reason.

100 XP/level. Ranks: 1–4 Rookie, 5–9 Reliable, 10–19 Executor, 20–34 High Performer, 35–49 Elite,
50+ Safari Legend. Level/rank math: `getLevelInfo`/`getRankForLevel` in [`lib/types.ts`](lib/types.ts).

**Other features:** comments, subtasks/checklists (tickable in the expanded board card and the
task modal), in-app task editing (admin/manager/creator, via TaskForm's edit mode), per-task
reference links, in-app + email notifications, quests, admin audit log with filters, soft delete
(`deleted_at`, admin-recoverable).

**Templates (migration 019):** a template is a NAMED BUNDLE of tasks grouped by Daily/Weekly/
Monthly (`task_templates` = bundle, `template_items` = its tasks). `assign_template()` RPC
instantiates every item as a real recurring task for one member. Editing a template is NOT
retro-applied to already-assigned tasks.

**Recurring tasks (migration 020):** `recurring_enabled` tasks auto-reset — on approval,
`approve_task` spawns a fresh copy for the next period (DAILY +1d / WEEKLY +7d / MONTHLY +1mo)
with an unchecked checklist copy. CUSTOM frequency does not recur.

## Structure

```
app/(auth)/login
app/(app)/dashboard          landing after login
app/(app)/board/[boardId]    main board (view switcher, quick-add, drag-and-drop)
app/(app)/calendar           deadline calendar
app/(app)/character          personal progress: level/rank/quest log/XP history (all users)
app/(app)/leaderboard        all-time / weekly / monthly standings (all users)
app/(app)/quests             bonus challenges
app/(app)/templates          reusable task templates
app/(app)/private            personal private todos
app/(app)/archive            approved tasks
app/(app)/notifications
app/(app)/guild              admin: XP management / roster (Guild Hall)
app/(app)/audit              admin: audit log
app/(app)/settings           admin: invites, members/roles, boards & access, XP management
app/api/invite               invite endpoint (uses Supabase service-role key)

components/board/   BoardView + view variants, MemberColumn, TaskSection, task rows
components/task/    TaskModal, TaskForm, SubtaskList, CommentSection
components/sidebar/ Sidebar (the ORGANIZATION block / WorkspaceSwitcher was removed 2026-07-07)
components/ui/      Modal, badges, XPBar, EmptyState, ErrorState, LevelUpWatcher, etc.
lib/                types.ts, gamification.ts (sounds/confetti), boardViews.ts, supabase/, utils.ts
```

Full DB schema: [`supabase/migrations/`](supabase/migrations/) — numbered `001`…`020`, run in
order in the Supabase SQL editor. Env vars / deploy steps: [`SETUP.md`](SETUP.md).

## Working rules

- Keep Next.js (never revert to Vite). Use the `NEXT_PUBLIC_*` env var names. Never hardcode
  secrets; never write XP from the client.
- Any schema change = a new numbered migration file; tell the user where/when to run it in
  Supabase. Empty states must not crash. Run `npm run build` (Windows: `npm.cmd run build`) and
  fix errors before reporting done.
- **Do not push automatically unless the user explicitly asks.**

## Handoff protocol

1. Start: read the most recent `COLLAB_LOG.md` entries.
2. End (if you changed something non-trivial): append a short entry — what changed, why, and
   anything the other agent must not undo. New migrations must be called out explicitly.
