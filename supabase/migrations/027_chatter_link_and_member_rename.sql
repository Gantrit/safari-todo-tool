-- 027 — Link shift reports to member profiles + let admins rename members.
--
-- Part 1: shift_reports gains an OPTIONAL chatter_id. Internal chatters pick
-- themselves from a member dropdown → we store the stable profile id so the
-- /reports filter groups by identity, not by typed spelling ("Lloyd" vs "Loyd").
-- External chatters with NO account keep working: chatter_id stays NULL and the
-- free-text chatter_name is used. chatter_name remains the display snapshot in
-- both cases (a renamed / deleted member never blanks old reports).
--
-- Part 2: admins can correct a member's display name from Settings → Members.

-- ── Part 1 ────────────────────────────────────────────────────────────────
ALTER TABLE shift_reports
  ADD COLUMN IF NOT EXISTS chatter_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS shift_reports_chatter_id_idx
  ON shift_reports (chatter_id, shift_date DESC);

-- ── Part 2 ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_member_name(p_user_id UUID, p_name TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name TEXT := btrim(p_name);
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only admins can rename members';
  END IF;
  IF v_name IS NULL OR length(v_name) = 0 THEN
    RAISE EXCEPTION 'Name cannot be empty';
  END IF;
  IF length(v_name) > 80 THEN
    RAISE EXCEPTION 'Name is too long';
  END IF;

  UPDATE profiles SET full_name = v_name WHERE id = p_user_id;
END;
$$;
GRANT EXECUTE ON FUNCTION set_member_name(UUID, TEXT) TO authenticated;
