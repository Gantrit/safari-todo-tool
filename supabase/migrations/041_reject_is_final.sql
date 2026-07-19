-- 041_reject_is_final.sql
--
-- Feature (Tan, 2026-07-19): a rejection should be a real, final decision, not a
-- soft nudge. New rules:
--   1. Rejecting a task ALWAYS deducts the task's full base XP (category value +
--      priority surcharge — the same figure the overdue penalty uses), clamped so
--      a member can never go below 0 XP. The old opt-in "-5 quality issue" mode is
--      gone; there is now a single reject action.
--   2. Rejecting BREAKS the member's streak. The streak is derived from the days a
--      member earned positive XP (see approve_task + the character page), so there
--      is no counter to zero out — instead we stamp profiles.streak_broken_at, and
--      both streak calculations ignore every day on/before that stamp.
--   3. A rejected task is FINAL for the member: they can no longer pull it back to
--      IN_EDIT themselves. Only an admin/manager reopen (reopen_task) can revive it.
--      (For an accidental submit the reviewer still has the neutral "Back to IN EDIT
--      (no rejection)" reset added on 2026-07-19 — that path applies no penalty.)
--
-- Run in the Supabase SQL editor AFTER 040_notification_delete.sql.

BEGIN;

-- ------------------------------------------------------------
-- 1. Streak-break marker
-- ------------------------------------------------------------
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS streak_broken_at TIMESTAMPTZ;

-- Freeze it against direct client writes, alongside the other protected columns
-- (migration 034). SECURITY DEFINER RPCs run as a non-`authenticated` role and
-- pass through untouched.
CREATE OR REPLACE FUNCTION protect_profile_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF NEW.role             IS DISTINCT FROM OLD.role
     OR NEW.xp               IS DISTINCT FROM OLD.xp
     OR NEW.level            IS DISTINCT FROM OLD.level
     OR NEW.streak_days      IS DISTINCT FROM OLD.streak_days
     OR NEW.streak_broken_at IS DISTINCT FROM OLD.streak_broken_at
     OR NEW.deactivated_at   IS DISTINCT FROM OLD.deactivated_at THEN
    RAISE EXCEPTION 'Protected profile columns (role, xp, level, streak_days, streak_broken_at, deactivated_at) can only be changed through admin functions';
  END IF;

  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- 2. reject_task — always penalize (full base, clamped), break the streak,
--    single action (the p_quality_penalty variant is dropped).
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS reject_task(UUID, BOOLEAN);

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

  RETURN jsonb_build_object('penalty', v_base);
END;
$$;
GRANT EXECUTE ON FUNCTION reject_task(UUID) TO authenticated;

-- ------------------------------------------------------------
-- 3. approve_task — streak bonus now ignores days on/before streak_broken_at.
--    (Body copied verbatim from migration 038; only the streak subquery gains a
--    streak_broken_at filter, plus the v_streak_broken fetch.)
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

  IF v_task.recurring_enabled AND v_task.recurring_frequency IN ('DAILY', 'WEEKLY', 'MONTHLY') THEN
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

-- ------------------------------------------------------------
-- 4. enforce_task_status_transitions — a member can no longer pull a REJECTED
--    task back to IN_EDIT. (Body copied from 035; the REJECTED→IN_EDIT line is
--    removed from the assignee-allowed set. Admin/manager reopen is unaffected —
--    they bypass this list above.)
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

  IF OLD.status = 'ASSIGNED' AND NEW.status = 'IN_EDIT' AND NEW.noticed_at IS NULL THEN
    NEW.noticed_at := NOW();
  END IF;

  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')) INTO v_can_manage;

  IF v_can_manage THEN
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

  IF OLD.board_id IS NULL AND OLD.created_by = auth.uid() THEN
    RETURN NEW;
  END IF;

  IF NEW.status IN ('APPROVED', 'REJECTED') THEN
    RAISE EXCEPTION 'Only admins or managers can set a task to %', NEW.status;
  END IF;

  IF OLD.status = 'APPROVED' THEN
    RAISE EXCEPTION 'Only admins or managers can reopen an approved task';
  END IF;

  -- A rejection is final for the member: no self-serve REJECTED → IN_EDIT.
  IF OLD.status = 'REJECTED' THEN
    RAISE EXCEPTION 'Only admins or managers can reopen a rejected task';
  END IF;

  -- Allowed transitions for assignees/creators (forward + one step back)
  IF NOT (
    (OLD.status = 'ASSIGNED' AND NEW.status = 'IN_EDIT') OR
    (OLD.status = 'IN_EDIT' AND NEW.status = 'DONE') OR
    (OLD.status = 'IN_EDIT' AND NEW.status = 'ASSIGNED') OR
    (OLD.status = 'DONE' AND NEW.status = 'IN_EDIT')
  ) THEN
    RAISE EXCEPTION 'Transition % -> % is not allowed', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
