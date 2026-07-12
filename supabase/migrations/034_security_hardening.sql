-- ============================================================
-- 034 — Security hardening (RLS review 2026-07-12)
-- ============================================================
-- Closes three holes found in the architecture/security review:
--
--   1. profiles: `profiles_update USING (auth.uid() = id)` had no WITH CHECK and
--      no column restriction, so any member could run
--      `update({ role: 'admin', xp: 99999, deactivated_at: null })` on their own
--      row straight from the client SDK — privilege escalation, XP forgery, and
--      self-reactivation past the deactivation lock. There is no protecting
--      trigger. Role/XP/deactivation are meant to flow ONLY through the
--      SECURITY DEFINER RPCs (set_member_role / set_member_deactivated /
--      admin_adjust_xp / award_xp). We freeze those columns against any direct
--      client write while leaving full_name / avatar_url editable.
--
--   2. subtasks: insert/update/delete policies were `USING (true)` — any
--      authenticated user could write/delete ANY subtask on ANY task by id
--      (IDOR), even on boards they can't see. Scope writes to task access,
--      mirroring checklist_items. SELECT stays broad (any visible task).
--
--   3. audit_logs: `audit_logs_insert WITH CHECK (true)` let a client forge
--      audit entries with someone else's actor_id. All real inserts come from
--      SECURITY DEFINER triggers (which bypass RLS), so restricting the client
--      policy to actor_id = auth.uid() breaks nothing and stops forging.
--
-- Run in the Supabase SQL editor AFTER 033_shift_report_review.sql.

BEGIN;

-- ============================================================
-- 1. Lock down profiles' security-sensitive columns
-- ============================================================
DROP POLICY IF EXISTS "profiles_update" ON profiles;
CREATE POLICY "profiles_update" ON profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION protect_profile_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Trusted server paths (the SECURITY DEFINER RPCs, and the service role) run
  -- as a database role OTHER than the PostgREST client role `authenticated`.
  -- Let those through untouched; only guard raw client-session writes.
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  -- Direct client write: role / xp / level / streak / deactivation may only
  -- change via the admin RPCs. If a client tries to change them, reject.
  IF NEW.role           IS DISTINCT FROM OLD.role
     OR NEW.xp             IS DISTINCT FROM OLD.xp
     OR NEW.level          IS DISTINCT FROM OLD.level
     OR NEW.streak_days    IS DISTINCT FROM OLD.streak_days
     OR NEW.deactivated_at IS DISTINCT FROM OLD.deactivated_at THEN
    RAISE EXCEPTION 'Protected profile columns (role, xp, level, streak_days, deactivated_at) can only be changed through admin functions';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_columns_trigger ON profiles;
CREATE TRIGGER protect_profile_columns_trigger
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION protect_profile_columns();

-- ============================================================
-- 2. Scope subtasks writes to task access (was USING (true))
-- ============================================================
DROP POLICY IF EXISTS "subtasks_insert" ON subtasks;
DROP POLICY IF EXISTS "subtasks_update" ON subtasks;
DROP POLICY IF EXISTS "subtasks_delete" ON subtasks;

CREATE POLICY "subtasks_insert" ON subtasks FOR INSERT TO authenticated
  WITH CHECK (task_id IN (
    SELECT id FROM tasks
    WHERE created_by = auth.uid()
       OR assigned_to = auth.uid()
       OR auth.uid() = ANY(assignee_ids)
       OR can_manage()
  ));
CREATE POLICY "subtasks_update" ON subtasks FOR UPDATE TO authenticated
  USING (task_id IN (
    SELECT id FROM tasks
    WHERE created_by = auth.uid()
       OR assigned_to = auth.uid()
       OR auth.uid() = ANY(assignee_ids)
       OR can_manage()
  ));
CREATE POLICY "subtasks_delete" ON subtasks FOR DELETE TO authenticated
  USING (task_id IN (
    SELECT id FROM tasks
    WHERE created_by = auth.uid()
       OR assigned_to = auth.uid()
       OR auth.uid() = ANY(assignee_ids)
       OR can_manage()
  ));

-- ============================================================
-- 3. Stop audit-log actor forging
-- ============================================================
DROP POLICY IF EXISTS "audit_logs_insert" ON audit_logs;
CREATE POLICY "audit_logs_insert" ON audit_logs FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());

COMMIT;
