-- 036_assign_template_board_access.sql
--
-- Bug (2026-07-18): assigning a template to a member instantiated its tasks on
-- whatever board the "Assign to member" form had selected, WITHOUT checking that
-- the member actually has access to that board. If the board dropdown defaulted
-- to a board the member can't see (all boards share one workspace, so every
-- member showed up as a selectable assignee), the tasks were created on the wrong
-- board where the member has no column — counted in the header/dashboard but
-- rendered nowhere, impossible to find or delete.
--
-- The UI now scopes the assignee dropdown to each board's board_access members
-- (board_members RPC), but we harden the RPC itself so a wrong board/member pair
-- can never create orphan tasks again, whatever calls it.
--
-- Rule: the assignee must have a board_access row for the target board. Admins
-- have implicit access to every board (is_admin bypass), so they're allowed even
-- without an explicit board_access row.
--
-- Body is otherwise IDENTICAL to migration 029 (due_time deadline anchoring) —
-- only the access guard at the top is new. Run AFTER 035.

BEGIN;

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

  -- NEW: the assignee must actually have access to the target board, otherwise
  -- the tasks would be born orphaned (on a board with no column for them).
  -- Admins have implicit access to every board, so they're exempt.
  IF NOT (
    EXISTS (SELECT 1 FROM board_access WHERE board_id = p_board_id AND user_id = p_assignee)
    OR EXISTS (SELECT 1 FROM profiles WHERE id = p_assignee AND role = 'admin')
  ) THEN
    RAISE EXCEPTION 'That member has no access to the selected board — grant board access first, or pick the board they belong to';
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
