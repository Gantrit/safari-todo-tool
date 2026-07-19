-- 040_notification_delete.sql
--
-- Feature (Tan, 2026-07-19): notifications pile up with no way to get rid of
-- them. The UI gets a per-notification delete button and a "Clear all" action,
-- both of which need a DELETE policy — 002 only created SELECT and UPDATE
-- policies for notifications, so client-side deletes were silently impossible.
--
-- Own notifications only, same scoping as the existing policies.
-- Run in the Supabase SQL editor AFTER 039.

BEGIN;

DROP POLICY IF EXISTS "notifications_delete" ON notifications;
CREATE POLICY "notifications_delete" ON notifications FOR DELETE TO authenticated
  USING (user_id = auth.uid());

COMMIT;
