-- 046_recurring_single_source.sql
--
-- Fix the recurring mess from 044 (Tan, 2026-07-22): duplicate LOGINs, logins
-- dated "tomorrow" showing up today, struck-through approved ones piling up.
--
-- Root causes in 044:
--   1. THREE things spawned the next occurrence — approve_task, reject_task AND
--      the catch-up — so they raced and doubled up.
--   2. The slot key COALESCE(template_item_id, title) fractured a series whenever
--      some occurrences had a template_item_id and others didn't: the guard then
--      didn't recognize the sibling and spawned again.
--   3. approve_task spawned the NEXT period immediately on approval, so approving
--      today's login instantly put tomorrow's login on today's board.
--
-- New model — ONE source of truth:
--   * The SCHEDULE creates occurrences, nothing else. approve_task / reject_task
--     no longer spawn anything; they just settle the task.
--   * ensure_recurring_occurrences() (run on board/dashboard load) guarantees each
--     recurring slot has exactly one occurrence for the CURRENT period (today for
--     DAILY, this week for WEEKLY, this month for MONTHLY) — never a future one.
--     So today's login appears on its own day regardless of whether yesterday's
--     was approved, and nothing is ever pre-dated to tomorrow.
--   * Slot identity is (lower(trim(title)) + assigned_to) — stable, human-meaning
--     ("Aj's LOGIN"), and immune to template_item_id being set on some rows only.
--
-- Timezone for period boundaries is Europe/Berlin (same as the XP/streak math).
--
-- Run in the Supabase SQL editor AFTER 045_drop_in_edit_status.sql.

BEGIN;

-- ============================================================
-- 1. Clean up the existing mess (soft-delete only, fully reversible, and only
--    touches ASSIGNED recurring rows — never DONE/APPROVED/REJECTED, so no member
--    work or admin decision is lost).
-- ============================================================

-- (a) Future-dated DAILY occurrences are pre-spawn clutter — a daily task should
--     never sit on the board dated later than today. The schedule will recreate
--     it on its day. (WEEKLY/MONTHLY are legitimately future-dated, so untouched.)
UPDATE tasks t
SET deleted_at = NOW()
WHERE t.deleted_at IS NULL
  AND t.recurring_enabled
  AND t.recurring_frequency = 'DAILY'
  AND t.status = 'ASSIGNED'
  AND (t.deadline_at AT TIME ZONE 'Europe/Berlin')::date
      > (NOW() AT TIME ZONE 'Europe/Berlin')::date;

-- (b) Collapse duplicate open occurrences of the same slot to a single one: if an
--     ASSIGNED task has another open sibling (same title+assignee) that is a better
--     keeper (earlier deadline, or already submitted/DONE, or equal-deadline lower
--     id), drop the ASSIGNED duplicate.
UPDATE tasks t
SET deleted_at = NOW()
WHERE t.deleted_at IS NULL
  AND t.recurring_enabled
  AND t.status = 'ASSIGNED'
  AND EXISTS (
    SELECT 1 FROM tasks o
    WHERE o.deleted_at IS NULL
      AND o.id <> t.id
      AND o.assigned_to = t.assigned_to
      AND lower(trim(o.title)) = lower(trim(t.title))
      AND o.status IN ('ASSIGNED', 'DONE')
      AND (
        o.status = 'DONE'
        OR COALESCE(o.deadline_at, o.due_date::timestamptz) < COALESCE(t.deadline_at, t.due_date::timestamptz)
        OR (COALESCE(o.deadline_at, o.due_date::timestamptz) = COALESCE(t.deadline_at, t.due_date::timestamptz) AND o.id < t.id)
      )
  );

-- ============================================================
-- 2. ensure_recurring_occurrences — the ONLY spawner. Period-based, title-keyed.
-- ============================================================
CREATE OR REPLACE FUNCTION ensure_recurring_occurrences()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tz CONSTANT TEXT := 'Europe/Berlin';
  v_task tasks%ROWTYPE;
  v_interval INTERVAL;
  v_unit TEXT;
  v_period_start TIMESTAMPTZ;
  v_anchor TIMESTAMPTZ;
  v_next TIMESTAMPTZ;
  v_guard INTEGER;
  v_new_task_id UUID;
  v_count INTEGER := 0;
BEGIN
  -- Serialize so two concurrent loads can't both spawn the same slot.
  PERFORM pg_advisory_xact_lock(hashtext('ensure_recurring_occurrences'));

  -- Latest occurrence per slot (title + assignee).
  FOR v_task IN
    SELECT DISTINCT ON (lower(trim(title)), assigned_to) t.*
    FROM tasks t
    WHERE t.recurring_enabled
      AND t.recurring_frequency IN ('DAILY', 'WEEKLY', 'MONTHLY')
      AND t.deleted_at IS NULL
      AND t.board_id IS NOT NULL
      AND t.assigned_to IS NOT NULL
    ORDER BY lower(trim(title)), assigned_to, t.deadline_at DESC NULLS LAST, t.created_at DESC
  LOOP
    v_interval := CASE v_task.recurring_frequency
      WHEN 'DAILY' THEN INTERVAL '1 day'
      WHEN 'WEEKLY' THEN INTERVAL '7 days'
      ELSE INTERVAL '1 month'
    END;
    v_unit := CASE v_task.recurring_frequency
      WHEN 'DAILY' THEN 'day'
      WHEN 'WEEKLY' THEN 'week'
      ELSE 'month'
    END;
    -- Start of the current period, in Berlin wall-time, back as a timestamptz.
    v_period_start := (date_trunc(v_unit, NOW() AT TIME ZONE v_tz)) AT TIME ZONE v_tz;

    -- Already covered? Any non-deleted occurrence of this slot whose deadline is
    -- in the current period or later means we're done — skip.
    IF EXISTS (
      SELECT 1 FROM tasks o
      WHERE o.deleted_at IS NULL
        AND o.assigned_to = v_task.assigned_to
        AND lower(trim(o.title)) = lower(trim(v_task.title))
        AND COALESCE(o.deadline_at, o.due_date::timestamptz + time '23:59') >= v_period_start
    ) THEN
      CONTINUE;
    END IF;

    -- Roll the series anchor forward on its own cadence into the current period.
    v_anchor := COALESCE(v_task.deadline_at, v_task.due_date::timestamptz + time '23:59', v_period_start);
    v_next := v_anchor;
    v_guard := 0;
    WHILE v_next < v_period_start AND v_guard < 500 LOOP
      v_next := v_next + v_interval;
      v_guard := v_guard + 1;
    END LOOP;

    INSERT INTO tasks (board_id, assigned_to, assignee_ids, created_by, creator_id, title, description,
                       priority, status, section, due_date, deadline_at, remind_3d, remind_24h,
                       xp_awarded, position, reference_url, google_drive_url,
                       recurring_enabled, recurring_frequency, labels,
                       template_id, template_item_id)
    SELECT board_id, assigned_to, assignee_ids, created_by, creator_id, title, description,
           priority, 'ASSIGNED', section, v_next::date, v_next, remind_3d, remind_24h,
           FALSE, position, reference_url, google_drive_url,
           recurring_enabled, recurring_frequency, labels,
           template_id, template_item_id
    FROM tasks WHERE id = v_task.id
    RETURNING id INTO v_new_task_id;

    INSERT INTO checklist_items (task_id, title, position, done)
    SELECT v_new_task_id, title, position, FALSE FROM checklist_items WHERE task_id = v_task.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION ensure_recurring_occurrences() TO authenticated;

-- ============================================================
-- 3. approve_task — 044 body WITHOUT the recurring respawn. The schedule owns
--    the next occurrence now, so approval just settles + awards XP.
-- ============================================================
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
  v_streak_broken TIMESTAMPTZ;
  v_penalty INTEGER := 0;
  v_xp INTEGER;
  v_deadline TIMESTAMPTZ;
  v_completed TIMESTAMPTZ;
  v_was_overdue BOOLEAN := FALSE;
BEGIN
  IF NOT can_manage() THEN
    RAISE EXCEPTION 'Only admins or managers can approve tasks';
  END IF;

  SELECT * INTO v_cfg FROM xp_settings WHERE id = TRUE;

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
      SELECT streak_broken_at INTO v_streak_broken FROM profiles WHERE id = v_assignee;

      SELECT COUNT(*)::INTEGER INTO v_streak
      FROM (
        SELECT DISTINCT (created_at AT TIME ZONE 'Europe/Berlin')::date AS day
        FROM xp_log
        WHERE user_id = v_assignee AND amount > 0
          AND created_at > NOW() - INTERVAL '11 days'
      ) days
      WHERE day >= (NOW() AT TIME ZONE 'Europe/Berlin')::date - 10
        AND (v_streak_broken IS NULL OR day > (v_streak_broken AT TIME ZONE 'Europe/Berlin')::date);
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

  RETURN jsonb_build_object(
    'xp_per_assignee', v_base + v_near + v_early - v_penalty,
    'base', v_base,
    'near_deadline_bonus', v_near,
    'early_bonus', v_early,
    'penalty', v_penalty,
    'was_overdue', v_was_overdue
  );
END;
$$;
GRANT EXECUTE ON FUNCTION approve_task(UUID) TO authenticated;

-- ============================================================
-- 4. reject_task — 043 body WITHOUT the recurring respawn.
-- ============================================================
CREATE OR REPLACE FUNCTION reject_task(p_task_id UUID)
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
  v_penalty INTEGER;
  v_current_xp INTEGER;
BEGIN
  IF NOT can_manage() THEN
    RAISE EXCEPTION 'Only admins or managers can reject tasks';
  END IF;

  SELECT * INTO v_cfg FROM xp_settings WHERE id = TRUE;

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

  UPDATE tasks
  SET status = 'REJECTED', rejected_at = NOW(), needs_clarification = FALSE
  WHERE id = p_task_id;

  FOREACH v_assignee IN ARRAY v_assignees LOOP
    CONTINUE WHEN v_assignee IS NULL;

    SELECT xp INTO v_current_xp FROM profiles WHERE id = v_assignee;
    v_penalty := LEAST(v_base, GREATEST(0, COALESCE(v_current_xp, 0)));
    IF v_penalty > 0 THEN
      PERFORM award_xp(v_assignee, -v_penalty, 'Task rejected (penalty -' || v_penalty || ')', p_task_id);
    END IF;

    UPDATE profiles SET streak_broken_at = NOW() WHERE id = v_assignee;

    INSERT INTO notifications (user_id, type, message, task_id)
    VALUES (v_assignee, 'rejected', 'Rejected: ' || v_task.title, p_task_id);
  END LOOP;

  RETURN jsonb_build_object('penalty', v_base);
END;
$$;
GRANT EXECUTE ON FUNCTION reject_task(UUID) TO authenticated;

COMMIT;
