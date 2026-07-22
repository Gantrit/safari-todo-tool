-- 045_drop_in_edit_status.sql
--
-- Remove the IN_EDIT status (Tan, 2026-07-22). The intermediate "in edit" step
-- was one click of friction with no payoff: an assignee opened a task, had to
-- move it to IN_EDIT, then to DONE. New flow is just:
--
--   ASSIGNED → DONE → APPROVED   (+ REJECTED; admin reopen → ASSIGNED)
--
-- The member picks up an assigned task, does it, and submits it straight to DONE
-- for approval. One step, not two.
--
-- IN_EDIT also carried the 12h "noticed" SLA (stamped when a task first entered
-- IN_EDIT). That SLA logger (log_notice_sla_misses, 004/007) is not wired to any
-- schedule and is effectively retired; without an acknowledge step there is
-- nothing to stamp, so noticed_at simply stops being set. Nothing reads it on a
-- schedule, so this is inert.
--
-- Run in the Supabase SQL editor AFTER 044_recurring_on_schedule.sql.

BEGIN;

-- 1. Existing IN_EDIT tasks become ASSIGNED again — they are work-in-progress
--    that hasn't been submitted, which is exactly what ASSIGNED now means.
UPDATE tasks SET status = 'ASSIGNED' WHERE status = 'IN_EDIT';

-- 2. Drop IN_EDIT from the allowed status set.
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('ASSIGNED', 'DONE', 'APPROVED', 'REJECTED'));

-- 3. New transition rules (replaces the 031 version, minus IN_EDIT).
CREATE OR REPLACE FUNCTION enforce_task_status_transitions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_can_manage BOOLEAN;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')) INTO v_can_manage;

  -- Admins and managers may perform any transition.
  IF v_can_manage THEN
    RETURN NEW;
  END IF;

  -- Private tasks (no board) are unrestricted for their owner.
  IF OLD.board_id IS NULL AND OLD.created_by = auth.uid() THEN
    RETURN NEW;
  END IF;

  -- Members/viewers may never set APPROVED or REJECTED.
  IF NEW.status IN ('APPROVED', 'REJECTED') THEN
    RAISE EXCEPTION 'Only admins or managers can set a task to %', NEW.status;
  END IF;

  -- Members/viewers cannot move a task out of APPROVED.
  IF OLD.status = 'APPROVED' THEN
    RAISE EXCEPTION 'Only admins or managers can reopen an approved task';
  END IF;

  -- Allowed transitions for assignees/creators: submit, and one step back to undo
  -- an accidental submit. A rejection stays final for the member (migration 041).
  IF NOT (
    (OLD.status = 'ASSIGNED' AND NEW.status = 'DONE') OR
    (OLD.status = 'DONE' AND NEW.status = 'ASSIGNED')
  ) THEN
    RAISE EXCEPTION 'Transition % -> % is not allowed', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Admin reopen now lands on ASSIGNED (there is no IN_EDIT to land on).
CREATE OR REPLACE FUNCTION reopen_task(p_task_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_task tasks%ROWTYPE;
  v_assignees UUID[];
  v_is_admin BOOLEAN;
BEGIN
  IF NOT can_manage() THEN
    RAISE EXCEPTION 'Only admins or managers can reopen tasks';
  END IF;

  SELECT * INTO v_task FROM tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Task not found'; END IF;

  v_assignees := COALESCE(NULLIF(v_task.assignee_ids, '{}'), ARRAY[v_task.assigned_to]);

  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') INTO v_is_admin;
  IF NOT v_is_admin THEN
    IF auth.uid() = ANY(v_assignees) THEN
      RAISE EXCEPTION 'Managers cannot reopen their own tasks — ask an admin';
    END IF;
    IF EXISTS (SELECT 1 FROM profiles WHERE id = ANY(v_assignees) AND role <> 'employee') THEN
      RAISE EXCEPTION 'Managers can only reopen tasks assigned to members';
    END IF;
  END IF;

  UPDATE tasks
  SET status = 'ASSIGNED', approved_at = NULL, rejected_at = NULL
  WHERE id = p_task_id;
END;
$$;
GRANT EXECUTE ON FUNCTION reopen_task(UUID) TO authenticated;

COMMIT;
