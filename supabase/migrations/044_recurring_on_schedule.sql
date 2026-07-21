-- 044_recurring_on_schedule.sql
--
-- Recurring tasks now appear ON SCHEDULE, independently of whether the previous
-- occurrence was ever approved or rejected (Tan, 2026-07-22).
--
-- Until now the ONLY thing that spawned the next occurrence of a recurring task
-- was approve_task (020/041) or reject_task (043). So if a reviewer never got
-- around to approving yesterday's LOGIN, no LOGIN was created for today — the
-- work silently stopped recurring until someone acted on the old one.
--
-- This migration decouples "the next occurrence exists" from "you reviewed the
-- last one" by introducing a single invariant enforced in three places:
--
--     Each recurring slot has at most ONE open, not-yet-overdue occurrence.
--
--   A "slot" is (template_item_id OR title) + assigned_to — the same identity
--   the 043 backfill already used. "Open" = status NOT IN (APPROVED, REJECTED).
--   "Not-yet-overdue" = its deadline is still in the future.
--
-- (A) ensure_recurring_occurrences() — an idempotent catch-up. For every
--     recurring slot with no open, future occurrence, it rolls the latest
--     occurrence forward on its original cadence to the first slot that is still
--     in the future and materializes exactly that one (never a backlog of missed
--     days). Called on board load, so today's recurring tasks show up on time
--     regardless of the review queue. A transaction-level advisory lock keeps two
--     concurrent board loads from double-spawning the same slot.
--
-- (B) approve_task / reject_task — same bodies as 041 / 043, but the recurring
--     respawn is now guarded by the SAME invariant: it only queues a successor
--     when the slot has no open, future occurrence. That stops the catch-up and a
--     later approval from creating two copies of the same period.
--
-- Run in the Supabase SQL editor AFTER 043_reject_respawn_and_approval_notify.sql.

BEGIN;

-- ============================================================
-- (A) ensure_recurring_occurrences — schedule-driven catch-up
-- ============================================================
CREATE OR REPLACE FUNCTION ensure_recurring_occurrences()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_task tasks%ROWTYPE;
  v_interval INTERVAL;
  v_deadline TIMESTAMPTZ;
  v_next TIMESTAMPTZ;
  v_guard INTEGER;
  v_new_task_id UUID;
  v_count INTEGER := 0;
BEGIN
  -- Serialize catch-up across concurrent board loads so two sessions cannot both
  -- decide the same slot is empty and each insert a copy.
  PERFORM pg_advisory_xact_lock(hashtext('ensure_recurring_occurrences'));

  -- One row per recurring slot: its most recent occurrence (open or settled).
  FOR v_task IN
    SELECT DISTINCT ON (COALESCE(template_item_id::text, title), assigned_to) t.*
    FROM tasks t
    WHERE t.recurring_enabled
      AND t.recurring_frequency IN ('DAILY', 'WEEKLY', 'MONTHLY')
      AND t.deleted_at IS NULL
      AND t.board_id IS NOT NULL
    ORDER BY COALESCE(template_item_id::text, title), assigned_to,
             t.deadline_at DESC NULLS LAST, t.created_at DESC
  LOOP
    -- Invariant: skip any slot that already has an open, not-yet-overdue occurrence.
    IF EXISTS (
      SELECT 1 FROM tasks o
      WHERE o.deleted_at IS NULL
        AND o.assigned_to = v_task.assigned_to
        AND o.status NOT IN ('APPROVED', 'REJECTED')
        AND COALESCE(o.template_item_id::text, o.title) = COALESCE(v_task.template_item_id::text, v_task.title)
        AND COALESCE(o.deadline_at, o.due_date::timestamptz + time '23:59') >= NOW()
    ) THEN
      CONTINUE;
    END IF;

    v_interval := CASE v_task.recurring_frequency
      WHEN 'DAILY' THEN INTERVAL '1 day'
      WHEN 'WEEKLY' THEN INTERVAL '7 days'
      ELSE INTERVAL '1 month'
    END;

    -- Roll forward on the original cadence to the first occurrence still in the
    -- future — we materialize today's slot, not every day that was missed.
    v_deadline := COALESCE(v_task.deadline_at, v_task.due_date::timestamptz + time '23:59', NOW());
    v_next := v_deadline;
    v_guard := 0;
    WHILE v_next < NOW() AND v_guard < 400 LOOP
      v_next := v_next + v_interval;
      v_guard := v_guard + 1;
    END LOOP;
    IF v_next < NOW() THEN
      v_next := NOW() + v_interval;  -- pathological gap (cadence far in the past)
    END IF;

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
-- (B) approve_task — body verbatim from 041, plus the "no open future
--     occurrence" guard on the recurring respawn (prevents catch-up + a later
--     approval from double-spawning the same period).
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
  v_interval INTERVAL;
  v_next_deadline TIMESTAMPTZ;
  v_new_task_id UUID;
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

  -- Recurring respawn — only when the slot has no open, not-yet-overdue occurrence.
  -- The catch-up (ensure_recurring_occurrences) may already have materialized this
  -- period; the guard keeps us from adding a duplicate.
  IF v_task.recurring_enabled AND v_task.recurring_frequency IN ('DAILY', 'WEEKLY', 'MONTHLY')
     AND NOT EXISTS (
       SELECT 1 FROM tasks o
       WHERE o.deleted_at IS NULL
         AND o.id <> p_task_id
         AND o.assigned_to = v_task.assigned_to
         AND o.status NOT IN ('APPROVED', 'REJECTED')
         AND COALESCE(o.template_item_id::text, o.title) = COALESCE(v_task.template_item_id::text, v_task.title)
         AND COALESCE(o.deadline_at, o.due_date::timestamptz + time '23:59') >= NOW()
     )
  THEN
    v_interval := CASE v_task.recurring_frequency
      WHEN 'DAILY' THEN INTERVAL '1 day'
      WHEN 'WEEKLY' THEN INTERVAL '7 days'
      ELSE INTERVAL '1 month'
    END;
    v_next_deadline := COALESCE(v_deadline, NOW()) + v_interval;
    IF v_next_deadline < NOW() THEN
      v_next_deadline := NOW() + v_interval;
    END IF;

    INSERT INTO tasks (board_id, assigned_to, assignee_ids, created_by, creator_id, title, description,
                       priority, status, section, due_date, deadline_at, remind_3d, remind_24h,
                       xp_awarded, position, reference_url, google_drive_url,
                       recurring_enabled, recurring_frequency, labels,
                       template_id, template_item_id)
    SELECT board_id, assigned_to, assignee_ids, created_by, creator_id, title, description,
           priority, 'ASSIGNED', section, v_next_deadline::date, v_next_deadline, remind_3d, remind_24h,
           FALSE, position, reference_url, google_drive_url,
           recurring_enabled, recurring_frequency, labels,
           template_id, template_item_id
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

-- ============================================================
-- (B) reject_task — body verbatim from 043, plus the same recurring guard.
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
  v_deadline TIMESTAMPTZ;
  v_interval INTERVAL;
  v_next_deadline TIMESTAMPTZ;
  v_new_task_id UUID;
BEGIN
  IF NOT can_manage() THEN
    RAISE EXCEPTION 'Only admins or managers can reject tasks';
  END IF;

  SELECT * INTO v_cfg FROM xp_settings WHERE id = TRUE;

  SELECT * INTO v_task FROM tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Task not found'; END IF;

  v_assignees := COALESCE(NULLIF(v_task.assignee_ids, '{}'), ARRAY[v_task.assigned_to]);

  -- Managers may only reject member tasks, never their own (mirrors approve_task).
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') INTO v_is_admin;
  IF NOT v_is_admin THEN
    IF auth.uid() = ANY(v_assignees) THEN
      RAISE EXCEPTION 'Managers cannot reject their own tasks — ask an admin';
    END IF;
    IF EXISTS (SELECT 1 FROM profiles WHERE id = ANY(v_assignees) AND role <> 'employee') THEN
      RAISE EXCEPTION 'Managers can only reject tasks assigned to members';
    END IF;
  END IF;

  -- Full base = category value + priority surcharge (same as the overdue penalty).
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

    -- Never drive XP below zero — you can only lose what you have.
    SELECT xp INTO v_current_xp FROM profiles WHERE id = v_assignee;
    v_penalty := LEAST(v_base, GREATEST(0, COALESCE(v_current_xp, 0)));
    IF v_penalty > 0 THEN
      PERFORM award_xp(v_assignee, -v_penalty, 'Task rejected (penalty -' || v_penalty || ')', p_task_id);
    END IF;

    -- Break the streak: every gain-day on/before now is excluded from here on.
    UPDATE profiles SET streak_broken_at = NOW() WHERE id = v_assignee;

    INSERT INTO notifications (user_id, type, message, task_id)
    VALUES (v_assignee, 'rejected', 'Rejected: ' || v_task.title, p_task_id);
  END LOOP;

  -- Recurring respawn — only when the slot has no open, not-yet-overdue occurrence
  -- (same invariant as approve_task and the catch-up).
  IF v_task.recurring_enabled AND v_task.recurring_frequency IN ('DAILY', 'WEEKLY', 'MONTHLY')
     AND NOT EXISTS (
       SELECT 1 FROM tasks o
       WHERE o.deleted_at IS NULL
         AND o.id <> p_task_id
         AND o.assigned_to = v_task.assigned_to
         AND o.status NOT IN ('APPROVED', 'REJECTED')
         AND COALESCE(o.template_item_id::text, o.title) = COALESCE(v_task.template_item_id::text, v_task.title)
         AND COALESCE(o.deadline_at, o.due_date::timestamptz + time '23:59') >= NOW()
     )
  THEN
    v_deadline := COALESCE(v_task.deadline_at, v_task.due_date::timestamptz + time '23:59');
    v_interval := CASE v_task.recurring_frequency
      WHEN 'DAILY' THEN INTERVAL '1 day'
      WHEN 'WEEKLY' THEN INTERVAL '7 days'
      ELSE INTERVAL '1 month'
    END;
    v_next_deadline := COALESCE(v_deadline, NOW()) + v_interval;
    IF v_next_deadline < NOW() THEN
      v_next_deadline := NOW() + v_interval;
    END IF;

    INSERT INTO tasks (board_id, assigned_to, assignee_ids, created_by, creator_id, title, description,
                       priority, status, section, due_date, deadline_at, remind_3d, remind_24h,
                       xp_awarded, position, reference_url, google_drive_url,
                       recurring_enabled, recurring_frequency, labels,
                       template_id, template_item_id)
    SELECT board_id, assigned_to, assignee_ids, created_by, creator_id, title, description,
           priority, 'ASSIGNED', section, v_next_deadline::date, v_next_deadline, remind_3d, remind_24h,
           FALSE, position, reference_url, google_drive_url,
           recurring_enabled, recurring_frequency, labels,
           template_id, template_item_id
    FROM tasks WHERE id = p_task_id
    RETURNING id INTO v_new_task_id;

    INSERT INTO checklist_items (task_id, title, position, done)
    SELECT v_new_task_id, title, position, FALSE FROM checklist_items WHERE task_id = p_task_id;
  END IF;

  RETURN jsonb_build_object('penalty', v_base, 'recurred', (v_new_task_id IS NOT NULL));
END;
$$;
GRANT EXECUTE ON FUNCTION reject_task(UUID) TO authenticated;

COMMIT;
