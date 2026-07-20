-- 043_reject_respawn_and_approval_notify.sql
--
-- Three fixes from Tan's 2026-07-20 batch:
--
-- (A) Recurring gap on REJECT. Until now only approve_task spawned the next
--     recurring instance (migration 020/041). A rejected recurring task left NO
--     successor, so a member whose LOGIN got rejected simply had no next LOGIN —
--     the "logins fehlen bei manchen, logouts bei anderen" symptom. reject_task
--     now respawns the next period exactly like approve_task, and a one-time
--     backfill fills the gaps that already exist.
--
-- (B) "Ready for review" notifications for PRIVATE tasks. notify_on_submit_for_
--     approval (037) fired on ANY task entering DONE — including board-less
--     private to-dos (the /private page toggles ASSIGNED<->DONE). Those pinged
--     every admin with a link that resolves to /dashboard ("komme ich ins nix").
--     Private tasks are personal and never need approval, so the trigger now
--     only fires for real board tasks (board_id IS NOT NULL).
--
-- (C) Show WHO submitted. The approval notification message now leads with the
--     assignee's name ("Cindy submitted: LOGIN") so the reviewer sees at a glance
--     whose work is waiting.
--
-- Run in the Supabase SQL editor AFTER 042_shifts_and_timezones.sql.

BEGIN;

-- ============================================================
-- (B)+(C) notify_on_submit_for_approval — skip private tasks, name the submitter
-- ============================================================
CREATE OR REPLACE FUNCTION notify_on_submit_for_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_assignee_is_member BOOLEAN;
  v_submitter TEXT;
BEGIN
  -- Only board tasks go through approval. Private/board-less to-dos (created on
  -- /private, self-assigned) toggle DONE for the owner's own tracking and must
  -- never notify reviewers.
  IF NEW.status = 'DONE' AND OLD.status IS DISTINCT FROM 'DONE' AND NEW.board_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM profiles
      WHERE id = ANY (COALESCE(NULLIF(NEW.assignee_ids, '{}'), ARRAY[NEW.assigned_to]))
        AND role NOT IN ('admin', 'manager')
    ) INTO v_assignee_is_member;

    -- The person who did the work — shown first in the message.
    SELECT COALESCE(NULLIF(full_name, ''), email, 'A member')
      INTO v_submitter FROM profiles WHERE id = NEW.assigned_to;

    INSERT INTO notifications (user_id, type, message, task_id)
    SELECT p.id, 'result_submitted',
           COALESCE(v_submitter, 'A member') || ' submitted: ' || COALESCE(NULLIF(NEW.title, ''), 'a task'),
           NEW.id
    FROM profiles p
    WHERE p.deactivated_at IS NULL
      AND p.id <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
      AND p.id <> NEW.assigned_to
      AND (
        p.role = 'admin'
        OR (p.role = 'manager' AND v_assignee_is_member)
      );
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================
-- (A) reject_task — same body as 041, plus a recurring respawn so the next
--     period is queued the moment a rejection is final (mirrors approve_task).
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

  -- Queue the next period so the board is never left without the recurring task.
  -- Same rule as approve_task: old deadline + 1 period, clamped to the future.
  IF v_task.recurring_enabled AND v_task.recurring_frequency IN ('DAILY', 'WEEKLY', 'MONTHLY') THEN
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

-- ============================================================
-- (A) Backfill — recurring tasks already stuck in APPROVED/REJECTED with no open
-- successor get their next instance now, so today's board is whole again. Matches
-- a "successor" by same template_item_id + assignee (or, for ad-hoc recurring
-- tasks without a template item, same title + assignee). Only the most recent
-- settled instance per group spawns, and only if nothing open already exists.
-- ============================================================
DO $$
DECLARE
  v_task tasks%ROWTYPE;
  v_deadline TIMESTAMPTZ;
  v_interval INTERVAL;
  v_next_deadline TIMESTAMPTZ;
  v_new_task_id UUID;
BEGIN
  FOR v_task IN
    SELECT DISTINCT ON (COALESCE(template_item_id::text, title), assigned_to) t.*
    FROM tasks t
    WHERE t.recurring_enabled
      AND t.recurring_frequency IN ('DAILY', 'WEEKLY', 'MONTHLY')
      AND t.status IN ('APPROVED', 'REJECTED')
      AND t.deleted_at IS NULL
      AND t.board_id IS NOT NULL
      -- No open sibling for this recurring slot (same item/title + assignee)?
      AND NOT EXISTS (
        SELECT 1 FROM tasks o
        WHERE o.assigned_to = t.assigned_to
          AND o.deleted_at IS NULL
          AND o.status NOT IN ('APPROVED', 'REJECTED')
          AND COALESCE(o.template_item_id::text, o.title) = COALESCE(t.template_item_id::text, t.title)
      )
    ORDER BY COALESCE(template_item_id::text, title), assigned_to, t.deadline_at DESC NULLS LAST
  LOOP
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
    FROM tasks WHERE id = v_task.id
    RETURNING id INTO v_new_task_id;

    INSERT INTO checklist_items (task_id, title, position, done)
    SELECT v_new_task_id, title, position, FALSE FROM checklist_items WHERE task_id = v_task.id;
  END LOOP;
END $$;

COMMIT;
