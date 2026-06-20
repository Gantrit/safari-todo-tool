# Collaboration Log — Safari To-Dos

Shared changelog for the two AI agents working on this repo (Codex/ChatGPT and Claude). See
`AGENTS.md` for the full project briefing and handoff protocol. Newest entries on top.

Entry template:
```
## YYYY-MM-DD — <agent> — <one-line summary>
- What changed:
- Why:
- Anything the other agent should know / not undo:
```

---

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
