-- ============================================================
-- 022 — Quest categories (editable departments)
-- ============================================================
-- Quest categories ARE the shared `departments` rows (quests.department_id
-- already references them). Until now departments were seed-only (SELECT for
-- everyone, no write policy → only service role could change them). This lets
-- admins manage them from Settings → Quest categories. Deleting a category is
-- safe: quests.department_id / tasks.department_id are ON DELETE SET NULL.
-- ============================================================

DROP POLICY IF EXISTS "departments_admin_write" ON departments;
CREATE POLICY "departments_admin_write" ON departments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
