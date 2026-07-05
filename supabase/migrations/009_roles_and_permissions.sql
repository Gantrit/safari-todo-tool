-- 009: Role-model cleanup + Manager role + team-management permissions
-- Extends the EXISTING role model (no parallel system).
-- Stored values after this migration: admin, manager (NEW), employee (=Member), guest (=Viewer).
-- 'user' is retired (migrated to employee). Display labels live in the client (lib/types).
-- Run in the Supabase SQL editor after 008.

-- ============================================================
-- 1. Role values: retire 'user', add 'manager'
-- ============================================================
UPDATE profiles SET role = 'employee' WHERE role = 'user' OR role IS NULL;
UPDATE workspace_members SET role = 'employee' WHERE role = 'user' OR role IS NULL;

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'manager', 'employee', 'guest'));
ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'employee';

ALTER TABLE workspace_members DROP CONSTRAINT IF EXISTS workspace_members_role_check;
ALTER TABLE workspace_members ADD CONSTRAINT workspace_members_role_check CHECK (role IN ('admin', 'manager', 'employee', 'guest'));
ALTER TABLE workspace_members ALTER COLUMN role SET DEFAULT 'employee';

-- New signups default to Member instead of the retired 'user'
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'employee')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 2. Permission helpers (admin stays admin-only; can_manage = admin OR manager)
-- ============================================================
CREATE OR REPLACE FUNCTION can_manage()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'));
$$;
GRANT EXECUTE ON FUNCTION can_manage() TO authenticated;

-- ============================================================
-- 3. Fix board creation/deletion for admins (was gated on a brittle
--    member-row join; make it membership-independent via is_admin()).
-- ============================================================
DROP POLICY IF EXISTS "boards_insert" ON boards;
CREATE POLICY "boards_insert" ON boards FOR INSERT TO authenticated
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "boards_delete" ON boards;
CREATE POLICY "boards_delete" ON boards FOR DELETE TO authenticated
  USING (is_admin());

-- ============================================================
-- 4. Team management: managers get the admin-like task powers
--    (status transitions incl. approve/reject/reopen, editing any task).
-- ============================================================
DROP POLICY IF EXISTS "tasks_update" ON tasks;
CREATE POLICY "tasks_update" ON tasks FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR assigned_to = auth.uid()
    OR auth.uid() = ANY(assignee_ids)
    OR can_manage()
  );

-- Status-transition trigger: admins AND managers may perform any transition.
CREATE OR REPLACE FUNCTION enforce_task_status_transitions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_can_manage BOOLEAN;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')) INTO v_can_manage;

  -- Admins and managers may perform any transition
  IF v_can_manage THEN
    RETURN NEW;
  END IF;

  -- Private tasks (no board) are unrestricted for their owner
  IF OLD.board_id IS NULL AND OLD.created_by = auth.uid() THEN
    RETURN NEW;
  END IF;

  -- Members/viewers may never set APPROVED or REJECTED
  IF NEW.status IN ('APPROVED', 'REJECTED') THEN
    RAISE EXCEPTION 'Only admins or managers can set a task to %', NEW.status;
  END IF;

  -- Members/viewers cannot move a task out of APPROVED
  IF OLD.status = 'APPROVED' THEN
    RAISE EXCEPTION 'Only admins or managers can reopen an approved task';
  END IF;

  -- Allowed forward transitions for assignees/creators
  IF NOT (
    (OLD.status = 'ASSIGNED' AND NEW.status = 'NOTICED') OR
    (OLD.status = 'NOTICED' AND NEW.status = 'IN_EDIT') OR
    (OLD.status = 'IN_EDIT' AND NEW.status = 'DONE') OR
    (OLD.status = 'REJECTED' AND NEW.status = 'IN_EDIT') OR
    (OLD.status = 'DONE' AND NEW.status = 'IN_EDIT')
  ) THEN
    RAISE EXCEPTION 'Transition % -> % is not allowed', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$;

-- approve_task: gate on can_manage() (body unchanged from 007 otherwise)
CREATE OR REPLACE FUNCTION approve_task(p_task_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_task tasks%ROWTYPE;
  v_assignee UUID;
  v_assignees UUID[];
  v_base INTEGER;
  v_imminent INTEGER := 0;
  v_early INTEGER := 0;
  v_streak INTEGER;
  v_penalty INTEGER := 0;
  v_xp INTEGER;
  v_deadline TIMESTAMPTZ;
  v_completed TIMESTAMPTZ;
  v_was_overdue BOOLEAN := FALSE;
BEGIN
  IF NOT can_manage() THEN
    RAISE EXCEPTION 'Only admins or managers can approve tasks';
  END IF;

  -- Lock the row so concurrent approvals cannot double-award
  SELECT * INTO v_task FROM tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found';
  END IF;
  IF v_task.status = 'APPROVED' THEN
    RETURN jsonb_build_object('already_approved', true);
  END IF;
  IF v_task.status != 'DONE' THEN
    RAISE EXCEPTION 'Only tasks in DONE can be approved';
  END IF;

  v_assignees := COALESCE(NULLIF(v_task.assignee_ids, '{}'), ARRAY[v_task.assigned_to]);
  v_deadline := COALESCE(v_task.deadline_at, v_task.due_date::timestamptz + time '23:59');
  v_completed := COALESCE(v_task.completed_at, NOW());

  -- Base + imminent
  v_base := CASE v_task.priority WHEN 'LOW' THEN 5 WHEN 'MEDIUM' THEN 10 ELSE 20 END;
  IF v_task.section = 'IMMINENT' THEN v_imminent := 10; END IF;

  IF v_deadline IS NOT NULL THEN
    IF v_completed <= v_deadline THEN
      -- Early completion bonus: +1 XP per full day early, max +10
      v_early := LEAST(10, GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (v_deadline - v_completed)) / 86400))::INTEGER);
    ELSE
      -- Overdue penalty (applied on admin review, per spec)
      v_was_overdue := TRUE;
      v_penalty := CASE v_task.priority WHEN 'LOW' THEN 5 WHEN 'MEDIUM' THEN 10 ELSE 20 END
                   + CASE WHEN v_task.section = 'IMMINENT' THEN 10 ELSE 0 END;
    END IF;
  END IF;

  UPDATE tasks
  SET status = 'APPROVED',
      approved_at = NOW(),
      needs_clarification = FALSE,
      xp_awarded = TRUE
  WHERE id = p_task_id;

  FOREACH v_assignee IN ARRAY v_assignees LOOP
    CONTINUE WHEN v_assignee IS NULL;

    IF NOT v_task.xp_awarded THEN
      -- Streak: consecutive calendar days (Berlin) with an approved task, +1/day max +10
      SELECT COUNT(*)::INTEGER INTO v_streak
      FROM (
        SELECT DISTINCT (created_at AT TIME ZONE 'Europe/Berlin')::date AS day
        FROM xp_log
        WHERE user_id = v_assignee AND amount > 0
          AND created_at > NOW() - INTERVAL '11 days'
      ) days
      WHERE day >= (NOW() AT TIME ZONE 'Europe/Berlin')::date - 10;
      v_streak := LEAST(10, GREATEST(0, v_streak));

      v_xp := v_base + v_imminent + v_early + v_streak - v_penalty;

      PERFORM award_xp(
        v_assignee,
        v_xp,
        CASE WHEN v_was_overdue
          THEN format('Task approved (overdue: base %s, penalty -%s)', v_base + v_imminent, v_penalty)
          ELSE format('Task approved (+%s base, +%s early, +%s streak)', v_base + v_imminent, v_early, v_streak)
        END,
        p_task_id
      );
    END IF;

    -- Archive entry (SECURITY DEFINER bypasses the user_id = auth.uid() RLS check
    -- that silently blocked admin-side archive inserts before)
    INSERT INTO archive (task_id, user_id)
    SELECT p_task_id, v_assignee
    WHERE NOT EXISTS (SELECT 1 FROM archive WHERE task_id = p_task_id AND user_id = v_assignee);

    -- Notify the assignee
    INSERT INTO notifications (user_id, type, message, task_id)
    VALUES (v_assignee, 'approved', 'Approved: ' || v_task.title, p_task_id);
  END LOOP;

  RETURN jsonb_build_object(
    'xp_per_assignee', v_base + v_imminent + v_early - v_penalty,
    'base', v_base + v_imminent,
    'early_bonus', v_early,
    'penalty', v_penalty,
    'was_overdue', v_was_overdue
  );
END;
$$;
GRANT EXECUTE ON FUNCTION approve_task(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION reject_task(p_task_id UUID, p_quality_penalty BOOLEAN DEFAULT FALSE)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_task tasks%ROWTYPE;
  v_assignee UUID;
BEGIN
  IF NOT can_manage() THEN
    RAISE EXCEPTION 'Only admins or managers can reject tasks';
  END IF;

  SELECT * INTO v_task FROM tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Task not found'; END IF;

  UPDATE tasks
  SET status = 'REJECTED', rejected_at = NOW(), needs_clarification = FALSE
  WHERE id = p_task_id;

  FOREACH v_assignee IN ARRAY COALESCE(NULLIF(v_task.assignee_ids, '{}'), ARRAY[v_task.assigned_to]) LOOP
    CONTINUE WHEN v_assignee IS NULL;
    IF p_quality_penalty THEN
      PERFORM award_xp(v_assignee, -5, 'Quality issue on rejected task', p_task_id);
    END IF;
    INSERT INTO notifications (user_id, type, message, task_id)
    VALUES (v_assignee, 'rejected', 'Rejected: ' || v_task.title, p_task_id);
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION reject_task(UUID, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION reopen_task(p_task_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT can_manage() THEN
    RAISE EXCEPTION 'Only admins or managers can reopen tasks';
  END IF;
  UPDATE tasks
  SET status = 'IN_EDIT', approved_at = NULL, rejected_at = NULL
  WHERE id = p_task_id;
END;
$$;
GRANT EXECUTE ON FUNCTION reopen_task(UUID) TO authenticated;

-- ============================================================
-- 5. Delete rights: creator, manager (team-wide), or admin.
--    Extends 008 soft_delete_task with can_manage().
-- ============================================================
CREATE OR REPLACE FUNCTION soft_delete_task(p_task_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_task tasks%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_task FROM tasks WHERE id = p_task_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found';
  END IF;

  IF v_task.deleted_at IS NOT NULL THEN
    RETURN v_task.id;
  END IF;

  IF NOT (v_task.created_by = auth.uid() OR v_task.creator_id = auth.uid() OR can_manage()) THEN
    RAISE EXCEPTION 'You do not have permission to delete this task';
  END IF;

  UPDATE tasks
    SET deleted_at = NOW(),
        updated_at = NOW()
    WHERE id = p_task_id;

  RETURN p_task_id;
END;
$$;

REVOKE ALL ON FUNCTION soft_delete_task(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION soft_delete_task(UUID) TO authenticated;

-- ============================================================
-- 6. Admin-only member administration RPCs
--    (profiles_update RLS is self-only, so role/deactivation need SECURITY DEFINER)
-- ============================================================
CREATE OR REPLACE FUNCTION set_member_role(p_user_id UUID, p_role TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only admins can change roles';
  END IF;
  IF p_role NOT IN ('admin', 'manager', 'employee', 'guest') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END IF;
  IF p_user_id = auth.uid() AND p_role <> 'admin' THEN
    RAISE EXCEPTION 'You cannot remove your own admin role';
  END IF;

  UPDATE profiles SET role = p_role WHERE id = p_user_id;
  UPDATE workspace_members SET role = p_role WHERE user_id = p_user_id;
END;
$$;
GRANT EXECUTE ON FUNCTION set_member_role(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION set_member_deactivated(p_user_id UUID, p_deactivated BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only admins can deactivate members';
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot deactivate yourself';
  END IF;

  UPDATE profiles
    SET deactivated_at = CASE WHEN p_deactivated THEN NOW() ELSE NULL END
    WHERE id = p_user_id;
END;
$$;
GRANT EXECUTE ON FUNCTION set_member_deactivated(UUID, BOOLEAN) TO authenticated;
