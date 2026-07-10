-- ============================================================
-- 024 — Shift report self-service edits
-- ============================================================
-- Chatters get a secret edit link after submitting: max 2 edit passes within
-- 8 hours of submission (both enforced server-side in /api/shift-report/edit).
-- The token is the only credential — the submit page has no login — so it must
-- stay unguessable (UUID) and is only ever returned to the submitter.
--
-- Also widens the notifications type CHECK so admins/managers can be notified
-- in-app when a report is edited ('shift_report').
-- ============================================================

ALTER TABLE shift_reports
  ADD COLUMN IF NOT EXISTS edit_token UUID NOT NULL DEFAULT uuid_generate_v4(),
  ADD COLUMN IF NOT EXISTS edit_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_edited_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS shift_reports_edit_token_idx ON shift_reports (edit_token);

-- Allow the new notification type used for shift-report edit alerts.
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('assignment', 'mention', 'reminder', 'result_submitted', 'approved', 'shift_report'));
