-- 018_xp_settings.sql
--
-- Admin-configurable XP values. Until now every XP number was hardcoded inside
-- approve_task(); changing the reward meant a new migration. This adds a single-row
-- `xp_settings` table the admin edits from Settings → XP Management, and redefines
-- approve_task() to read from it on every approval.
--
-- New XP model (user decision 2026-07-07): base XP comes from the task's CATEGORY
-- (Daily/Weekly/Monthly) PLUS a priority surcharge (Low/Medium/High), instead of
-- priority alone. Defaults below reproduce a close equivalent of the old feel:
-- old: LOW 5 / MEDIUM 10 / HIGH 20 (any section)
-- new: Daily 5 / Weekly 10 / Monthly 20 base, + Low 0 / Medium 5 / High 10.
-- The overdue penalty mirrors the full base (category + priority), as before.
--
-- Run this in the Supabase SQL editor AFTER 017_remove_imminent_section.sql.

BEGIN;

-- 1. Single-row settings table (id is a always-true boolean so a second row is impossible).
CREATE TABLE IF NOT EXISTS xp_settings (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  section_daily INTEGER NOT NULL DEFAULT 5 CHECK (section_daily >= 0),
  section_weekly INTEGER NOT NULL DEFAULT 10 CHECK (section_weekly >= 0),
  section_monthly INTEGER NOT NULL DEFAULT 20 CHECK (section_monthly >= 0),
  prio_low_bonus INTEGER NOT NULL DEFAULT 0 CHECK (prio_low_bonus >= 0),
  prio_medium_bonus INTEGER NOT NULL DEFAULT 5 CHECK (prio_medium_bonus >= 0),
  prio_high_bonus INTEGER NOT NULL DEFAULT 10 CHECK (prio_high_bonus >= 0),
  near_deadline_bonus INTEGER NOT NULL DEFAULT 10 CHECK (near_deadline_bonus >= 0),
  near_deadline_window_hours INTEGER NOT NULL DEFAULT 24 CHECK (near_deadline_window_hours >= 0),
  early_bonus_per_day INTEGER NOT NULL DEFAULT 1 CHECK (early_bonus_per_day >= 0),
  early_bonus_max INTEGER NOT NULL DEFAULT 10 CHECK (early_bonus_max >= 0),
  streak_bonus_per_day INTEGER NOT NULL DEFAULT 1 CHECK (streak_bonus_per_day >= 0),
  streak_bonus_max INTEGER NOT NULL DEFAULT 10 CHECK (streak_bonus_max >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES profiles(id)
);

INSERT INTO xp_settings (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;

ALTER TABLE xp_settings ENABLE ROW LEVEL SECURITY;

-- Everyone signed in may read (the UI shows reward values); only admins may change.
DROP POLICY IF EXISTS xp_settings_select ON xp_settings;
CREATE POLICY xp_settings_select ON xp_settings FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS xp_settings_update ON xp_settings;
CREATE POLICY xp_settings_update ON xp_settings FOR UPDATE TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- No INSERT/DELETE policies on purpose: the single row is seeded above and must stay.

-- 2. approve_task(): same flow as 017, but every XP number now comes from xp_settings.
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
      -- Early completion bonus: +N XP per full day early, capped
      v_early := LEAST(
        v_cfg.early_bonus_max,
        GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (v_deadline - v_completed)) / 86400))::INTEGER * v_cfg.early_bonus_per_day
      );
      -- Near-deadline bonus: completed within the configured window before the deadline
      IF (v_deadline - v_completed) <= make_interval(hours => v_cfg.near_deadline_window_hours) THEN
        v_near := v_cfg.near_deadline_bonus;
      END IF;
    ELSE
      -- Overdue penalty (applied on admin review): mirrors the full base.
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
      -- Streak: consecutive calendar days (Berlin) with an approved task, +N/day capped
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

COMMIT;
