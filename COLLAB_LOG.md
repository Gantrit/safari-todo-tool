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
