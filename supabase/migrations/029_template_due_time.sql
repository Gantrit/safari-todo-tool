-- 029_template_due_time.sql
--
-- Optional time-of-day target per template task. Some to-dos have a hard daily
-- cutoff (e.g. "first login done by 06:05"). Until now every assigned task got a
-- deadline of NOW() + period with no meaningful clock time, so the near-deadline
-- XP bonus / overdue penalty couldn't reflect a real cutoff.
--
-- This adds template_items.due_time (nullable TIME). When set, assign_template
-- builds the first deadline at that wall-clock time in Europe/Berlin (the app's
-- canonical timezone, same as the streak logic in 020):
--   DAILY   -> the next occurrence of that time (today if still in the future,
--              otherwise tomorrow)
--   WEEKLY  -> today + 7 days at that time
--   MONTHLY -> today + 1 month at that time
-- When due_time is NULL the old behaviour is kept (NOW() + period).
--
-- The recurring regeneration in approve_task (020) already carries the deadline
-- forward by one period, so the clock time propagates to every future copy on
-- its own — no change needed there.
--
-- Run in the Supabase SQL editor AFTER 028_auto_enroll_workspace_members.sql.

BEGIN;

ALTER TABLE template_items ADD COLUMN IF NOT EXISTS due_time TIME;

CREATE OR REPLACE FUNCTION assign_template(p_template_id UUID, p_board_id UUID, p_assignee UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item template_items%ROWTYPE;
  v_task_id UUID;
  v_deadline TIMESTAMPTZ;
  v_due_date DATE;
  v_target_date DATE;
  v_count INTEGER := 0;
  v_cl TEXT;
  v_pos INTEGER;
BEGIN
  IF NOT can_manage() THEN
    RAISE EXCEPTION 'Only admins or managers can assign templates';
  END IF;

  FOR v_item IN SELECT * FROM template_items WHERE template_id = p_template_id ORDER BY position, created_at LOOP
    IF v_item.due_time IS NOT NULL THEN
      -- Anchor the deadline to a real wall-clock time in Berlin.
      v_target_date := (NOW() AT TIME ZONE 'Europe/Berlin')::date;
      IF v_item.section = 'WEEKLY' THEN
        v_target_date := v_target_date + 7;
      ELSIF v_item.section = 'MONTHLY' THEN
        v_target_date := (v_target_date + INTERVAL '1 month')::date;
      END IF;
      v_deadline := ((v_target_date + v_item.due_time) AT TIME ZONE 'Europe/Berlin');
      -- Daily cutoff already past today -> roll to tomorrow so it's never born overdue.
      IF v_item.section = 'DAILY' AND v_deadline <= NOW() THEN
        v_deadline := v_deadline + INTERVAL '1 day';
      END IF;
    ELSE
      -- No time set: keep the original end-of-period behaviour.
      v_deadline := CASE v_item.section
        WHEN 'DAILY' THEN NOW() + INTERVAL '1 day'
        WHEN 'WEEKLY' THEN NOW() + INTERVAL '7 days'
        ELSE NOW() + INTERVAL '1 month'
      END;
    END IF;

    -- Store the calendar day in Berlin terms so due_date matches the local deadline.
    v_due_date := (v_deadline AT TIME ZONE 'Europe/Berlin')::date;

    INSERT INTO tasks (board_id, assigned_to, assignee_ids, created_by, creator_id, title, description,
                       priority, status, section, due_date, deadline_at, remind_3d, remind_24h,
                       xp_awarded, position, reference_url, google_drive_url,
                       recurring_enabled, recurring_frequency, labels)
    VALUES (p_board_id, p_assignee, ARRAY[p_assignee], auth.uid(), auth.uid(), v_item.title, v_item.description,
            v_item.priority, 'ASSIGNED', v_item.section, v_due_date, v_deadline, FALSE, FALSE,
            FALSE, v_count, v_item.reference_url, v_item.reference_url,
            TRUE, v_item.section, '{}')
    RETURNING id INTO v_task_id;

    v_pos := 0;
    FOREACH v_cl IN ARRAY COALESCE(v_item.checklist, '{}') LOOP
      INSERT INTO checklist_items (task_id, title, position, done) VALUES (v_task_id, v_cl, v_pos, FALSE);
      v_pos := v_pos + 1;
    END LOOP;

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('created', v_count);
END;
$$;
GRANT EXECUTE ON FUNCTION assign_template(UUID, UUID, UUID) TO authenticated;

COMMIT;
