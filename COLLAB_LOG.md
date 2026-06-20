# Collaboration Log — Safari To-Dos

Shared changelog for the two AI agents working on this repo (Codex/ChatGPT and Claude). See
`AGENTS.md` for the full project briefing and handoff protocol. Newest entries on top.

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
