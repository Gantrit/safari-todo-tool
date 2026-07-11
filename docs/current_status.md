# Safari To-Dos — Current Status

_Last updated: 2026-07-09 (security/QA/polish pass). Trust COLLAB_LOG.md + code over this file
if they disagree._

## Live status

- Deployed on Vercel from `main` → `safari-todo-tool.vercel.app`. Supabase project "Safari ToDo Tool".
- **All migrations 001–023 are applied in production.** Next free migration number: **024**.
- Real users: Tan (admin), Marian (manager), adab.buffy (member). Two boards: Managers, Chatting.
- Shift Reports v1 is live: public form `/submit-report`, admin/manager list `/reports`,
  model management in Settings → Creators / Models (7 models seeded).

## Riskiest modules (check these first when touching security)

1. `app/api/shift-report/submit` — PUBLIC endpoint on the service role. Strict server-side
   validation (field length caps, number clamps, date format, MIME allowlist, ≤6 files ≤8 MB,
   content-length gate). No rate limiting (accepted risk for v1 — obscure URL, small team).
2. `app/api/shift-report/creators` + `/api/invite` — service role behind an admin gate.
3. `app/api/email/notify` — gated by `x-webhook-secret` (env `EMAIL_WEBHOOK_SECRET`).
4. Middleware public routes: `/login`, `/set-password`, `/callback`, `/submit-report`.
   API routes enforce their own auth — the middleware skips `/api/*`.
5. Auth uses the **implicit** flow — do not switch to PKCE (breaks emailed links).

## Known open items / manual steps for Tan

- **Custom SMTP enabled in Supabase Auth** (2026-07-11) via Resend (`smtp.resend.com:587`,
  user `resend`, password = Resend API key) so invite / password-reset emails actually send.
  Sender is `onboarding@resend.dev` for now.
- **Resend email domain** (`safarixstudios.com`): still **Not Started** in Resend — needs GoDaddy
  DNS access (SPF/DKIM records) which is currently unavailable. Until verified, both the Supabase
  Auth sender AND `EMAIL_FROM` must stay `onboarding@resend.dev`. Once verified, switch both to
  `info@safarixstudios.com` (or `notify@…`). Does NOT block anything else.
- **Members now auto-enroll** (migration 028): new accounts get a `workspace_members` row via the
  `handle_new_user` trigger, so they appear in Settings even if the invite email fails. Run 028 to
  backfill accounts invited before this fix.
- Supabase → Auth → URL Configuration: confirm `…/set-password` and `…/callback` are in the
  Redirect URLs allowlist (part of the 2026-07-09 invite fix).
- Old test data still in prod: approved task "XP-Flow-Test (Claude, wird gelöscht)" (archive)
  and quest/category "test". Delete in-app whenever convenient.
- Local dev has NO `SUPABASE_SERVICE_ROLE_KEY` (by design) — `/reports` shows an empty list
  and `/submit-report` shows "No models" locally; both work in production.

## Deferred by decision (do not build unprompted)

- **Shift-report screenshot auto-verification (v2)** — needs an Anthropic API key as a
  Supabase/Vercel secret + a migration adding `verification_*` columns. Tan wants to judge
  real screenshot quality first.
- Permission matrix — permissions stay role-based (admin/manager/member/viewer).

## Testing checklist (quick smoke after changes)

1. `npm.cmd run lint` && `npm.cmd run build` green.
2. Login → Dashboard KPIs → open a board → all four views (Member rows / Table / Selection /
   Columns) render; task modal opens; create/edit task works.
3. `/submit-report` renders logged-out; submit round-trip (prod only).
4. `/reports` (admin) lists reports with screenshot previews (prod only).
5. Settings: roles, board access, XP management, quest categories, Creators / Models.
6. Non-admin cannot reach `/settings`, `/guild`, `/audit`, `/reports` (member role).
