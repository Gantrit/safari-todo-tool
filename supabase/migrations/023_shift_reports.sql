-- ============================================================
-- 023 — Shift Reports (chatter shift submissions + screenshots)
-- ============================================================
-- Chatters submit their end-of-shift report (sales figures + notes + screenshots)
-- through a PUBLIC page (no login) so internal AND external/emergency chatters can
-- file one without an app account. All writes happen server-side via the service
-- role, so these tables stay locked down: authenticated admin/manager can read/manage
-- in-app; nobody else gets direct table access.
--
-- `chatter_name` is free text on purpose (not a profiles FK) — an emergency chatter
-- has no profile row. Internal chatters just type their name.
--
-- v1 has NO automatic screenshot verification. The verification columns from the
-- spec are intentionally omitted here; they land in a later migration if/when the
-- Anthropic-API auto-check (v2) is switched on.
-- ============================================================

-- Models / creators the chatters run shifts for.
CREATE TABLE IF NOT EXISTS shift_report_creators (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per submitted shift report.
CREATE TABLE IF NOT EXISTS shift_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id UUID REFERENCES shift_report_creators(id) ON DELETE SET NULL,
  creator_name TEXT,                      -- snapshot of the model name at submit time,
                                          -- so deleting a creator never blanks old reports
  chatter_name TEXT NOT NULL,
  shift_date DATE NOT NULL DEFAULT CURRENT_DATE,
  shift_label TEXT,                       -- e.g. "1st shift"
  time_range TEXT,                        -- e.g. "6am-2pm"
  gross_amount NUMERIC(10,2) NOT NULL DEFAULT 0,   -- Gross Texting & Tips
  net_amount NUMERIC(10,2) NOT NULL DEFAULT 0,     -- Net Texting & Tips
  currency TEXT NOT NULL DEFAULT 'USD',
  new_subs INTEGER NOT NULL DEFAULT 0,
  renew_subs INTEGER NOT NULL DEFAULT 0,
  mass_message_replies INTEGER NOT NULL DEFAULT 0,
  chat_engagements INTEGER NOT NULL DEFAULT 0,
  mass_message_note TEXT,                 -- did the mass message boost engagement?
  went_well TEXT,
  went_wrong TEXT,
  sub_behavior TEXT,                      -- behaviour of the subs / traffic notes
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS shift_reports_creator_date_idx ON shift_reports (creator_id, shift_date DESC);
CREATE INDEX IF NOT EXISTS shift_reports_date_idx ON shift_reports (shift_date DESC);

-- Uploaded screenshots / PDFs. `path` is the object path inside the private
-- `shift-report-files` storage bucket; the app serves them via signed URLs.
CREATE TABLE IF NOT EXISTS shift_report_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shift_report_id UUID NOT NULL REFERENCES shift_reports(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  file_name TEXT,
  file_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS shift_report_files_report_idx ON shift_report_files (shift_report_id);

ALTER TABLE shift_report_creators ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_report_files ENABLE ROW LEVEL SECURITY;

-- Creators: any signed-in user may read the list; only admin/manager may manage.
-- (The public submit page reads creators via the service role, not this policy.)
CREATE POLICY "shift_creators_select" ON shift_report_creators FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "shift_creators_manage" ON shift_report_creators FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','manager')));

-- Reports + files: only admin/manager get direct in-app read/manage access.
-- Public inserts do NOT use these policies — they go through the service role.
CREATE POLICY "shift_reports_manage" ON shift_reports FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','manager')));

CREATE POLICY "shift_report_files_manage" ON shift_report_files FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','manager')));

-- Private storage bucket for the screenshots/PDFs. Uploads + reads happen through
-- the service role, so no public storage policies are added.
INSERT INTO storage.buckets (id, name, public)
VALUES ('shift-report-files', 'shift-report-files', FALSE)
ON CONFLICT (id) DO NOTHING;

-- Seed the current models. Manage the list in-app (Settings → Creators / Models).
INSERT INTO shift_report_creators (name) VALUES
  ('Alanna'), ('Juan'), ('Dasha'), ('Zoey'), ('Millie'), ('Luna'), ('Davis')
ON CONFLICT DO NOTHING;
