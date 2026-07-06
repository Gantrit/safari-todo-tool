-- 013: Fix "Database error saving new user" on invite
-- Root cause: handle_new_user() (SECURITY DEFINER, fires on auth.users insert)
-- referenced "profiles" unqualified with no SET search_path. Triggers on the
-- auth schema don't inherit a search_path that includes public, so Postgres
-- couldn't resolve the table (42P01: relation "profiles" does not exist),
-- which aborted the auth.users insert and surfaced as the generic Supabase
-- Auth error. Fix: qualify the table name and pin search_path, matching the
-- pattern already used by can_manage()/is_admin() etc.
-- Run in the Supabase SQL editor after 012.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'employee')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
