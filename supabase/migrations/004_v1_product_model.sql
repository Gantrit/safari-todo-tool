-- Safari To-Dos V1 product model
-- Run after 001_initial_schema.sql, 002_rls_policies.sql, and 003_functions.sql.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'employee', 'guest', 'user'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rank TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS streak_days INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;

UPDATE profiles
SET role = 'employee'
WHERE role = 'user';

UPDATE profiles
SET role = 'admin'
WHERE lower(coalesce(full_name, '')) IN ('tan', 'furkan')
   OR lower(split_part(email, '@', 1)) IN ('tan', 'furkan');

ALTER TABLE workspace_members DROP CONSTRAINT IF EXISTS workspace_members_role_check;
ALTER TABLE workspace_members ADD CONSTRAINT workspace_members_role_check CHECK (role IN ('admin', 'employee', 'guest', 'user'));
UPDATE workspace_members SET role = 'employee' WHERE role = 'user';

CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO departments (name, slug, position)
VALUES
  ('Backend', 'backend', 10),
  ('Chatting Team', 'chatting-team', 20),
  ('Traffic', 'traffic', 30),
  ('Finance Tool', 'finance-tool', 40),
  ('Projects', 'projects', 50)
ON CONFLICT (slug) DO NOTHING;

DO $$
DECLARE
  workspace_id UUID;
BEGIN
  SELECT id INTO workspace_id FROM workspaces ORDER BY created_at LIMIT 1;
  IF workspace_id IS NOT NULL THEN
    INSERT INTO boards (workspace_id, name, type)
    SELECT workspace_id, d.name, 'kanban'
    FROM departments d
    WHERE NOT EXISTS (
      SELECT 1 FROM boards b
      WHERE b.workspace_id = workspace_id AND lower(b.name) = lower(d.name)
    );
  END IF;
END $$;

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check CHECK (status IN ('ASSIGNED', 'NOTICED', 'IN_EDIT', 'DONE', 'APPROVED', 'REJECTED'));
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_id UUID;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS creator_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS creator_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee_ids UUID[] NOT NULL DEFAULT '{}';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deadline_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reference_url TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurring_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurring_frequency TEXT CHECK (recurring_frequency IS NULL OR recurring_frequency IN ('DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM'));
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurring_config JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS needs_clarification BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS clarification_note TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS noticed_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

UPDATE tasks
SET status = 'ASSIGNED'
WHERE status = 'NOTICED' AND noticed_at IS NULL;

UPDATE tasks
SET deadline_at = COALESCE(deadline_at, due_date::timestamptz + time '23:59'),
    creator_id = COALESCE(creator_id, created_by),
    assignee_ids = CASE
      WHEN assignee_ids = '{}' THEN ARRAY[assigned_to]
      ELSE assignee_ids
    END
WHERE assigned_to IS NOT NULL;

CREATE TABLE IF NOT EXISTS task_assignees (
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  noticed_at TIMESTAMPTZ,
  PRIMARY KEY (task_id, user_id)
);

INSERT INTO task_assignees (task_id, user_id, noticed_at)
SELECT id, assigned_to, noticed_at
FROM tasks
WHERE assigned_to IS NOT NULL
ON CONFLICT (task_id, user_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS checklist_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT FALSE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  checklist TEXT[] NOT NULL DEFAULT '{}',
  section TEXT NOT NULL DEFAULT 'DAILY' CHECK (section IN ('IMMINENT', 'DAILY', 'WEEKLY', 'MONTHLY')),
  priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH')),
  reference_url TEXT,
  default_deadline TEXT NOT NULL DEFAULT 'SECTION_DEFAULT',
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  bonus_xp INTEGER NOT NULL DEFAULT 0,
  allow_multiple_accepts BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ACCEPTED', 'DONE', 'APPROVED', 'REJECTED')),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  deadline_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quest_acceptances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'ACCEPTED' CHECK (status IN ('ACCEPTED', 'DONE', 'APPROVED', 'REJECTED')),
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  UNIQUE (quest_id, user_id)
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  digest_assignments BOOLEAN NOT NULL DEFAULT TRUE,
  email_from TEXT NOT NULL DEFAULT 'tasks@safarixstudios.com',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO notification_preferences (user_id)
SELECT id FROM profiles
ON CONFLICT (user_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS board_access (
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  can_comment BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (board_id, user_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'assignment',
  'mention',
  'reminder',
  'result_submitted',
  'approved',
  'overdue',
  'comment',
  'rejected',
  'need_clarification',
  'notice_sla_missed'
));

CREATE INDEX IF NOT EXISTS idx_tasks_deadline_at ON tasks(deadline_at);
CREATE INDEX IF NOT EXISTS idx_tasks_deleted_at ON tasks(deleted_at);
CREATE INDEX IF NOT EXISTS idx_task_assignees_user_id ON task_assignees(user_id);
CREATE INDEX IF NOT EXISTS idx_checklist_items_task_id ON checklist_items(task_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE quest_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "departments_select" ON departments FOR SELECT TO authenticated USING (true);

CREATE POLICY "task_assignees_select" ON task_assignees FOR SELECT TO authenticated
  USING (task_id IN (SELECT id FROM tasks));
CREATE POLICY "task_assignees_insert" ON task_assignees FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR EXISTS (SELECT 1 FROM tasks WHERE id = task_id AND created_by = auth.uid())
  );

CREATE POLICY "checklist_items_select" ON checklist_items FOR SELECT TO authenticated
  USING (task_id IN (SELECT id FROM tasks));
CREATE POLICY "checklist_items_write" ON checklist_items FOR ALL TO authenticated
  USING (task_id IN (SELECT id FROM tasks WHERE created_by = auth.uid() OR assigned_to = auth.uid() OR auth.uid() = ANY(assignee_ids) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')))
  WITH CHECK (task_id IN (SELECT id FROM tasks WHERE created_by = auth.uid() OR assigned_to = auth.uid() OR auth.uid() = ANY(assignee_ids) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')));

CREATE POLICY "task_templates_select" ON task_templates FOR SELECT TO authenticated USING (deleted_at IS NULL);
CREATE POLICY "task_templates_admin_all" ON task_templates FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "quests_select" ON quests FOR SELECT TO authenticated USING (deleted_at IS NULL);
CREATE POLICY "quests_admin_all" ON quests FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "quest_acceptances_select" ON quest_acceptances FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "quest_acceptances_insert" ON quest_acceptances FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "quest_acceptances_update" ON quest_acceptances FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "notification_preferences_own" ON notification_preferences FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "board_access_admin" ON board_access FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "audit_logs_admin_select" ON audit_logs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "audit_logs_insert" ON audit_logs FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION award_xp(
  p_user_id UUID,
  p_amount INTEGER,
  p_reason TEXT,
  p_task_id UUID DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_new_xp INTEGER;
  v_new_level INTEGER;
BEGIN
  UPDATE profiles
  SET xp = GREATEST(0, xp + p_amount)
  WHERE id = p_user_id
  RETURNING xp INTO v_new_xp;

  v_new_level := FLOOR(v_new_xp / 100) + 1;

  UPDATE profiles
  SET level = v_new_level,
      rank = CASE
        WHEN v_new_level >= 50 THEN 'Safari Legend'
        WHEN v_new_level >= 35 THEN 'Elite'
        WHEN v_new_level >= 20 THEN 'High Performer'
        WHEN v_new_level >= 10 THEN 'Executor'
        WHEN v_new_level >= 5 THEN 'Reliable'
        ELSE 'Rookie'
      END
  WHERE id = p_user_id;

  INSERT INTO xp_log (user_id, amount, reason, task_id)
  VALUES (p_user_id, p_amount, p_reason, p_task_id);

  INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), CASE WHEN p_amount >= 0 THEN 'xp_awarded' ELSE 'xp_deducted' END, 'task', p_task_id, jsonb_build_object('user_id', p_user_id, 'amount', p_amount, 'reason', p_reason));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION audit_task_update()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata)
    VALUES (NEW.created_by, 'task_created', 'task', NEW.id, jsonb_build_object('title', NEW.title));
    RETURN NEW;
  END IF;

  IF OLD.title IS DISTINCT FROM NEW.title THEN
    INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata)
    VALUES (auth.uid(), 'title_changed', 'task', NEW.id, jsonb_build_object('from', OLD.title, 'to', NEW.title));
  END IF;
  IF OLD.description IS DISTINCT FROM NEW.description THEN
    INSERT INTO audit_logs (actor_id, action, entity_type, entity_id)
    VALUES (auth.uid(), 'description_changed', 'task', NEW.id);
  END IF;
  IF OLD.deadline_at IS DISTINCT FROM NEW.deadline_at THEN
    INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata)
    VALUES (auth.uid(), 'deadline_changed', 'task', NEW.id, jsonb_build_object('from', OLD.deadline_at, 'to', NEW.deadline_at));
  END IF;
  IF OLD.priority IS DISTINCT FROM NEW.priority THEN
    INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata)
    VALUES (auth.uid(), 'priority_changed', 'task', NEW.id, jsonb_build_object('from', OLD.priority, 'to', NEW.priority));
  END IF;
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata)
    VALUES (auth.uid(), 'status_changed', 'task', NEW.id, jsonb_build_object('from', OLD.status, 'to', NEW.status));
  END IF;
  IF OLD.deleted_at IS DISTINCT FROM NEW.deleted_at AND NEW.deleted_at IS NOT NULL THEN
    INSERT INTO audit_logs (actor_id, action, entity_type, entity_id)
    VALUES (auth.uid(), 'task_soft_deleted', 'task', NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS audit_task_changes ON tasks;
CREATE TRIGGER audit_task_changes
  AFTER INSERT OR UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION audit_task_update();

CREATE OR REPLACE FUNCTION prevent_employee_self_deadline_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.deadline_at IS DISTINCT FROM NEW.deadline_at
     AND auth.uid() = ANY(COALESCE(OLD.assignee_ids, ARRAY[OLD.assigned_to]))
     AND NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Employees cannot change their own assigned deadline';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS prevent_employee_deadline_update ON tasks;
CREATE TRIGGER prevent_employee_deadline_update
  BEFORE UPDATE OF deadline_at ON tasks
  FOR EACH ROW EXECUTE FUNCTION prevent_employee_self_deadline_change();

CREATE OR REPLACE FUNCTION notify_on_task_assign()
RETURNS TRIGGER AS $$
DECLARE
  recipient UUID;
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.assignee_ids IS DISTINCT FROM NEW.assignee_ids) THEN
    FOREACH recipient IN ARRAY COALESCE(NULLIF(NEW.assignee_ids, '{}'), ARRAY[NEW.assigned_to])
    LOOP
      IF recipient IS NOT NULL AND recipient != NEW.created_by THEN
        INSERT INTO notifications (user_id, type, message, task_id)
        VALUES (recipient, 'assignment', 'New task assigned: ' || NEW.title, NEW.id);
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS task_assignment_notification ON tasks;
CREATE TRIGGER task_assignment_notification
  AFTER INSERT OR UPDATE OF assignee_ids ON tasks
  FOR EACH ROW EXECUTE FUNCTION notify_on_task_assign();

CREATE OR REPLACE FUNCTION log_notice_sla_misses()
RETURNS INTEGER AS $$
DECLARE
  inserted_count INTEGER;
BEGIN
  INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata)
  SELECT NULL, 'notice_sla_missed', 'task', t.id, jsonb_build_object('assigned_at', t.created_at)
  FROM tasks t
  WHERE t.status = 'ASSIGNED'
    AND t.noticed_at IS NULL
    AND t.created_at < NOW() - INTERVAL '12 hours'
    AND NOT EXISTS (
      SELECT 1 FROM audit_logs a
      WHERE a.action = 'notice_sla_missed' AND a.entity_type = 'task' AND a.entity_id = t.id
    );

  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  INSERT INTO notifications (user_id, type, message, task_id)
  SELECT p.id, 'notice_sla_missed', 'Notice SLA missed: ' || t.title, t.id
  FROM tasks t
  CROSS JOIN profiles p
  WHERE p.role = 'admin'
    AND t.status = 'ASSIGNED'
    AND t.noticed_at IS NULL
    AND t.created_at < NOW() - INTERVAL '12 hours'
    AND EXISTS (
      SELECT 1 FROM audit_logs a
      WHERE a.action = 'notice_sla_missed' AND a.entity_type = 'task' AND a.entity_id = t.id
    );

  RETURN inserted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
