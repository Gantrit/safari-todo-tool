-- 011: Board deletion preserves tasks (soft delete instead of cascade hard-delete)
-- Problem: tasks.board_id had ON DELETE CASCADE, so deleting a board permanently
-- destroyed every task on it — bypassing the soft-delete requirement and the audit
-- log. This migration:
--   1. Relaxes the tasks.board_id FK to ON DELETE SET NULL so task rows survive a
--      board deletion instead of being cascade-erased.
--   2. Adds soft_delete_board(): admin-only. Soft-deletes the board's live tasks
--      first (sets deleted_at, so the existing audit trigger records each removal
--      and the rows stay admin-recoverable), then removes the board row.
-- Run in the Supabase SQL editor after 010.

-- ============================================================
-- 1. Relax the FK: board deletion no longer cascade-deletes tasks
-- ============================================================
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_board_id_fkey;
ALTER TABLE tasks ADD CONSTRAINT tasks_board_id_fkey
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE SET NULL;

-- ============================================================
-- 2. Admin-only board soft-delete RPC
-- ============================================================
CREATE OR REPLACE FUNCTION soft_delete_board(p_board_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only admins can delete boards';
  END IF;

  -- Soft-delete the board's remaining live tasks so they stay recoverable and
  -- the audit trigger records each removal.
  UPDATE tasks
    SET deleted_at = NOW(),
        updated_at = NOW()
    WHERE board_id = p_board_id AND deleted_at IS NULL;

  -- Remove the board itself. The relaxed FK (step 1) sets the tasks' board_id to
  -- NULL rather than cascade-deleting the now soft-deleted rows.
  DELETE FROM boards WHERE id = p_board_id;

  RETURN p_board_id;
END;
$$;

REVOKE ALL ON FUNCTION soft_delete_board(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION soft_delete_board(UUID) TO authenticated;
