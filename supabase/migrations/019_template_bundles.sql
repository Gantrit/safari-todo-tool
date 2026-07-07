-- 019_template_bundles.sql
--
-- Templates were a single task each. This turns a template into a NAMED BUNDLE of many tasks
-- (grouped by Daily/Weekly/Monthly) that an admin/manager assigns to a member in one click:
-- every item becomes a real, recurring task for that member (recurrence handled in migration 020).
--
-- `task_templates` stays as the bundle (its `title` = template name, `description` = notes). The
-- individual tasks move into a new child table `template_items`. Existing single-task templates
-- are backfilled into one item each so nothing is lost.
--
-- Editing a template only changes the bundle/items; already-assigned tasks are independent copies
-- and are NOT retro-updated (user decision 2026-07-07).
--
-- Run in the Supabase SQL editor AFTER 018_xp_settings.sql.

BEGIN;

CREATE TABLE IF NOT EXISTS template_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID NOT NULL REFERENCES task_templates(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  section TEXT NOT NULL DEFAULT 'DAILY' CHECK (section IN ('DAILY', 'WEEKLY', 'MONTHLY')),
  priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH')),
  checklist TEXT[] NOT NULL DEFAULT '{}',
  reference_url TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS template_items_template_idx ON template_items(template_id);

ALTER TABLE template_items ENABLE ROW LEVEL SECURITY;

-- Everyone signed in may read templates; only admins/managers may change them.
DROP POLICY IF EXISTS template_items_select ON template_items;
CREATE POLICY template_items_select ON template_items FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS template_items_write ON template_items;
CREATE POLICY template_items_write ON template_items FOR ALL TO authenticated
  USING (can_manage()) WITH CHECK (can_manage());

-- Backfill every existing single-task template into one item (only if it has none yet).
INSERT INTO template_items (template_id, title, description, section, priority, checklist, reference_url, position)
SELECT t.id, t.title, t.description,
       CASE WHEN t.section IN ('DAILY', 'WEEKLY', 'MONTHLY') THEN t.section ELSE 'DAILY' END,
       t.priority, COALESCE(t.checklist, '{}'), t.reference_url, 0
FROM task_templates t
WHERE t.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM template_items ti WHERE ti.template_id = t.id);

-- assign_template: instantiate every item of a template as a real, recurring task for one member.
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
  v_count INTEGER := 0;
  v_cl TEXT;
  v_pos INTEGER;
BEGIN
  IF NOT can_manage() THEN
    RAISE EXCEPTION 'Only admins or managers can assign templates';
  END IF;

  FOR v_item IN SELECT * FROM template_items WHERE template_id = p_template_id ORDER BY position, created_at LOOP
    -- First deadline = end of the current period for the item's cadence.
    v_deadline := CASE v_item.section
      WHEN 'DAILY' THEN NOW() + INTERVAL '1 day'
      WHEN 'WEEKLY' THEN NOW() + INTERVAL '7 days'
      ELSE NOW() + INTERVAL '1 month'
    END;

    INSERT INTO tasks (board_id, assigned_to, assignee_ids, created_by, creator_id, title, description,
                       priority, status, section, due_date, deadline_at, remind_3d, remind_24h,
                       xp_awarded, position, reference_url, google_drive_url,
                       recurring_enabled, recurring_frequency, labels)
    VALUES (p_board_id, p_assignee, ARRAY[p_assignee], auth.uid(), auth.uid(), v_item.title, v_item.description,
            v_item.priority, 'ASSIGNED', v_item.section, v_deadline::date, v_deadline, FALSE, FALSE,
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
