-- ============================================================
-- 032 — Real file uploads on tasks (jpg / pdf / doc / …)
-- ============================================================
-- The `attachments` table so far only held pasted URLs. Now tasks accept real
-- file uploads into a private `task-files` storage bucket; the app renders them
-- through short-lived signed URLs created client-side by authenticated users.
--
-- `storage_path` is set for uploaded files (then `url` is NULL); link
-- attachments keep using `url`. Exactly one of the two is populated.
--
-- Run in the Supabase SQL editor AFTER 031_simplify_status_flow.sql.

BEGIN;

ALTER TABLE attachments ADD COLUMN IF NOT EXISTS storage_path TEXT;
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS file_type TEXT;
ALTER TABLE attachments ALTER COLUMN url DROP NOT NULL;

-- Deleting: until now only the uploader could remove an attachment; admins and
-- managers may clean up any task's files too.
DROP POLICY IF EXISTS "attachments_delete" ON attachments;
CREATE POLICY "attachments_delete" ON attachments FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR can_manage());

-- Private bucket for task files.
INSERT INTO storage.buckets (id, name, public)
VALUES ('task-files', 'task-files', FALSE)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: every signed-in team member may upload, read (via signed
-- URLs), and delete inside this bucket. This is an internal tool — task files
-- are team-visible by design, same as the tasks themselves.
DROP POLICY IF EXISTS "task_files_insert" ON storage.objects;
CREATE POLICY "task_files_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'task-files');

DROP POLICY IF EXISTS "task_files_select" ON storage.objects;
CREATE POLICY "task_files_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'task-files');

DROP POLICY IF EXISTS "task_files_delete" ON storage.objects;
CREATE POLICY "task_files_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'task-files');

COMMIT;
