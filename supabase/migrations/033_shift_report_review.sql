-- ============================================================
-- 033 — Shift report review (approve / reject)
-- ============================================================
-- Admins/managers can now approve or reject each submitted shift report from
-- the /reports page. Purely a review marker — no XP, no notifications; the
-- chatters often have no account.
--
-- Writes go through the existing `shift_reports_manage` RLS policy
-- (admin/manager only), so no new policies are needed.
--
-- Run in the Supabase SQL editor AFTER 032_task_file_attachments.sql.

BEGIN;

ALTER TABLE shift_reports ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'PENDING'
  CHECK (review_status IN ('PENDING', 'APPROVED', 'REJECTED'));
ALTER TABLE shift_reports ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE shift_reports ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS shift_reports_review_status_idx ON shift_reports (review_status);

COMMIT;
