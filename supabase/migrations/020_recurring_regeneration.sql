-- 020_recurring_regeneration.sql
--
-- Recurring tasks now actually recur. Until now `recurring_enabled`/`recurring_frequency` were
-- stored and shown as a badge but nothing acted on them. This redefines approve_task() (built on
-- 018) so that when a recurring task is APPROVED, a fresh copy is spawned for the next period
-- (DAILY +1d / WEEKLY +7d / MONTHLY +1 month) with status ASSIGNED and an unchecked copy of the
-- checklist. That is the "auto-reset after approval" model (user decision 2026-07-07) and is what
-- makes template-assigned tasks (migration 019) persist as ongoing recurring work.
--
-- Everything else in approve_task is identical to 018.
--
-- Run in the Supabase SQL editor AFTER 019_template_bundles.sql.

BEGIN;

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

COMMIT;
