-- ============================================================
-- 025 — Board ordering (drag-to-reorder in Settings)
-- ============================================================
-- Admins reorder boards in Settings → Boards & access; the sidebar and every
-- board list follow this order. Position updates go through the existing
-- boards_update RLS policy (admin-only, migration 015).

ALTER TABLE boards ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;

-- Backfill: keep today's visual order (creation order) per workspace.
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY workspace_id ORDER BY created_at) - 1 AS rn
  FROM boards
)
UPDATE boards b SET position = o.rn FROM ordered o WHERE o.id = b.id;

CREATE INDEX IF NOT EXISTS boards_workspace_position_idx ON boards (workspace_id, position);
