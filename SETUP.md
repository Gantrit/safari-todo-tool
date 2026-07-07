# Safari To-Dos — Setup Guide

## 1. Supabase Project

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** → run all three migration files in order:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_rls_policies.sql`
   - `supabase/migrations/003_functions.sql`
3. Copy your **Project URL** and **anon key** from Project Settings → API

## 2. Environment Variables

Edit `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NEXT_PUBLIC_APP_URL=https://your-domain.vercel.app

# Email notifications (Resend) — see "Email notifications" below
RESEND_API_KEY=your_resend_key
EMAIL_WEBHOOK_SECRET=any_long_random_string
EMAIL_FROM=Safari To-Dos <notify@yourdomain.com>
```

### Email notifications (Resend)

In-app notifications always work. To also send **email**, wire up Resend once
(migration `021_email_notifications.sql` must be run first):

1. Create a [resend.com](https://resend.com) account, verify a sending domain,
   and create an API key.
2. Set the three env vars above in Vercel (and `.env.local` for local):
   - `RESEND_API_KEY` — from Resend.
   - `EMAIL_WEBHOOK_SECRET` — any long random string you pick.
   - `EMAIL_FROM` — a verified sender, e.g. `Safari To-Dos <notify@yourdomain.com>`.
     (Before your own domain is verified you can use `onboarding@resend.dev`.)
3. Tell the database where the app lives and give it the same secret — run once
   in the Supabase SQL editor with your values:
   ```sql
   UPDATE email_webhook_config
   SET app_url = 'https://safari-todo-tool.vercel.app',
       webhook_secret = '<the same value as EMAIL_WEBHOOK_SECRET>';
   ```
   Until `app_url` is set the email trigger is a harmless no-op. If `pg_net`
   isn't enabled, enable it under Dashboard → Database → Extensions → `pg_net`.

Each user can turn email off under **Account settings → Notifications**; the
send route respects that flag.

## 3. Create First Admin User

In Supabase Dashboard → Authentication → Users → Invite user (use your email).

After signing in, go to SQL Editor and run:
```sql
UPDATE profiles SET role = 'admin' WHERE email = 'your@email.com';
```

Then call the seed function to create your first workspace:
```sql
SELECT seed_demo_workspace('<your-user-id>');
```

## 4. Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## 5. Deploy to Vercel

```bash
npx vercel --prod
```

Add all env vars in Vercel project settings.

## Features

- **Board View** — matrix grid with columns per team member, 4 collapsible sections per column
- **Drag & Drop** — tasks can be dragged between sections and member columns (@dnd-kit)
- **Task Status Flow** — NOTICED → IN EDIT → DONE → APPROVED (admins only approve)
- **XP System** — XP earned on approval, deducted on missed deadlines, level badges
- **Private Space** — personal private todos, only visible to you
- **Calendar View** — monthly calendar showing all tasks with due dates
- **Notifications** — in-app alerts for assignments, reminders, approvals
- **Archive** — approved tasks automatically archived per user
- **Settings** (admin) — invite users, manage workspace, boards, Google Drive URL

## XP Values

| Priority | Earned (APPROVED) | Penalty (missed) |
|----------|-------------------|-----------------|
| LOW      | +5 XP             | -10 XP          |
| MEDIUM   | +10 XP            | -20 XP          |
| HIGH     | +20 XP            | -40 XP          |

## Level Thresholds

| Level | Title      | XP    |
|-------|------------|-------|
| 1     | Rookie     | 0     |
| 2     | Active     | 100   |
| 3     | Consistent | 250   |
| 4     | Reliable   | 500   |
| 5     | Elite      | 1000  |
