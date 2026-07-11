-- 028: Auto-enroll every account into the single workspace + backfill orphans
-- Root cause of "invited members never appear in Settings": workspace_members
-- rows were only ever written by /api/invite AFTER a successful invite email.
-- When the mailer failed (no custom SMTP configured), inviteUserByEmail errored
-- and the route returned before the workspace_members insert — so the auth user
-- and its profile existed, but there was no workspace_members row. Settings lists
-- workspace_members (not profiles), so those accounts stayed invisible even
-- though they could log in.
--
-- The app is a single consolidated org (migration 014): every account belongs to
-- the one workspace. So make handle_new_user() enroll new signups automatically,
-- and backfill everyone currently missing. This removes the whole class of bug —
-- members show up regardless of whether the invite email went out.
--
-- Idempotent. Run in the Supabase SQL editor after 027.

-- ============================================================
-- 1. Backfill: add any profile that isn't yet a member of the
--    canonical (oldest) workspace.
-- ============================================================
INSERT INTO workspace_members (workspace_id, user_id, role)
SELECT w.id, p.id, p.role
FROM profiles p
CROSS JOIN (SELECT id FROM workspaces ORDER BY created_at, id LIMIT 1) w
WHERE NOT EXISTS (
  SELECT 1 FROM workspace_members m
  WHERE m.workspace_id = w.id AND m.user_id = p.id
)
ON CONFLICT (workspace_id, user_id) DO NOTHING;

-- ============================================================
-- 2. Future signups: enroll into the canonical workspace as part
--    of the same trigger that creates the profile.
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ws   UUID;
  v_role TEXT;
BEGIN
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'employee');

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    v_role
  )
  ON CONFLICT (id) DO NOTHING;

  -- Single consolidated org: attach the new account to the oldest workspace.
  -- Skipped harmlessly on a brand-new project before any workspace exists.
  SELECT id INTO v_ws FROM public.workspaces ORDER BY created_at, id LIMIT 1;
  IF v_ws IS NOT NULL THEN
    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    VALUES (v_ws, NEW.id, v_role)
    ON CONFLICT (workspace_id, user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
