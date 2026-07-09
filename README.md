# Safari To-Dos

Internal gamified task & accountability tool for **Safari Studios**. Every team member has a
board column; tasks move through an approval flow (`ASSIGNED → NOTICED → IN_EDIT → DONE →
APPROVED`); approved work earns XP toward levels and ranks. Includes quests, templates,
a leaderboard, an audit log, and a public shift-report form for chatters.

**Stack:** Next.js (App Router) + TypeScript + Tailwind · Supabase (Postgres / RLS / Auth /
Storage) · Resend (optional email) · deployed on Vercel (`main` → `safari-todo-tool.vercel.app`).

## Local development

```bash
npm install
npm run dev        # Windows: npm.cmd run dev
```

Requires `.env.local` with the Supabase project values — see [SETUP.md](SETUP.md).
Note: routes that use the service role (`/reports`, `/api/shift-report/*`, `/api/invite`)
only work fully where `SUPABASE_SERVICE_ROLE_KEY` is set (Vercel has it; local usually not).

## Build

```bash
npm run build      # Windows: npm.cmd run build
npm run lint
```

## Deployment

Push to `main` → Vercel deploys automatically. New SQL migrations in
[`supabase/migrations/`](supabase/migrations/) must be run manually in the Supabase SQL editor
(in numeric order) — see [SETUP.md](SETUP.md).

## Docs

- [AGENTS.md](AGENTS.md) — operating brief for AI agents (read first)
- [SETUP.md](SETUP.md) — environment, migrations, email & auth configuration
- [COLLAB_LOG.md](COLLAB_LOG.md) — running changelog (newest first)
- [docs/current_status.md](docs/current_status.md) — compact live-status summary
