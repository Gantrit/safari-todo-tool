-- 017_remove_imminent_section.sql
--
-- Removes IMMINENT as a board section (DAILY/WEEKLY/MONTHLY only going forward).
-- The +10 XP bonus that used to be tied to `section = 'IMMINENT'` is replaced with a
-- deadline-proximity bonus: completing a task within the final 24h before its deadline
-- (but not overdue) now earns the same +10, regardless of which section it lived in.
--
-- Run this in the Supabase SQL editor AFTER 016_board_access_opt_in.sql.
-- Corresponds to PLAN_clickup_style_board.md — coordinate with the client-side
-- lib/types.ts change (TaskSection union, calculateApprovalXp) before/alongside deploy,
-- since the client's optimistic XP preview and this RPC must agree.

BEGIN;

-- 1. Backfill existing IMMINENT tasks/templates to DAILY before the constraint tightens.
UPDATE tasks SET section = 'DAILY' WHERE section = 'IMMINENT';
UPDATE task_templates SET section = 'DAILY' WHERE section = 'IMMINENT';

-- 2. Tighten the CHECK constraints to drop IMMINENT as a valid value.
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_section_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_section_check CHECK (section IN ('DAILY', 'WEEKLY', 'MONTHLY'));

ALTER TABLE task_templates DROP CONSTRAINT IF EXISTS task_templates_section_check;
ALTER TABLE task_templates ADD CONSTRAINT task_templates_section_check CHECK (section IN ('DAILY', 'WEEKLY', 'MONTHLY'));

-- 3. Redefine approve_task(): same as 009_roles_and_permissions.sql, except the +10
--    "imminent" bonus (v_imminent) is now earned by completing within 24h of the
--    deadline instead of by section membership. Overdue tasks still take the penalty
--    path unchanged (no near-deadline bonus applies there).
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

  v_base := CASE v_task.priority WHEN 'LOW' THEN 5 WHEN 'MEDIUM' THEN 10 ELSE 20 END;

  IF v_deadline IS NOT NULL THEN
    IF v_completed <= v_deadline THEN
      -- Early completion bonus: +1 XP per full day early, max +10
      v_early := LEAST(10, GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (v_deadline - v_completed)) / 86400))::INTEGER);
      -- Near-deadline bonus: completed within the last 24h before the deadline (replaces
      -- the old IMMINENT-section bonus; same +10 value, now earned by cutting it close
      -- instead of by which column the task lived in).
      IF (v_deadline - v_completed) <= INTERVAL '24 hours' THEN
        v_imminent := 10;
      END IF;
    ELSE
      -- Overdue penalty (applied on admin review, per spec) — no near-deadline bonus.
      v_was_overdue := TRUE;
      v_penalty := CASE v_task.priority WHEN 'LOW' THEN 5 WHEN 'MEDIUM' THEN 10 ELSE 20 END;
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
          THEN format('Task approved (overdue: base %s, penalty -%s)', v_base, v_penalty)
          ELSE format('Task approved (+%s base, +%s near-deadline, +%s early, +%s streak)', v_base, v_imminent, v_early, v_streak)
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
    'base', v_base,
    'near_deadline_bonus', v_imminent,
    'early_bonus', v_early,
    'penalty', v_penalty,
    'was_overdue', v_was_overdue
  );
END;
$$;
GRANT EXECUTE ON FUNCTION approve_task(UUID) TO authenticated;

COMMIT;
