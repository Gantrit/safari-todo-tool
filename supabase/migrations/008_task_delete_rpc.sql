-- 008: Server-side task deletion
-- Adds a soft-delete RPC so tasks can be removed from the board with the
-- correct rights, without loosening the tasks_update RLS policy.
--   * A task's creator may delete it.
--   * An admin may delete any task.
-- Uses the existing role model (profiles.role = 'admin' via is_admin()); does
-- NOT introduce a parallel role system.
-- Soft delete = set deleted_at; the existing audit trigger logs 'task_deleted'
-- and all board/list queries already filter on deleted_at IS NULL.
-- Run in the Supabase SQL editor after 007.

CREATE OR REPLACE FUNCTION soft_delete_task(p_task_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_task tasks%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_task FROM tasks WHERE id = p_task_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found';
  END IF;

  IF v_task.deleted_at IS NOT NULL THEN
    RETURN v_task.id;
  END IF;

  IF NOT (v_task.created_by = auth.uid() OR v_task.creator_id = auth.uid() OR is_admin()) THEN
    RAISE EXCEPTION 'You do not have permission to delete this task';
  END IF;

  UPDATE tasks
    SET deleted_at = NOW(),
        updated_at = NOW()
    WHERE id = p_task_id;

  RETURN p_task_id;
END;
$$;

REVOKE ALL ON FUNCTION soft_delete_task(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION soft_delete_task(UUID) TO authenticated;
