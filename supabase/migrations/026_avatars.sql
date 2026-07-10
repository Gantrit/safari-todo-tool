-- ============================================================
-- 026 — Profile pictures (avatars)
-- ============================================================
-- profiles.avatar_url already exists since 001; this adds the storage side.
-- The bucket is PUBLIC (team profile photos, unguessable UUID paths) so the UI
-- can render plain <img> tags without minting signed URLs everywhere.
-- Users manage only their own folder: avatars/<auth.uid()>/...

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', TRUE)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_own_insert" ON storage.objects;
CREATE POLICY "avatars_own_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatars_own_update" ON storage.objects;
CREATE POLICY "avatars_own_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatars_own_delete" ON storage.objects;
CREATE POLICY "avatars_own_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
