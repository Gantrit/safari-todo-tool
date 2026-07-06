-- 015: Allow admins to rename boards (UPDATE policy was missing entirely —
-- boards_insert/boards_delete existed from 002/009, but no boards_update,
-- so RLS silently denied every rename attempt).

DROP POLICY IF EXISTS "boards_update" ON boards;
CREATE POLICY "boards_update" ON boards FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
