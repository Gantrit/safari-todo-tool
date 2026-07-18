-- 037_notify_on_submit_for_approval.sql
--
-- Bug (Tan, 2026-07-18): admins/managers never got an in-app notification when a
-- teammate finished work and it needed approval — only shift-report notifications
-- showed up. Root cause: the ONLY "submitted for review" trigger was
-- notify_on_result_submit (migration 003), which fires on tasks.result_url going
-- from NULL -> not-null. But the current status flow (ASSIGNED -> IN_EDIT -> DONE
-- -> APPROVED) marks a task done by setting status = 'DONE' (+ completed_at) and
-- NEVER touches result_url, so that trigger never fired.
--
-- This adds a trigger on status: when a task enters DONE, notify the people who
-- can actually approve it:
--   * every active admin (admins can approve any task), and
--   * active managers, but only when the task's assignee is a plain member
--     (matches the approval hierarchy from migration 035 — a manager cannot
--     approve their own / another manager's / an admin's task, so pinging them
--     about it would be noise).
-- The submitter is never notified about their own submission.
--
-- Uses the existing 'result_submitted' notification type (allowed since 024) so
-- no CHECK-constraint change is needed, and the email webhook (021) picks it up
-- automatically. Run in the Supabase SQL editor AFTER 036.

BEGIN;

CREATE OR REPLACE FUNCTION notify_on_submit_for_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_assignee_is_member BOOLEAN;
BEGIN
  IF NEW.status = 'DONE' AND OLD.status IS DISTINCT FROM 'DONE' THEN
    -- Is any assignee a plain member (not admin/manager)? Managers are only
    -- pinged for member work they're allowed to approve.
    SELECT EXISTS (
      SELECT 1 FROM profiles
      WHERE id = ANY (COALESCE(NULLIF(NEW.assignee_ids, '{}'), ARRAY[NEW.assigned_to]))
        AND role NOT IN ('admin', 'manager')
    ) INTO v_assignee_is_member;

    INSERT INTO notifications (user_id, type, message, task_id)
    SELECT p.id, 'result_submitted',
           'Ready for review: ' || COALESCE(NULLIF(NEW.title, ''), 'a task'), NEW.id
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

DROP TRIGGER IF EXISTS task_submit_for_approval_notification ON tasks;
CREATE TRIGGER task_submit_for_approval_notification
  AFTER UPDATE OF status ON tasks
  FOR EACH ROW EXECUTE FUNCTION notify_on_submit_for_approval();

COMMIT;
