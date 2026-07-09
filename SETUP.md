# Safari To-Dos — Setup Guide

## 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor** → run **every** migration file in `supabase/migrations/` in numeric order,
   `001_initial_schema.sql` through the highest number present (currently
   `023_shift_reports.sql`). Each file is idempotent-ish but order matters — later migrations
   redefine functions/policies from earlier ones.
3. Copy the **Project URL** and **anon key** from Project Settings → API.

Migration notes:
- `021_email_notifications.sql` needs the `pg_net` extension (Dashboard → Database →
  Extensions) and the one-time `email_webhook_config` UPDATE below.
- `023_shift_reports.sql` creates the shift-report tables **and** the private storage bucket
  `shift-report-files`, and seeds the initial model list. No manual storage setup needed.

## 2. Environment variables

`.env.local` locally / Project Settings → Environment Variables on Vercel:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key   # server-only: invites, shift reports
NEXT_PUBLIC_APP_URL=https://your-domain.vercel.app

# Email notifications (Resend) — optional, see below
RESEND_API_KEY=your_resend_key
EMAIL_WEBHOOK_SECRET=any_long_random_string
EMAIL_FROM=Safari To-Dos <notify@yourdomain.com>
```

`SUPABASE_SERVICE_ROLE_KEY` is required in production for: `/api/invite`,
`/api/shift-report/*`, the `/reports` list, and the public `/submit-report` form.
Never expose it client-side; it bypasses RLS.

## 3. Auth redirect URLs (invites / password reset)

In Supabase → **Authentication → URL Configuration**, add to the Redirect URLs allowlist:

- `https://<your-domain>/set-password`
- `https://<your-domain>/callback`

Without these, invite and reset links bounce with "link expired or invalid". The browser
client uses the **implicit** flow (session arrives in the URL hash) — do not switch it back
to PKCE; fresh browsers opening an emailed link have no code_verifier (see COLLAB_LOG
2026-07-09). Links are single-use: email security scanners can consume them before the
user clicks.

## 4. Email notifications (Resend) — optional

In-app notifications always work. To also send email (migration `021` must be run):

1. Create a [resend.com](https://resend.com) account, verify a sending domain, create an API key.
2. Set `RESEND_API_KEY`, `EMAIL_WEBHOOK_SECRET`, `EMAIL_FROM` (see above). Before your own
   domain is verified you can send from `onboarding@resend.dev`.
3. Tell the database where the app lives — run once in the SQL editor:
   ```sql
   UPDATE email_webhook_config
   SET app_url = 'https://safari-todo-tool.vercel.app',
       webhook_secret = '<the same value as EMAIL_WEBHOOK_SECRET>';
   ```
   Until `app_url` is set the email trigger is a harmless no-op.

Each user can disable email under **Account settings → Notifications**.

## 5. First admin user

1. Supabase Dashboard → Authentication → Users → Invite user (your email), or sign in once.
2. SQL editor:
   ```sql
   UPDATE profiles SET role = 'admin' WHERE email = 'your@email.com';
   ```
3. The app runs a **single consolidated workspace** (migration `014`). On a brand-new
   database create one workspace + boards via the app UI (Settings → Boards) after logging
   in as admin.

## 6. Shift Reports (public form)

- Chatters (no login) submit at `https://<your-domain>/submit-report`; the link is also
  shown with a copy button on the in-app `/reports` page (admin/manager only).
- Models shown in the form dropdown are managed in **Settings → Creators / Models**.
- Uploads land in the private `shift-report-files` bucket; the app serves them via
  short-lived signed URLs. Nothing to configure beyond migration `023` and the service
  role key.

## 7. Local development

```bash
npm install
npm run dev        # Windows: npm.cmd run dev
```

Open http://localhost:3000.

## 8. Deploy

Vercel deploys `main` automatically (or `npx vercel --prod`). Set all env vars from §2 in
Vercel. Run any new migrations in Supabase **before or with** the deploy that needs them.

## XP / levels (reference)

XP amounts are **admin-configurable** in Settings → XP Management (single-row
`xp_settings` table, migration `018`) — nothing is hardcoded. 100 XP per level.
Ranks: 1–4 Rookie · 5–9 Reliable · 10–19 Executor · 20–34 High Performer · 35–49 Elite ·
50+ Safari Legend (`lib/types.ts`).
