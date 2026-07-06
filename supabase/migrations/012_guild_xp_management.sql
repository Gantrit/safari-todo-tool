-- 012: Guild Hall — admin XP management + time-ranged leaderboards
-- Adds:
--   * admin-only SELECT on xp_log (guild view needs other members' history)
--   * admin_adjust_xp() RPC — manual XP corrections with reason + audit + notification
--   * xp_leaderboard(p_since) RPC — weekly/monthly leaderboards from xp_log
--   * 'xp_adjusted' notification type
-- Run in the Supabase SQL editor after 011.

-- ============================================================
-- 1. Admins may read every member's XP history
-- ============================================================
DROP POLICY IF EXISTS "xp_log_select_admin" ON xp_log;
CREATE POLICY "xp_log_select_admin" ON xp_log FOR SELECT TO authenticated
  USING (is_admin());

-- ============================================================
-- 2. Notification type for manual adjustments
-- ============================================================
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'assignment',
  'mention',
  'reminder',
  'result_submitted',
  'approved',
  'overdue',
  'comment',
  'rejected',
  'need_clarification',
  'notice_sla_missed',
  'xp_adjusted'
));

-- ============================================================
-- 3. Manual XP adjustment (admin only, always with a reason)
-- ============================================================
CREATE OR REPLACE FUNCTION admin_adjust_xp(p_user_id UUID, p_amount INTEGER, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new_xp INTEGER;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only admins can adjust XP';
  END IF;
  IF p_amount = 0 OR p_amount IS NULL THEN
    RAISE EXCEPTION 'Adjustment amount must be non-zero';
  END IF;
  IF ABS(p_amount) > 1000 THEN
    RAISE EXCEPTION 'Adjustment amount is capped at ±1000 XP per action';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'A reason (min 3 characters) is required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- award_xp updates profiles.xp/level/rank, writes xp_log + audit_logs
  PERFORM award_xp(p_user_id, p_amount, 'Manual adjustment: ' || trim(p_reason), NULL);

  INSERT INTO notifications (user_id, type, message, task_id)
  VALUES (
    p_user_id,
    'xp_adjusted',
    format('XP %s by an admin: %s%s XP (%s)',
           CASE WHEN p_amount > 0 THEN 'awarded' ELSE 'deducted' END,
           CASE WHEN p_amount > 0 THEN '+' ELSE '' END,
           p_amount, trim(p_reason)),
    NULL
  );

  SELECT xp INTO v_new_xp FROM profiles WHERE id = p_user_id;
  RETURN jsonb_build_object('user_id', p_user_id, 'amount', p_amount, 'new_xp', v_new_xp);
END;
$$;
GRANT EXECUTE ON FUNCTION admin_adjust_xp(UUID, INTEGER, TEXT) TO authenticated;

-- ============================================================
-- 4. Time-ranged leaderboard (weekly/monthly) from xp_log.
--    SECURITY DEFINER so members can see aggregate totals without
--    opening raw xp_log rows of others.
-- ============================================================
CREATE OR REPLACE FUNCTION xp_leaderboard(p_since TIMESTAMPTZ)
RETURNS TABLE(user_id UUID, total BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT x.user_id, SUM(x.amount)::BIGINT AS total
  FROM xp_log x
  JOIN profiles p ON p.id = x.user_id
  WHERE x.created_at >= p_since
    AND p.deactivated_at IS NULL
  GROUP BY x.user_id
  ORDER BY total DESC;
$$;
GRANT EXECUTE ON FUNCTION xp_leaderboard(TIMESTAMPTZ) TO authenticated;
