-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE subtasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE xp_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE archive ENABLE ROW LEVEL SECURITY;

-- Profiles: anyone authenticated can read, only own row can update
CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Workspaces: members can read
CREATE POLICY "workspaces_select" ON workspaces FOR SELECT TO authenticated
  USING (id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
CREATE POLICY "workspaces_insert" ON workspaces FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "workspaces_update" ON workspaces FOR UPDATE TO authenticated
  USING (created_by = auth.uid());

-- Workspace members: members can read their workspace
CREATE POLICY "workspace_members_select" ON workspace_members FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
CREATE POLICY "workspace_members_insert" ON workspace_members FOR INSERT TO authenticated
  WITH CHECK (true); -- Handled via service role
CREATE POLICY "workspace_members_delete" ON workspace_members FOR DELETE TO authenticated
  USING (workspace_id IN (
    SELECT wm.workspace_id FROM workspace_members wm
    JOIN profiles p ON p.id = auth.uid()
    WHERE wm.workspace_id = workspace_members.workspace_id AND p.role = 'admin'
  ));

-- Boards: workspace members can read
CREATE POLICY "boards_select" ON boards FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
CREATE POLICY "boards_insert" ON boards FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (
    SELECT wm.workspace_id FROM workspace_members wm
    JOIN profiles p ON p.id = auth.uid() AND p.role = 'admin'
    WHERE wm.workspace_id = boards.workspace_id
  ));
CREATE POLICY "boards_delete" ON boards FOR DELETE TO authenticated
  USING (workspace_id IN (
    SELECT wm.workspace_id FROM workspace_members wm
    JOIN profiles p ON p.id = auth.uid() AND p.role = 'admin'
    WHERE wm.workspace_id = boards.workspace_id
  ));

-- Tasks: workspace members + own private tasks
CREATE POLICY "tasks_select" ON tasks FOR SELECT TO authenticated
  USING (
    board_id IN (
      SELECT b.id FROM boards b
      JOIN workspace_members wm ON wm.workspace_id = b.workspace_id
      WHERE wm.user_id = auth.uid()
    )
    OR (board_id IS NULL AND assigned_to = auth.uid())
  );
CREATE POLICY "tasks_insert" ON tasks FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "tasks_update" ON tasks FOR UPDATE TO authenticated
  USING (
    assigned_to = auth.uid() OR created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
CREATE POLICY "tasks_delete" ON tasks FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Subtasks: follow task access
CREATE POLICY "subtasks_select" ON subtasks FOR SELECT TO authenticated
  USING (task_id IN (SELECT id FROM tasks));
CREATE POLICY "subtasks_insert" ON subtasks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "subtasks_update" ON subtasks FOR UPDATE TO authenticated USING (true);
CREATE POLICY "subtasks_delete" ON subtasks FOR DELETE TO authenticated USING (true);

-- Comments
CREATE POLICY "comments_select" ON comments FOR SELECT TO authenticated
  USING (task_id IN (SELECT id FROM tasks));
CREATE POLICY "comments_insert" ON comments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "comments_delete" ON comments FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Reactions
CREATE POLICY "reactions_select" ON reactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "reactions_insert" ON reactions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "reactions_delete" ON reactions FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Attachments
CREATE POLICY "attachments_select" ON attachments FOR SELECT TO authenticated
  USING (task_id IN (SELECT id FROM tasks));
CREATE POLICY "attachments_insert" ON attachments FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "attachments_delete" ON attachments FOR DELETE TO authenticated
  USING (created_by = auth.uid());

-- Notifications: own only
CREATE POLICY "notifications_select" ON notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "notifications_update" ON notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- XP log: own only
CREATE POLICY "xp_log_select" ON xp_log FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Archive: own only
CREATE POLICY "archive_select" ON archive FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "archive_insert" ON archive FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
