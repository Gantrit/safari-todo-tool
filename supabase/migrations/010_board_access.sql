-- 010: Enforce per-board access (board_access), seeded to avoid lockout
-- board_access already exists (from 004) but was never enforced. This seeds it
-- for every current (member x board) pair, lets each user read their OWN access
-- rows, then makes boards_select / tasks_select require a board_access row
-- (admins bypass). New boards / new members auto-grant access.
-- Run in the Supabase SQL editor after 009.

-- ============================================================
-- 1. Seed access for all existing member/board pairs (no one gets locked out)
-- ============================================================
INSERT INTO board_access (board_id, user_id, can_comment)
SELECT b.id, wm.user_id, TRUE
FROM boards b
JOIN workspace_members wm ON wm.workspace_id = b.workspace_id
ON CONFLICT (board_id, user_id) DO NOTHING;

-- ============================================================
-- 2. Auto-grant on new boards and new memberships
-- ============================================================
CREATE OR REPLACE FUNCTION seed_board_access()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO board_access (board_id, user_id, can_comment)
  SELECT NEW.id, wm.user_id, TRUE
  FROM workspace_members wm
  WHERE wm.workspace_id = NEW.workspace_id
  ON CONFLICT (board_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS seed_board_access_trigger ON boards;
CREATE TRIGGER seed_board_access_trigger
  AFTER INSERT ON boards
  FOR EACH ROW EXECUTE FUNCTION seed_board_access();

CREATE OR REPLACE FUNCTION seed_member_board_access()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO board_access (board_id, user_id, can_comment)
  SELECT b.id, NEW.user_id, TRUE
  FROM boards b
  WHERE b.workspace_id = NEW.workspace_id
  ON CONFLICT (board_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS seed_member_board_access_trigger ON workspace_members;
CREATE TRIGGER seed_member_board_access_trigger
  AFTER INSERT ON workspace_members
  FOR EACH ROW EXECUTE FUNCTION seed_member_board_access();

-- ============================================================
-- 3. Let users read their OWN access rows (required so the SELECT-policy
--    subqueries below aren't blocked by the admin-only board_access RLS).
-- ============================================================
DROP POLICY IF EXISTS "board_access_select_own" ON board_access;
CREATE POLICY "board_access_select_own" ON board_access FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_admin());

-- ============================================================
-- 4. Enforce access in the SELECT policies (admins bypass everything)
-- ============================================================
DROP POLICY IF EXISTS "boards_select" ON boards;
CREATE POLICY "boards_select" ON boards FOR SELECT TO authenticated
  USING (
    is_admin()
    OR (
      workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
      AND EXISTS (SELECT 1 FROM board_access ba WHERE ba.board_id = boards.id AND ba.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "tasks_select" ON tasks;
CREATE POLICY "tasks_select" ON tasks FOR SELECT TO authenticated
  USING (
    is_admin()
    OR created_by = auth.uid()
    OR assigned_to = auth.uid()
    OR auth.uid() = ANY(assignee_ids)
    OR board_id IN (SELECT ba.board_id FROM board_access ba WHERE ba.user_id = auth.uid())
    OR (board_id IS NULL AND (created_by = auth.uid() OR assigned_to = auth.uid()))
  );
