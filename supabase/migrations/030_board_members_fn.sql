-- 030_board_members_fn.sql
--
-- Board columns must only show members who actually have access to THAT board
-- (board_access), not every workspace member. Since migration 028 auto-enrolls
-- every account into workspace_members, the board page — which listed all
-- workspace_members — started showing everyone as a column on every board, even
-- people an admin never granted access to.
--
-- We can't just query board_access from the client: RLS (migration 010) only
-- lets a non-admin read their OWN board_access row, so a member/manager viewing
-- the board would see only themselves. And a self-referential board_access
-- policy would recurse. So expose a SECURITY DEFINER function that returns the
-- profiles with access to a board, gated to callers who may see that board
-- (admins, or members who have access themselves).
--
-- Run in the Supabase SQL editor after 029.

CREATE OR REPLACE FUNCTION board_members(p_board_id UUID)
RETURNS SETOF profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
BEGIN
  -- Only reveal the roster to admins or to members who have access to this board.
  IF NOT (
    is_admin()
    OR EXISTS (SELECT 1 FROM board_access WHERE board_id = p_board_id AND user_id = auth.uid())
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT p.*
    FROM profiles p
    JOIN board_access ba ON ba.user_id = p.id
    WHERE ba.board_id = p_board_id;
END;
$$;
GRANT EXECUTE ON FUNCTION board_members(UUID) TO authenticated;
