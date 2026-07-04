-- 007: Security hardening + server-side XP/quest gameplay
-- Fixes:
--   * award_xp was callable by any authenticated user (unlimited self-XP)
--   * assignees could self-approve tasks (RLS allowed any status change)
--   * archive inserts by admins were silently blocked by RLS -> archive stayed empty
--   * XP awarding was client-side (race conditions, wrong early bonus, no streak, no overdue penalty)
--   * quests had no done/approve flow and never paid out bonus XP
--   * no notifications on approve/reject
--   * notice-SLA cron re-notified admins on every run
-- Run in the Supabase SQL editor after 006.

-- ============================================================
-- 1. Lock down privileged functions
-- ============================================================
REVOKE ALL ON FUNCTION award_xp(UUID, INTEGER, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION award_xp(UUID, INTEGER, TEXT, UUID) FROM authenticated;
REVOKE ALL ON FUNCTION create_notification(UUID, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION create_notification(UUID, TEXT, TEXT, UUID) FROM authenticated;
REVOKE ALL ON FUNCTION seed_demo_workspace(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION seed_demo_workspace(UUID) FROM authenticated;

-- Helper: is the current user an admin?
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin');
$$;
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;

-- ============================================================
-- 2. Enforce status transitions at the database level
--    Assignees/creators: ASSIGNED -> NOTICED -> IN_EDIT -> DONE, REJECTED -> IN_EDIT
--    Admins only: -> APPROVED / REJECTED, and reopening APPROVED tasks
-- ============================================================
CREATE OR REPLACE FUNCTION enforce_task_status_transitions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_admin BOOLEAN;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') INTO v_is_admin;

  -- Admins may perform any transition
  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  -- Private tasks (no board) are unrestricted for their owner
  IF OLD.board_id IS NULL AND OLD.created_by = auth.uid() THEN
    RETURN NEW;
  END IF;

  -- Non-admins may never set APPROVED or REJECTED
  IF NEW.status IN ('APPROVED', 'REJECTED') THEN
    RAISE EXCEPTION 'Only admins can set a task to %', NEW.status;
  END IF;

  -- Non-admins cannot move a task out of APPROVED
  IF OLD.status = 'APPROVED' THEN
    RAISE EXCEPTION 'Only admins can reopen an approved task';
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

DROP TRIGGER IF EXISTS enforce_task_status ON tasks;
CREATE TRIGGER enforce_task_status
  BEFORE UPDATE OF status ON tasks
  FOR EACH ROW EXECUTE FUNCTION enforce_task_status_transitions();

-- ============================================================
-- 3. Server-side approval with correct XP math (single source of truth)
--    XP spec: base by priority, +10 imminent, +1/day early (max +10),
--    streak +1/day (max +10), overdue penalty applied on admin review.
-- ============================================================
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
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only admins can approve tasks';
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
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only admins can reject tasks';
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
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only admins can reopen tasks';
  END IF;
  UPDATE tasks
  SET status = 'IN_EDIT', approved_at = NULL, rejected_at = NULL
  WHERE id = p_task_id;
END;
$$;
GRANT EXECUTE ON FUNCTION reopen_task(UUID) TO authenticated;

-- ============================================================
-- 4. Quest gameplay: accept (enforced), submit, review, bonus XP payout
-- ============================================================
CREATE OR REPLACE FUNCTION accept_quest(p_quest_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_quest quests%ROWTYPE;
  v_existing INTEGER;
BEGIN
  SELECT * INTO v_quest FROM quests WHERE id = p_quest_id FOR UPDATE;
  IF NOT FOUND OR v_quest.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Quest not found';
  END IF;
  IF v_quest.status NOT IN ('OPEN', 'ACCEPTED') THEN
    RAISE EXCEPTION 'Quest is no longer open';
  END IF;

  IF NOT v_quest.allow_multiple_accepts THEN
    SELECT COUNT(*) INTO v_existing FROM quest_acceptances WHERE quest_id = p_quest_id;
    IF v_existing > 0 THEN
      RAISE EXCEPTION 'This quest has already been accepted';
    END IF;
  END IF;

  INSERT INTO quest_acceptances (quest_id, user_id)
  VALUES (p_quest_id, auth.uid())
  ON CONFLICT (quest_id, user_id) DO NOTHING;

  UPDATE quests SET status = 'ACCEPTED', updated_at = NOW()
  WHERE id = p_quest_id AND status = 'OPEN' AND NOT allow_multiple_accepts;
END;
$$;
GRANT EXECUTE ON FUNCTION accept_quest(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION submit_quest(p_quest_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_title TEXT;
  v_admin UUID;
BEGIN
  UPDATE quest_acceptances
  SET status = 'DONE', submitted_at = NOW()
  WHERE quest_id = p_quest_id AND user_id = auth.uid() AND status = 'ACCEPTED';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active acceptance for this quest';
  END IF;

  SELECT title INTO v_title FROM quests WHERE id = p_quest_id;
  FOR v_admin IN SELECT id FROM profiles WHERE role = 'admin' LOOP
    INSERT INTO notifications (user_id, type, message, task_id)
    VALUES (v_admin, 'result_submitted', 'Quest submitted for review: ' || v_title, NULL);
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION submit_quest(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION review_quest(p_quest_id UUID, p_user_id UUID, p_approve BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_quest quests%ROWTYPE;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only admins can review quests';
  END IF;

  SELECT * INTO v_quest FROM quests WHERE id = p_quest_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quest not found'; END IF;

  UPDATE quest_acceptances
  SET status = CASE WHEN p_approve THEN 'APPROVED' ELSE 'REJECTED' END,
      reviewed_at = NOW()
  WHERE quest_id = p_quest_id AND user_id = p_user_id AND status = 'DONE';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No submitted acceptance found for this user';
  END IF;

  IF p_approve THEN
    PERFORM award_xp(p_user_id, v_quest.bonus_xp, 'Quest completed: ' || v_quest.title, NULL);
    INSERT INTO notifications (user_id, type, message, task_id)
    VALUES (p_user_id, 'approved', format('Quest approved: %s (+%s XP)', v_quest.title, v_quest.bonus_xp), NULL);
  ELSE
    INSERT INTO notifications (user_id, type, message, task_id)
    VALUES (p_user_id, 'rejected', 'Quest rejected: ' || v_quest.title, NULL);
  END IF;

  -- Close the quest when every acceptance has been reviewed (single-accept quests)
  IF NOT v_quest.allow_multiple_accepts THEN
    UPDATE quests SET status = CASE WHEN p_approve THEN 'APPROVED' ELSE 'REJECTED' END, updated_at = NOW()
    WHERE id = p_quest_id;
  END IF;

  INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), CASE WHEN p_approve THEN 'quest_approved' ELSE 'quest_rejected' END, 'quest', p_quest_id,
          jsonb_build_object('user_id', p_user_id, 'bonus_xp', v_quest.bonus_xp));
END;
$$;
GRANT EXECUTE ON FUNCTION review_quest(UUID, UUID, BOOLEAN) TO authenticated;

-- ============================================================
-- 5. Archive RLS: allow admins to insert archive rows for others
--    (approve_task uses SECURITY DEFINER anyway, this is defense in depth)
-- ============================================================
DROP POLICY IF EXISTS "archive_insert" ON archive;
CREATE POLICY "archive_insert" ON archive FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR is_admin());

-- ============================================================
-- 6. Fix notice-SLA duplicate notifications: only notify for NEW misses
-- ============================================================
CREATE OR REPLACE FUNCTION log_notice_sla_misses()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  inserted_count INTEGER;
BEGIN
  WITH new_misses AS (
    INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata)
    SELECT NULL, 'notice_sla_missed', 'task', t.id, jsonb_build_object('assigned_at', t.created_at)
    FROM tasks t
    WHERE t.status = 'ASSIGNED'
      AND t.noticed_at IS NULL
      AND t.deleted_at IS NULL
      AND t.created_at < NOW() - INTERVAL '12 hours'
      AND NOT EXISTS (
        SELECT 1 FROM audit_logs a
        WHERE a.action = 'notice_sla_missed' AND a.entity_type = 'task' AND a.entity_id = t.id
      )
    RETURNING entity_id
  )
  INSERT INTO notifications (user_id, type, message, task_id)
  SELECT p.id, 'notice_sla_missed', 'Notice SLA missed: ' || t.title, t.id
  FROM new_misses nm
  JOIN tasks t ON t.id = nm.entity_id
  CROSS JOIN profiles p
  WHERE p.role = 'admin';

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

-- ============================================================
-- 7. Normalize invite role drift ('user' -> 'employee' going forward is
--    handled in the API; clean up any rows created in the meantime)
-- ============================================================
UPDATE workspace_members SET role = 'employee' WHERE role = 'user';
UPDATE profiles SET role = 'employee' WHERE role = 'user';
