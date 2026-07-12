-- ============================================================
-- 031 — Simplify the status flow: drop NOTICED
-- ============================================================
-- User decision 2026-07-12: the extra NOTICED click is redundant — once you've
-- seen a task you should be working on it. New flow:
--
--   ASSIGNED → IN_EDIT → DONE → APPROVED (+ REJECTED, reopen)
--
-- The 12h notice SLA stays: `noticed_at` is now stamped when the assignee first
-- moves the task to IN_EDIT (the trigger does it server-side, so every client
-- path is covered). The SLA checker in 004/007 only reads `noticed_at`, so it
-- keeps working unchanged.
--
-- Also new: assignees may step BACK one status (IN_EDIT → ASSIGNED, and the
-- already-allowed DONE → IN_EDIT) to undo an accidental click.
--
-- Run in the Supabase SQL editor AFTER 030_board_members_fn.sql.

BEGIN;

-- 1. Migrate existing NOTICED tasks to IN_EDIT (keep their noticed_at).
UPDATE tasks
SET status = 'IN_EDIT',
    noticed_at = COALESCE(noticed_at, NOW())
WHERE status = 'NOTICED';

-- 2. Remove NOTICED from the status CHECK.
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('ASSIGNED', 'IN_EDIT', 'DONE', 'APPROVED', 'REJECTED'));

-- 3. New transition rules (replaces the 009 version).
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

  -- First move into IN_EDIT counts as "noticed" for the 12h SLA.
  IF OLD.status = 'ASSIGNED' AND NEW.status = 'IN_EDIT' AND NEW.noticed_at IS NULL THEN
    NEW.noticed_at := NOW();
  END IF;

  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')) INTO v_can_manage;

  -- Admins and managers may perform any transition
  IF v_can_manage THEN
    RETURN NEW;
  END IF;

  -- Private tasks (no board) are unrestricted for their owner
  IF OLD.board_id IS NULL AND OLD.created_by = auth.uid() THEN
    RETURN NEW;
  END IF;

  -- Members/viewers may never set APPROVED or REJECTED
  IF NEW.status IN ('APPROVED', 'REJECTED') THEN
    RAISE EXCEPTION 'Only admins or managers can set a task to %', NEW.status;
  END IF;

  -- Members/viewers cannot move a task out of APPROVED
  IF OLD.status = 'APPROVED' THEN
    RAISE EXCEPTION 'Only admins or managers can reopen an approved task';
  END IF;

  -- Allowed transitions for assignees/creators (forward + one step back)
  IF NOT (
    (OLD.status = 'ASSIGNED' AND NEW.status = 'IN_EDIT') OR
    (OLD.status = 'IN_EDIT' AND NEW.status = 'DONE') OR
    (OLD.status = 'IN_EDIT' AND NEW.status = 'ASSIGNED') OR
    (OLD.status = 'DONE' AND NEW.status = 'IN_EDIT') OR
    (OLD.status = 'REJECTED' AND NEW.status = 'IN_EDIT')
  ) THEN
    RAISE EXCEPTION 'Transition % -> % is not allowed', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
