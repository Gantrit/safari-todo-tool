-- Award XP function
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
  SET xp = xp + p_amount
  WHERE id = p_user_id
  RETURNING xp INTO v_new_xp;

  -- Calculate new level
  v_new_level := CASE
    WHEN v_new_xp >= 1000 THEN 5
    WHEN v_new_xp >= 500  THEN 4
    WHEN v_new_xp >= 250  THEN 3
    WHEN v_new_xp >= 100  THEN 2
    ELSE 1
  END;

  UPDATE profiles SET level = v_new_level WHERE id = p_user_id;

  -- Log the XP change
  INSERT INTO xp_log (user_id, amount, reason, task_id)
  VALUES (p_user_id, p_amount, p_reason, p_task_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create notification function
CREATE OR REPLACE FUNCTION create_notification(
  p_user_id UUID,
  p_type TEXT,
  p_message TEXT,
  p_task_id UUID DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO notifications (user_id, type, message, task_id)
  VALUES (p_user_id, p_type, p_message, p_task_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: notify on task assignment
CREATE OR REPLACE FUNCTION notify_on_task_assign()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) THEN
    IF NEW.assigned_to != NEW.created_by THEN
      INSERT INTO notifications (user_id, type, message, task_id)
      VALUES (
        NEW.assigned_to,
        'assignment',
        'You have been assigned a new task: ' || NEW.title,
        NEW.id
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER task_assignment_notification
  AFTER INSERT OR UPDATE OF assigned_to ON tasks
  FOR EACH ROW EXECUTE FUNCTION notify_on_task_assign();

-- Trigger: notify admins when result submitted
CREATE OR REPLACE FUNCTION notify_on_result_submit()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.result_url IS NULL AND NEW.result_url IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, message, task_id)
    SELECT p.id, 'result_submitted', 'Result submitted for: ' || NEW.title, NEW.id
    FROM profiles p WHERE p.role = 'admin';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER task_result_notification
  AFTER UPDATE OF result_url ON tasks
  FOR EACH ROW EXECUTE FUNCTION notify_on_result_submit();

-- Trigger: deduct XP on missed deadline (called manually via cron or Edge Function)
-- XP penalties are applied via the award_xp function with negative amounts

-- Seed function for demo data (optional)
CREATE OR REPLACE FUNCTION seed_demo_workspace(p_admin_id UUID)
RETURNS UUID AS $$
DECLARE
  v_workspace_id UUID;
  v_board_id UUID;
BEGIN
  INSERT INTO workspaces (name, created_by)
  VALUES ('Safari Team', p_admin_id)
  RETURNING id INTO v_workspace_id;

  INSERT INTO workspace_members (workspace_id, user_id, role)
  VALUES (v_workspace_id, p_admin_id, 'admin');

  INSERT INTO boards (workspace_id, name, type)
  VALUES (v_workspace_id, 'Backend', 'kanban')
  RETURNING id INTO v_board_id;

  INSERT INTO boards (workspace_id, name, type)
  VALUES (v_workspace_id, 'Traffic', 'kanban');

  RETURN v_workspace_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
