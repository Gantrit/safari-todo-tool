-- ============================================================
-- 035 — Manager approval hierarchy
-- ============================================================
-- User decision (Tan, 2026-07-13): admins can approve/reject/reopen any task,
-- including their own. Managers can only do this for tasks assigned to
-- members ('employee' role) — never for their own tasks, and never for tasks
-- assigned to another manager or an admin. Previously approve_task/reject_task/
-- reopen_task only checked can_manage() (admin OR manager) with no hierarchy
-- or self-approval check, so a manager could approve/reject/reopen their own
-- work and give themselves XP.
--
-- Run in the Supabase SQL editor AFTER 034_security_hardening.sql.

BEGIN;

-- ------------------------------------------------------------
-- approve_task (body otherwise unchanged from 020)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION approve_task(p_task_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_task tasks%ROWTYPE;
  v_cfg xp_settings%ROWTYPE;
  v_assignee UUID;
  v_assignees UUID[];
  v_is_admin BOOLEAN;
  v_base INTEGER;
  v_near INTEGER := 0;
  v_early INTEGER := 0;
  v_streak INTEGER;
  v_penalty INTEGER := 0;
  v_xp INTEGER;
  v_deadline TIMESTAMPTZ;
  v_completed TIMESTAMPTZ;
  v_was_overdue BOOLEAN := FALSE;
  v_interval INTERVAL;
  v_next_deadline TIMESTAMPTZ;
  v_new_task_id UUID;
BEGIN
  IF NOT can_manage() THEN
    RAISE EXCEPTION 'Only admins or managers can approve tasks';
  END IF;

  SELECT * INTO v_cfg FROM xp_settings WHERE id = TRUE;

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

  -- Managers may only approve tasks assigned to members — never their own,
  -- never another manager's or admin's. Admins are unrestricted.
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') INTO v_is_admin;
  IF NOT v_is_admin THEN
    IF auth.uid() = ANY(v_assignees) THEN
      RAISE EXCEPTION 'Managers cannot approve their own tasks — ask an admin';
    END IF;
    IF EXISTS (SELECT 1 FROM profiles WHERE id = ANY(v_assignees) AND role <> 'employee') THEN
      RAISE EXCEPTION 'Managers can only approve tasks assigned to members';
    END IF;
  END IF;

  v_deadline := COALESCE(v_task.deadline_at, v_task.due_date::timestamptz + time '23:59');
  v_completed := COALESCE(v_task.completed_at, NOW());

  -- Base = category value + priority surcharge (both admin-configurable).
  v_base :=
    CASE v_task.section
      WHEN 'DAILY' THEN v_cfg.section_daily
      WHEN 'WEEKLY' THEN v_cfg.section_weekly
      ELSE v_cfg.section_monthly
    END
    + CASE v_task.priority
        WHEN 'LOW' THEN v_cfg.prio_low_bonus
        WHEN 'MEDIUM' THEN v_cfg.prio_medium_bonus
        ELSE v_cfg.prio_high_bonus
      END;

  IF v_deadline IS NOT NULL THEN
    IF v_completed <= v_deadline THEN
      v_early := LEAST(
        v_cfg.early_bonus_max,
        GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (v_deadline - v_completed)) / 86400))::INTEGER * v_cfg.early_bonus_per_day
      );
      IF (v_deadline - v_completed) <= make_interval(hours => v_cfg.near_deadline_window_hours) THEN
        v_near := v_cfg.near_deadline_bonus;
      END IF;
    ELSE
      v_was_overdue := TRUE;
      v_penalty := v_base;
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
      SELECT COUNT(*)::INTEGER INTO v_streak
      FROM (
        SELECT DISTINCT (created_at AT TIME ZONE 'Europe/Berlin')::date AS day
        FROM xp_log
        WHERE user_id = v_assignee AND amount > 0
          AND created_at > NOW() - INTERVAL '11 days'
      ) days
      WHERE day >= (NOW() AT TIME ZONE 'Europe/Berlin')::date - 10;
      v_streak := LEAST(v_cfg.streak_bonus_max, GREATEST(0, v_streak * v_cfg.streak_bonus_per_day));

      v_xp := v_base + v_near + v_early + v_streak - v_penalty;

      PERFORM award_xp(
        v_assignee,
        v_xp,
        CASE WHEN v_was_overdue
          THEN format('Task approved (overdue: base %s, penalty -%s)', v_base, v_penalty)
          ELSE format('Task approved (+%s base, +%s near-deadline, +%s early, +%s streak)', v_base, v_near, v_early, v_streak)
        END,
        p_task_id
      );
    END IF;

    INSERT INTO archive (task_id, user_id)
    SELECT p_task_id, v_assignee
    WHERE NOT EXISTS (SELECT 1 FROM archive WHERE task_id = p_task_id AND user_id = v_assignee);

    INSERT INTO notifications (user_id, type, message, task_id)
    VALUES (v_assignee, 'approved', 'Approved: ' || v_task.title, p_task_id);
  END LOOP;

  -- Recurring auto-reset: spawn a fresh copy for the next period so the work keeps coming back
  -- until someone disables/deletes it. Only defined cadences recur (CUSTOM has no fixed period).
  IF v_task.recurring_enabled AND v_task.recurring_frequency IN ('DAILY', 'WEEKLY', 'MONTHLY') THEN
    v_interval := CASE v_task.recurring_frequency
      WHEN 'DAILY' THEN INTERVAL '1 day'
      WHEN 'WEEKLY' THEN INTERVAL '7 days'
      ELSE INTERVAL '1 month'
    END;
    -- Base the next deadline on the old one; if that is already in the past, base it on now().
    v_next_deadline := COALESCE(v_deadline, NOW()) + v_interval;
    IF v_next_deadline < NOW() THEN
      v_next_deadline := NOW() + v_interval;
    END IF;

    INSERT INTO tasks (board_id, assigned_to, assignee_ids, created_by, creator_id, title, description,
                       priority, status, section, due_date, deadline_at, remind_3d, remind_24h,
                       xp_awarded, position, reference_url, google_drive_url,
                       recurring_enabled, recurring_frequency, labels)
    SELECT board_id, assigned_to, assignee_ids, created_by, creator_id, title, description,
           priority, 'ASSIGNED', section, v_next_deadline::date, v_next_deadline, remind_3d, remind_24h,
           FALSE, position, reference_url, google_drive_url,
           recurring_enabled, recurring_frequency, labels
    FROM tasks WHERE id = p_task_id
    RETURNING id INTO v_new_task_id;

    INSERT INTO checklist_items (task_id, title, position, done)
    SELECT v_new_task_id, title, position, FALSE FROM checklist_items WHERE task_id = p_task_id;
  END IF;

  RETURN jsonb_build_object(
    'xp_per_assignee', v_base + v_near + v_early - v_penalty,
    'base', v_base,
    'near_deadline_bonus', v_near,
    'early_bonus', v_early,
    'penalty', v_penalty,
    'was_overdue', v_was_overdue,
    'recurred', (v_new_task_id IS NOT NULL)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION approve_task(UUID) TO authenticated;

-- ------------------------------------------------------------
-- reject_task (body otherwise unchanged from 009)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION reject_task(p_task_id UUID, p_quality_penalty BOOLEAN DEFAULT FALSE)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_task tasks%ROWTYPE;
  v_assignee UUID;
  v_assignees UUID[];
  v_is_admin BOOLEAN;
BEGIN
  IF NOT can_manage() THEN
    RAISE EXCEPTION 'Only admins or managers can reject tasks';
  END IF;

  SELECT * INTO v_task FROM tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Task not found'; END IF;

  v_assignees := COALESCE(NULLIF(v_task.assignee_ids, '{}'), ARRAY[v_task.assigned_to]);

  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') INTO v_is_admin;
  IF NOT v_is_admin THEN
    IF auth.uid() = ANY(v_assignees) THEN
      RAISE EXCEPTION 'Managers cannot reject their own tasks — ask an admin';
    END IF;
    IF EXISTS (SELECT 1 FROM profiles WHERE id = ANY(v_assignees) AND role <> 'employee') THEN
      RAISE EXCEPTION 'Managers can only reject tasks assigned to members';
    END IF;
  END IF;

  UPDATE tasks
  SET status = 'REJECTED', rejected_at = NOW(), needs_clarification = FALSE
  WHERE id = p_task_id;

  FOREACH v_assignee IN ARRAY v_assignees LOOP
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

-- ------------------------------------------------------------
-- reopen_task (body otherwise unchanged from 009 — now also locks + checks
-- the task's assignees before allowing the reopen)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION reopen_task(p_task_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_task tasks%ROWTYPE;
  v_assignees UUID[];
  v_is_admin BOOLEAN;
BEGIN
  IF NOT can_manage() THEN
    RAISE EXCEPTION 'Only admins or managers can reopen tasks';
  END IF;

  SELECT * INTO v_task FROM tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Task not found'; END IF;

  v_assignees := COALESCE(NULLIF(v_task.assignee_ids, '{}'), ARRAY[v_task.assigned_to]);

  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') INTO v_is_admin;
  IF NOT v_is_admin THEN
    IF auth.uid() = ANY(v_assignees) THEN
      RAISE EXCEPTION 'Managers cannot reopen their own tasks — ask an admin';
    END IF;
    IF EXISTS (SELECT 1 FROM profiles WHERE id = ANY(v_assignees) AND role <> 'employee') THEN
      RAISE EXCEPTION 'Managers can only reopen tasks assigned to members';
    END IF;
  END IF;

  UPDATE tasks
  SET status = 'IN_EDIT', approved_at = NULL, rejected_at = NULL
  WHERE id = p_task_id;
END;
$$;
GRANT EXECUTE ON FUNCTION reopen_task(UUID) TO authenticated;

-- ------------------------------------------------------------
-- enforce_task_status_transitions (body otherwise unchanged from 031)
-- Closes the direct-table-write bypass: without this, a manager could call
-- supabase.from('tasks').update({status:'APPROVED'}) directly instead of
-- going through approve_task/reject_task/reopen_task, skipping the hierarchy
-- check above (no XP would be granted that way, but the task would still end
-- up self-approved, which is exactly what this migration prevents).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_task_status_transitions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_can_manage BOOLEAN;
  v_is_admin BOOLEAN;
  v_assignees UUID[];
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- First move into IN_EDIT counts as "noticed" for the 12h SLA.
  IF OLD.status = 'ASSIGNED' AND NEW.status = 'IN_EDIT' AND NEW.noticed_at IS NULL THEN
    NEW.noticed_at := NOW();
  END IF;

  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')) INTO v_can_manage;

  IF v_can_manage THEN
    -- Managers (not admins) may only push a task into/out-of APPROVED or
    -- REJECTED when every assignee is a member and they are not one of the
    -- assignees themselves. Mirrors approve_task/reject_task/reopen_task.
    IF NEW.status IN ('APPROVED', 'REJECTED') OR OLD.status = 'APPROVED' THEN
      SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') INTO v_is_admin;
      IF NOT v_is_admin THEN
        v_assignees := COALESCE(NULLIF(OLD.assignee_ids, '{}'), ARRAY[OLD.assigned_to]);
        IF auth.uid() = ANY(v_assignees) THEN
          RAISE EXCEPTION 'Managers cannot approve, reject or reopen their own tasks';
        END IF;
        IF EXISTS (SELECT 1 FROM profiles WHERE id = ANY(v_assignees) AND role <> 'employee') THEN
          RAISE EXCEPTION 'Managers can only approve, reject or reopen tasks assigned to members';
        END IF;
      END IF;
    END IF;
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

  -- Allowed transitions for assignees/creators (forward + one step back)
  IF NOT (
    (OLD.status = 'ASSIGNED' AND NEW.status = 'IN_EDIT') OR
    (OLD.status = 'IN_EDIT' AND NEW.status = 'DONE') OR
    (OLD.status = 'IN_EDIT' AND NEW.status = 'ASSIGNED') OR
    (OLD.status = 'DONE' AND NEW.status = 'IN_EDIT') OR
    (OLD.status = 'REJECTED' AND NEW.status = 'IN_EDIT')
  ) THEN
    RAISE EXCEPTION 'Transition % -> % is not allowed', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
