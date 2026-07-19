-- 038_template_sync.sql
--
-- Feature (user request 2026-07-19): editing a template should be able to
-- propagate to the tasks that were ALREADY assigned from it. Until now the two
-- were disconnected — "Editing a template is NOT retro-applied" — because tasks
-- never stored where they came from.
--
-- What this migration does:
--   1. tasks.template_id + tasks.template_item_id (both nullable, SET NULL on
--      delete) record the template bundle/item a task was instantiated from.
--   2. assign_template() stamps both columns (body otherwise identical to 036).
--   3. approve_task() carries both columns onto the respawned recurring copy
--      (body otherwise identical to 035) — without this, the link would die
--      after the first recurrence and syncing would silently stop working.
--   4. NEW RPC sync_template_tasks(p_template_id): admin-only. For every item
--      of the template, updates all linked OPEN tasks (ASSIGNED / IN_EDIT /
--      REJECTED — never DONE or APPROVED, those are mid-review or history):
--      title, description, priority, section (+recurring_frequency), reference
--      link, and the checklist (replaced from the template; a previously ticked
--      item stays ticked when its title is unchanged). Deadlines are NOT touched.
--   5. Backfill: links existing open recurring tasks to template items by exact
--      (title, section) match, but only where that pair is unambiguous across
--      all live templates — so tonight's already-assigned bundles sync too.
--
-- IMPORTANT client-side counterpart (same commit): TemplateLibrary now UPSERTS
-- template items on edit instead of delete+reinsert, so item ids — and with
-- them these links — survive edits. Do not revert that.
--
-- Run in the Supabase SQL editor AFTER 037.

BEGIN;

-- ------------------------------------------------------------
-- 1. Provenance columns
-- ------------------------------------------------------------
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES task_templates(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS template_item_id UUID REFERENCES template_items(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS tasks_template_item_idx ON tasks (template_item_id) WHERE template_item_id IS NOT NULL;

-- ------------------------------------------------------------
-- 2. assign_template — stamp provenance (body otherwise = 036)
-- ------------------------------------------------------------
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

  -- The assignee must actually have access to the target board, otherwise the
  -- tasks would be born orphaned (on a board with no column for them). Admins
  -- have implicit access to every board, so they're exempt.
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
                       recurring_enabled, recurring_frequency, labels,
                       template_id, template_item_id)
    VALUES (p_board_id, p_assignee, ARRAY[p_assignee], auth.uid(), auth.uid(), v_item.title, v_item.description,
            v_item.priority, 'ASSIGNED', v_item.section, v_due_date, v_deadline, FALSE, FALSE,
            FALSE, v_count, v_item.reference_url, v_item.reference_url,
            TRUE, v_item.section, '{}',
            p_template_id, v_item.id)
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

-- ------------------------------------------------------------
-- 3. approve_task — carry provenance onto the recurring respawn
--    (body otherwise = 035: manager hierarchy + XP + archive)
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

  -- Managers may only approve tasks assigned to members — never their own,
  -- never another manager's or admin's. Admins are unrestricted.
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
-- 4. sync_template_tasks — apply template edits to open tasks
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_template_tasks(p_template_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item template_items%ROWTYPE;
  v_task_id UUID;
  v_done_titles TEXT[];
  v_cl TEXT;
  v_pos INTEGER;
  v_updated INTEGER := 0;
BEGIN
  -- Template editing is admin-only (RLS on task_templates) — the sync matches.
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Only admins can apply template changes to assigned tasks';
  END IF;

  FOR v_item IN SELECT * FROM template_items WHERE template_id = p_template_id LOOP
    FOR v_task_id IN
      SELECT id FROM tasks
      WHERE template_item_id = v_item.id
        AND deleted_at IS NULL
        AND status IN ('ASSIGNED', 'IN_EDIT', 'REJECTED')
      FOR UPDATE
    LOOP
      UPDATE tasks SET
        title = v_item.title,
        description = v_item.description,
        priority = v_item.priority,
        section = v_item.section,
        recurring_frequency = v_item.section,
        reference_url = v_item.reference_url,
        google_drive_url = v_item.reference_url,
        updated_at = NOW()
      WHERE id = v_task_id;

      -- Replace the checklist from the template. A tick survives when the item
      -- title is unchanged; renamed/new items come back unticked.
      SELECT COALESCE(array_agg(title), '{}') INTO v_done_titles
      FROM checklist_items WHERE task_id = v_task_id AND done;

      DELETE FROM checklist_items WHERE task_id = v_task_id;
      v_pos := 0;
      FOREACH v_cl IN ARRAY COALESCE(v_item.checklist, '{}') LOOP
        INSERT INTO checklist_items (task_id, title, position, done)
        VALUES (v_task_id, v_cl, v_pos, v_cl = ANY(v_done_titles));
        v_pos := v_pos + 1;
      END LOOP;

      v_updated := v_updated + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('updated', v_updated);
END;
$$;
GRANT EXECUTE ON FUNCTION sync_template_tasks(UUID) TO authenticated;

-- ------------------------------------------------------------
-- 5. Backfill: link existing open recurring tasks to their template items by
--    exact (title, section) match — only where that pair is unambiguous across
--    all live templates, so we never guess wrong.
-- ------------------------------------------------------------
WITH unique_items AS (
  SELECT ti.title, ti.section,
         (MIN(ti.id::text))::uuid AS item_id,
         (MIN(ti.template_id::text))::uuid AS tmpl_id
  FROM template_items ti
  JOIN task_templates tt ON tt.id = ti.template_id AND tt.deleted_at IS NULL
  GROUP BY ti.title, ti.section
  HAVING COUNT(*) = 1
)
UPDATE tasks t
SET template_item_id = u.item_id,
    template_id = u.tmpl_id
FROM unique_items u
WHERE t.template_item_id IS NULL
  AND t.deleted_at IS NULL
  AND t.recurring_enabled
  AND t.status <> 'APPROVED'
  AND t.title = u.title
  AND t.section = u.section;

COMMIT;
