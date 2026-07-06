-- 014: Collapse to a single organization (one workspace, many boards)
-- The app accidentally ended up with two workspaces ("Backend" + "Safari"),
-- each holding one board. Per the product model there is ONE org and boards
-- are the departments. This merges every workspace into the oldest one, moves
-- its boards + members across, then removes the now-empty duplicates.
--
-- Only `boards` and `workspace_members` reference workspace_id; tasks hang off
-- board_id and board_access off board_id, so they follow their boards untouched.
--
-- Idempotent: running it again with a single workspace is a no-op.
-- Run in the Supabase SQL editor after 013.

DO $$
DECLARE
  v_keep UUID;
BEGIN
  -- Canonical workspace = the oldest one.
  SELECT id INTO v_keep FROM workspaces ORDER BY created_at, id LIMIT 1;
  IF v_keep IS NULL THEN
    RETURN; -- nothing to do
  END IF;

  -- Move all boards from other workspaces into the canonical one.
  UPDATE boards SET workspace_id = v_keep WHERE workspace_id <> v_keep;

  -- Members that already exist in the canonical workspace: drop the duplicate
  -- rows from the other workspaces (PK is (workspace_id, user_id)).
  DELETE FROM workspace_members wm
  WHERE wm.workspace_id <> v_keep
    AND EXISTS (
      SELECT 1 FROM workspace_members k
      WHERE k.workspace_id = v_keep AND k.user_id = wm.user_id
    );

  -- Remaining members only existed in another workspace: move them across.
  UPDATE workspace_members SET workspace_id = v_keep WHERE workspace_id <> v_keep;

  -- Remove the emptied duplicate workspaces (no boards/members left on them).
  DELETE FROM workspaces WHERE id <> v_keep;

  -- Give the surviving org a neutral name (a board is the department, not this).
  UPDATE workspaces SET name = 'Safari Studios' WHERE id = v_keep;
END $$;
