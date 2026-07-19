-- 039_fix_notification_types.sql
--
-- CRITICAL BUG FIX (found 2026-07-19, root cause of "Reject task does nothing"):
--
-- Migration 024 redefined notifications_type_check to add 'shift_report' but
-- rebuilt the list from the ORIGINAL 001 set instead of the then-current 012
-- set — silently dropping 'overdue', 'comment', 'rejected',
-- 'need_clarification', 'notice_sla_missed' and 'xp_adjusted'.
--
-- Because reject_task / review_quest / admin_adjust_xp insert their
-- notification INSIDE the same transaction, the CHECK violation rolled back
-- the WHOLE action. Concretely broken since 024 (2026-07-05):
--   · Reject task (with and without the -5 XP penalty) — status never changed
--   · Reject quest
--   · Guild Hall manual XP adjustments
-- The client swallowed the error, so every one of these looked like a dead
-- button. (The TaskModal now surfaces RPC errors as toasts — same commit.)
--
-- Fix: restore the FULL union of every type any function/trigger inserts.
-- Run in the Supabase SQL editor — this one FIRST, it's the urgent fix;
-- 038 (template sync) is independent and can run right after.

BEGIN;

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
  'xp_adjusted',
  'shift_report'
));

COMMIT;
