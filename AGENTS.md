# Safari To-Dos — Agent Briefing

This file is read automatically by both AI coding agents working on this repo:
- **Codex / ChatGPT** — reads `AGENTS.md` directly.
- **Claude Code** — reads `CLAUDE.md`, which imports this file via `@AGENTS.md`.

Both agents work on the **same repo, same branch**, at different times, without the human
repeating context. **Read this file and `COLLAB_LOG.md` at the start of every session, and
append to `COLLAB_LOG.md` at the end of any session where you changed something** — see
"Cross-agent handoff protocol" below. Do this automatically, the user should never have to ask.

## What this project is

**Safari To-Dos** is an internal project-management / task tool for "Safari Studios" — a small
team (e.g. Tan, Furkan, Hares). It replaces ad-hoc task tracking with a gamified board: every
team member has a column, tasks move through an approval workflow, and completing work on time
earns XP toward a level rank.

Stack:
- **Next.js 14 (App Router)** + TypeScript + Tailwind CSS
- **Supabase**: Postgres (schema + RLS), Auth, Realtime, Storage
- **@dnd-kit** for drag-and-drop
- **Resend** for transactional email (optional, via Supabase Edge Functions)
- Deployed via **Vercel**, source on **GitHub**

Repo root (this folder) = the whole app, bootstrapped with `create-next-app`.

## Core product model

**Board** = matrix grid. One column per team member. Each column is split into 4 collapsible
sections: `DAILY`, `IMMINENT`, `WEEKLY`, `MONTHLY`. There's also a Calendar board view, an
Archive, a private per-user todo space, and admin Settings (invite users, manage workspace/boards,
Google Drive link).

**Task status flow** (one-directional, enforced by role):
```
NOTICED → IN_EDIT → DONE → APPROVED
```
- `NOTICED → IN_EDIT → DONE` is set by the assignee.
- `DONE → APPROVED` can only be set by an **admin**. On approval the task is struck through and
  moved to that user's Archive, and XP is awarded.

**XP / level system** — cumulative, never resets. Awarded ONLY server-side via the
`approve_task` / `review_quest` RPCs (migration 007); never write XP from the client.
| Priority | XP on APPROVED | Overdue penalty (applied on admin review) |
|---|---|---|
| LOW | +5 | -5 |
| MEDIUM | +10 | -10 |
| HIGH | +20 | -20 |

Bonuses: +10 if section is IMMINENT (penalty likewise -10 extra when overdue), +1 XP per full
day early (max +10, measured against `completed_at`), streak +1 XP/day (max +10). Rejected with
quality flag: -5 XP. Levels: 100 XP per level. Ranks: 1-4 Rookie, 5-9 Reliable, 10-19 Executor,
20-34 High Performer, 35-49 Elite, 50+ Safari Legend. Logic lives in
[`lib/types.ts`](lib/types.ts) (`getLevelInfo`, `getRankForLevel`) and
`supabase/migrations/007_security_and_gameplay.sql` (`approve_task`).

**Other features**: comments + emoji reactions on tasks, subtasks, attachments (incl. Google
Drive URL per task), in-app notifications + browser notifications + email (assignment, result
submitted, 24h NOTICED reminder, 3-day/24h deadline reminders), per-user private todos only
visible to that user, role-based RLS (`admin` vs `user`).

Full type definitions: [`lib/types.ts`](lib/types.ts).
Full DB schema: [`supabase/migrations/`](supabase/migrations/) — run in order:
`001_initial_schema.sql` → `002_rls_policies.sql` → `003_functions.sql`.
Setup / env vars / deploy steps: [`SETUP.md`](SETUP.md).

## Current app structure (as of last update — check git log for freshness)

```
app/(auth)/login                     — login page
app/(app)/dashboard                  — landing after login
app/(app)/board/[boardId]            — main kanban board
app/(app)/calendar                   — calendar board view
app/(app)/archive                    — approved/archived tasks
app/(app)/private                    — personal private todos
app/(app)/notifications              — notification feed
app/(app)/settings                   — admin: invite users, manage workspace
app/api/invite                       — invite endpoint

components/board/   — BoardView, MemberColumn, TaskSection, TaskCard
components/task/    — TaskModal, TaskForm, SubtaskList, CommentSection
components/calendar/ CalendarView
components/sidebar/  Sidebar, WorkspaceSwitcher
components/ui/       Modal, PriorityBadge, StatusBadge, XPBar
```

## Division of labor (current arrangement, set by the human)

- **Codex / ChatGPT** builds the bulk of the feature work — new pages, components, Supabase
  queries, migrations.
- **Claude** comes in afterward for improvements: refactors, bug fixes, polish, reviewing
  Codex's changes, filling gaps.

This means: don't assume you're starting from a clean slate. Always check `git log` and the
actual file tree before proposing changes — the other agent may have built or changed things
since your last session. Don't re-scaffold something that already exists.

## Cross-agent handoff protocol

1. **At the start of a session**, read `COLLAB_LOG.md` (most recent entries first) to see what
   the other agent did last, what's in progress, and any known issues or decisions.
2. **Before ending a session** where you made non-trivial changes (new feature, schema change,
   significant refactor, decision the other agent should know about), append a new entry to
   `COLLAB_LOG.md` using the template at the top of that file. Keep entries short — a future
   agent should be able to read just the last 2-3 entries and know what changed and why.
3. If you made a decision that overrides or changes something the *other* agent set up
   (renamed a table, changed an API shape, swapped a library), say so explicitly in the log
   entry so they don't silently revert it.
4. Don't wait for the human to ask you to do this — it's expected every session.
