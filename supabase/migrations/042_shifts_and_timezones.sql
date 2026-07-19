-- 042_shifts_and_timezones.sql
--
-- Problem (Tan, 2026-07-20): recurring LOGIN/LOGOUT tasks were "overdue" while the
-- member was still on shift. Two root causes:
--   1. Deadlines were computed in Europe/Berlin, but the workers are in Manila
--      (and some elsewhere) — the whole clock reference was wrong.
--   2. LOGIN/LOGOUT had no real cutoff: assign_template fell back to
--      "created_at + 1 period", an arbitrary time unrelated to the shift.
--
-- Fix = two layers:
--   A. Per-user timezone (profiles.timezone) so every time is DISPLAYED in the
--      viewer's own clock (Berlin admin sets "18:00", a Manila worker sees it as
--      the right local time). Display-only — "overdue" stays an absolute check.
--   B. Shifts: Safari runs 3 fixed 8h shifts defined in Manila time. Each member
--      is assigned a shift; LOGIN is due at the shift start, LOGOUT at the shift
--      end (Manila-anchored, midnight-crossing aware). Because Manila has no DST,
--      the existing recurring respawn (old deadline + 1 period) keeps the same
--      wall-clock forever — so only assign_template + a one-time backfill change.
--
-- The per-member shift assignment, template anchors and the backfill of existing
-- tasks are applied separately against production (they are tenant data, not
-- schema). Run in the Supabase SQL editor AFTER 041.

BEGIN;

-- ============================================================
-- A. Per-user timezone
-- ============================================================
-- IANA name. Default Asia/Manila (the workforce); the Berlin admin picks Europe/
-- Berlin in Account settings. User-editable (NOT a protected column) — everyone
-- may set their own; it only affects how times are shown to them.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Asia/Manila';

-- ============================================================
-- B. Shifts
-- ============================================================
CREATE TABLE IF NOT EXISTS shifts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  start_local TIME NOT NULL,
  end_local   TIME NOT NULL,               -- end_local <= start_local => crosses midnight
  timezone    TEXT NOT NULL DEFAULT 'Asia/Manila',
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shifts_select" ON shifts;
CREATE POLICY "shifts_select" ON shifts FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "shifts_write" ON shifts;
CREATE POLICY "shifts_write" ON shifts FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- Seed the three standard shifts (Manila). Idempotent by name.
INSERT INTO shifts (name, start_local, end_local, timezone, position)
SELECT * FROM (VALUES
  ('Shift 1', TIME '06:00', TIME '14:00', 'Asia/Manila', 0),
  ('Shift 2', TIME '14:00', TIME '22:00', 'Asia/Manila', 1),
  ('Shift 3', TIME '22:00', TIME '06:00', 'Asia/Manila', 2)
) AS v(name, start_local, end_local, timezone, position)
WHERE NOT EXISTS (SELECT 1 FROM shifts s WHERE s.name = v.name);

-- Which shift a member works. Admin-assigned (see set_member_shift below), so it
-- is a protected profile column — a member can't reassign their own deadlines.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES shifts(id) ON DELETE SET NULL;

-- Optional anchor for a template item: 'start' => due at shift start (LOGIN),
-- 'end' => due at shift end (LOGOUT). NULL keeps the due_time / period behaviour.
ALTER TABLE template_items ADD COLUMN IF NOT EXISTS shift_anchor TEXT
  CHECK (shift_anchor IN ('start', 'end'));

-- ============================================================
-- next_shift_boundary — the next absolute instant a shift boundary occurs
-- at or after p_from, in the shift's own timezone (midnight-crossing safe).
-- ============================================================
CREATE OR REPLACE FUNCTION next_shift_boundary(p_shift_id UUID, p_anchor TEXT, p_from TIMESTAMPTZ DEFAULT NOW())
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  s shifts%ROWTYPE;
  v_time TIME;
  v_day DATE;
  v_cand TIMESTAMPTZ;
BEGIN
  SELECT * INTO s FROM shifts WHERE id = p_shift_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_time := CASE p_anchor WHEN 'start' THEN s.start_local ELSE s.end_local END;
  v_day  := (p_from AT TIME ZONE s.timezone)::date;
  -- Interpret the wall-clock (day + time) in the shift's timezone as an instant.
  v_cand := ((v_day + v_time) AT TIME ZONE s.timezone);
  IF v_cand <= p_from THEN
    v_cand := (((v_day + 1) + v_time) AT TIME ZONE s.timezone);
  END IF;
  RETURN v_cand;
END;
$$;
GRANT EXECUTE ON FUNCTION next_shift_boundary(UUID, TEXT, TIMESTAMPTZ) TO authenticated;

-- ============================================================
-- set_member_shift — admin-only assignment of a member's shift
-- ============================================================
CREATE OR REPLACE FUNCTION set_member_shift(p_user_id UUID, p_shift_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only admins can assign shifts';
  END IF;
  IF p_shift_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM shifts WHERE id = p_shift_id) THEN
    RAISE EXCEPTION 'Shift not found';
  END IF;
  UPDATE profiles SET shift_id = p_shift_id WHERE id = p_user_id;
END;
$$;
GRANT EXECUTE ON FUNCTION set_member_shift(UUID, UUID) TO authenticated;

-- ============================================================
-- Protect shift_id from direct client writes (mirrors migration 034/041).
-- timezone is intentionally NOT protected — it is a personal display choice.
-- ============================================================
CREATE OR REPLACE FUNCTION protect_profile_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF NEW.role             IS DISTINCT FROM OLD.role
     OR NEW.xp               IS DISTINCT FROM OLD.xp
     OR NEW.level            IS DISTINCT FROM OLD.level
     OR NEW.streak_days      IS DISTINCT FROM OLD.streak_days
     OR NEW.streak_broken_at IS DISTINCT FROM OLD.streak_broken_at
     OR NEW.shift_id         IS DISTINCT FROM OLD.shift_id
     OR NEW.deactivated_at   IS DISTINCT FROM OLD.deactivated_at THEN
    RAISE EXCEPTION 'Protected profile columns (role, xp, level, streak_days, streak_broken_at, shift_id, deactivated_at) can only be changed through admin functions';
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- assign_template — shift-anchored deadlines (body from 036 + the anchor branch)
-- ============================================================
CREATE OR REPLACE FUNCTION assign_template(p_template_id UUID, p_board_id UUID, p_assignee UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item template_items%ROWTYPE;
  v_task_id UUID;
  v_deadline TIMESTAMPTZ;
  v_due_date DATE;
  v_target_date DATE;
  v_count INTEGER := 0;
  v_cl TEXT;
  v_pos INTEGER;
  v_shift_id UUID;
  v_tz TEXT;
BEGIN
  IF NOT can_manage() THEN
    RAISE EXCEPTION 'Only admins or managers can assign templates';
  END IF;

  IF NOT (
    EXISTS (SELECT 1 FROM board_access WHERE board_id = p_board_id AND user_id = p_assignee)
    OR EXISTS (SELECT 1 FROM profiles WHERE id = p_assignee AND role = 'admin')
  ) THEN
    RAISE EXCEPTION 'That member has no access to the selected board — grant board access first, or pick the board they belong to';
  END IF;

  SELECT shift_id, timezone INTO v_shift_id, v_tz FROM profiles WHERE id = p_assignee;
  v_tz := COALESCE(v_tz, 'Asia/Manila');

  FOR v_item IN SELECT * FROM template_items WHERE template_id = p_template_id ORDER BY position, created_at LOOP
    IF v_item.shift_anchor IS NOT NULL AND v_shift_id IS NOT NULL THEN
      -- Shift-anchored: due at the assignee's next shift start/end (Manila-anchored).
      v_deadline := next_shift_boundary(v_shift_id, v_item.shift_anchor, NOW());
      -- Weekly/monthly shift-anchored items roll forward to the right period.
      IF v_item.section = 'WEEKLY' THEN
        v_deadline := v_deadline + INTERVAL '6 days';
      ELSIF v_item.section = 'MONTHLY' THEN
        v_deadline := v_deadline + INTERVAL '1 month' - INTERVAL '1 day';
      END IF;
    ELSIF v_item.due_time IS NOT NULL THEN
      -- Wall-clock cutoff. Interpreted in the assignee's own timezone now, not Berlin.
      v_target_date := (NOW() AT TIME ZONE v_tz)::date;
      IF v_item.section = 'WEEKLY' THEN
        v_target_date := v_target_date + 7;
      ELSIF v_item.section = 'MONTHLY' THEN
        v_target_date := (v_target_date + INTERVAL '1 month')::date;
      END IF;
      v_deadline := ((v_target_date + v_item.due_time) AT TIME ZONE v_tz);
      IF v_item.section = 'DAILY' AND v_deadline <= NOW() THEN
        v_deadline := v_deadline + INTERVAL '1 day';
      END IF;
    ELSE
      v_deadline := CASE v_item.section
        WHEN 'DAILY' THEN NOW() + INTERVAL '1 day'
        WHEN 'WEEKLY' THEN NOW() + INTERVAL '7 days'
        ELSE NOW() + INTERVAL '1 month'
      END;
    END IF;

    -- Store the calendar day in the assignee's timezone so due_date matches.
    v_due_date := (v_deadline AT TIME ZONE v_tz)::date;

    INSERT INTO tasks (board_id, assigned_to, assignee_ids, created_by, creator_id, title, description,
                       priority, status, section, due_date, deadline_at, remind_3d, remind_24h,
                       xp_awarded, position, reference_url, google_drive_url,
                       recurring_enabled, recurring_frequency, labels,
                       template_id, template_item_id)
    VALUES (p_board_id, p_assignee, ARRAY[p_assignee], auth.uid(), auth.uid(), v_item.title, v_item.description,
            v_item.priority, 'ASSIGNED', v_item.section, v_due_date, v_deadline, FALSE, FALSE,
            FALSE, v_count, v_item.reference_url, v_item.reference_url,
            TRUE, v_item.section, '{}',
            p_template_id, v_item.id)
    RETURNING id INTO v_task_id;

    v_pos := 0;
    FOREACH v_cl IN ARRAY COALESCE(v_item.checklist, '{}') LOOP
      INSERT INTO checklist_items (task_id, title, position, done) VALUES (v_task_id, v_cl, v_pos, FALSE);
      v_pos := v_pos + 1;
    END LOOP;

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('created', v_count);
END;
$$;
GRANT EXECUTE ON FUNCTION assign_template(UUID, UUID, UUID) TO authenticated;

-- ============================================================
-- One-time PRODUCTION wiring (safe no-ops on a fresh DB — matched by name/email)
-- ============================================================
-- The Berlin admin keeps Berlin time; everyone else defaults to Asia/Manila.
UPDATE profiles SET timezone = 'Europe/Berlin' WHERE lower(email) = 'info@safarixstudios.com';

-- Assign the eight chatters to their shifts.
UPDATE profiles p SET shift_id = s.id FROM shifts s
  WHERE s.name = 'Shift 1' AND lower(p.full_name) IN ('aj', 'faye vender', 'jc');
UPDATE profiles p SET shift_id = s.id FROM shifts s
  WHERE s.name = 'Shift 2' AND lower(p.full_name) IN ('lloyd balondo', 'cindy ling');
UPDATE profiles p SET shift_id = s.id FROM shifts s
  WHERE s.name = 'Shift 3' AND lower(p.full_name) IN ('dj', 'jasmin maulana');

-- Anchor LOGIN -> shift start, LOGOUT (+ SHIFT REPORT) -> shift end on every template.
UPDATE template_items SET shift_anchor = 'start' WHERE upper(title) = 'LOGIN';
UPDATE template_items SET shift_anchor = 'end'   WHERE upper(title) LIKE 'LOGOUT%';

-- Backfill existing OPEN LOGIN/LOGOUT tasks to the correct shift boundary, so the
-- current board is fixed immediately (no more "overdue while still on shift").
-- Recurring respawn (approve_task) carries the deadline forward +1 period; Manila
-- has no DST, so the wall-clock stays put from here on.
UPDATE tasks t
SET deadline_at = next_shift_boundary(
      p.shift_id,
      CASE WHEN upper(t.title) = 'LOGIN' THEN 'start' ELSE 'end' END,
      NOW()
    )
FROM profiles p
WHERE t.assigned_to = p.id
  AND p.shift_id IS NOT NULL
  AND t.deleted_at IS NULL
  AND t.status NOT IN ('APPROVED', 'REJECTED')
  AND (upper(t.title) = 'LOGIN' OR upper(t.title) LIKE 'LOGOUT%');

UPDATE tasks t
SET due_date = (t.deadline_at AT TIME ZONE COALESCE(p.timezone, 'Asia/Manila'))::date
FROM profiles p
WHERE t.assigned_to = p.id
  AND p.shift_id IS NOT NULL
  AND t.deleted_at IS NULL
  AND t.status NOT IN ('APPROVED', 'REJECTED')
  AND (upper(t.title) = 'LOGIN' OR upper(t.title) LIKE 'LOGOUT%');

COMMIT;
