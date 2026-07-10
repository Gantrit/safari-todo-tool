-- ============================================================
-- One-off maintenance: full factory reset before public launch (Tan, 2026-07-10)
-- ============================================================
-- Run ONCE in the Supabase SQL editor. Not a numbered migration — it's a data
-- reset, not a schema change. This is IRREVERSIBLE and there is no backup taken
-- here — if you want a safety net, export the relevant tables first
-- (`SELECT * FROM tasks WHERE status = 'APPROVED';`, `xp_log`, `audit_logs`,
-- `quest_acceptances`) before running this.
--
-- Scope (Tan's instruction): the tasks currently sitting on the boards right
-- now stay exactly as they are. Everything that represents PAST activity —
-- completed/archived work, XP history, audit trail, quest completions — is
-- wiped so every member starts clean at launch.
--
-- Resets:
--   1. XP: profiles.xp -> 0, profiles.level -> 1 for everyone (incl.
--      deactivated users); xp_log fully cleared (source of the weekly/monthly
--      leaderboard and the character page's XP history).
--   2. Archive: tasks with status = 'APPROVED' are deleted outright (not just
--      hidden) — this cascades to their archive row, checklist items,
--      subtasks, comments, attachments and assignee links automatically
--      (all FK'd ON DELETE CASCADE from tasks). Recurring tasks are
--      unaffected: approving one already spawned the NEXT open copy as a
--      separate row, which is untouched here.
--   3. Soft-deleted tasks (deleted_at IS NOT NULL, i.e. already in nobody's
--      trash/view) are purged for real — pure cleanup, nothing currently
--      visible to anyone is affected.
--   4. Audit log: audit_logs fully cleared.
--   5. Quest completions: quest_acceptances fully cleared, and every quest's
--      own status reset to 'OPEN' (quests.status separately drives the
--      "closed" badge in the Quests UI, so clearing quest_acceptances alone
--      isn't enough to make a quest re-acceptable).
--   6. Notifications: cleared for everyone (old alerts about now-deleted
--      history would just be noise at launch).
--
-- Deliberately NOT touched:
--   - Currently open/in-progress tasks (any status other than APPROVED,
--     with deleted_at IS NULL) — exactly as requested.
--   - Boards, workspaces, members, roles, board access — structure, not history.
--   - Templates (task_templates/template_items) — reusable, not instance data.
--   - Quest DEFINITIONS (quests.title/description/bonus_xp/etc.) — only their
--     status + acceptances reset, the quest itself isn't deleted.
--   - xp_settings (the admin-configured XP formula) — config, not history.
--   - shift_reports / shift_report_creators / shift_report_files — NOT
--     included. That feature just shipped; if there is test data in there
--     from QA, clear it separately (ask first — this script doesn't guess).

BEGIN;

-- 1. XP
DELETE FROM xp_log;
UPDATE profiles SET xp = 0, level = 1;

-- 2 + 3. Archive + soft-deleted tasks (cascades to their children automatically)
DELETE FROM tasks WHERE status = 'APPROVED' OR deleted_at IS NOT NULL;

-- 4. Audit log
DELETE FROM audit_logs;

-- 5. Quest completions
DELETE FROM quest_acceptances;
UPDATE quests SET status = 'OPEN' WHERE status <> 'OPEN';

-- 6. Notifications
DELETE FROM notifications;

COMMIT;
