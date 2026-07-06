-- 016: Board access becomes opt-in, not opt-out.
-- 010 auto-granted every member access to every board on join (to avoid
-- lockout when the feature was first turned on). That means "Manage access"
-- in Settings only ever revoked access, never actually gated a new member's
-- first login the way the product wants: new member registers, has zero
-- board access, and waits for an admin to grant it per board.
--
-- This drops both auto-grant triggers/functions from 010, then clears any
-- board_access rows that were auto-seeded rather than explicitly chosen by
-- an admin, so members added since 010 start clean under the new model.
-- Admins are unaffected (boards_select/tasks_select already bypass via
-- is_admin()), and any access an admin re-grants afterward in Settings is
-- unaffected by this being a one-time cleanup.
--
-- Run in the Supabase SQL editor after 015.

DROP TRIGGER IF EXISTS seed_board_access_trigger ON boards;
DROP TRIGGER IF EXISTS seed_member_board_access_trigger ON workspace_members;
DROP FUNCTION IF EXISTS seed_board_access();
DROP FUNCTION IF EXISTS seed_member_board_access();

-- Clear auto-seeded access for non-admin members so they start at zero.
-- (If an admin has already deliberately re-toggled access for someone since
-- then, this still clears it — re-grant it once more in Settings after
-- running this, since there is no way to distinguish "auto-seeded" from
-- "admin re-confirmed" rows after the fact.)
DELETE FROM board_access ba
USING profiles p
WHERE ba.user_id = p.id
  AND p.role NOT IN ('admin');
