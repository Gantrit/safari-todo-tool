export type Role = 'admin' | 'manager' | 'employee' | 'guest'
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH'
export type TaskStatus = 'ASSIGNED' | 'IN_EDIT' | 'DONE' | 'APPROVED' | 'REJECTED'
export type TaskSection = 'DAILY' | 'WEEKLY' | 'MONTHLY'
export type BoardType = 'kanban' | 'calendar'
export type NotificationType =
  | 'assignment'
  | 'mention'
  | 'reminder'
  | 'result_submitted'
  | 'approved'
  | 'overdue'
  | 'comment'
  | 'rejected'
  | 'need_clarification'
  | 'notice_sla_missed'
export type RecurringFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'CUSTOM'
export type QuestStatus = 'OPEN' | 'ACCEPTED' | 'DONE' | 'APPROVED' | 'REJECTED'

export interface Profile {
  id: string
  email: string
  full_name: string
  role: Role
  avatar_url: string | null
  xp: number
  level: number
  rank?: string
  streak_days?: number
  streak_broken_at?: string | null
  timezone?: string
  shift_id?: string | null
  deactivated_at?: string | null
  created_at: string
}

export interface Shift {
  id: string
  name: string
  start_local: string
  end_local: string
  timezone: string
  position: number
}

export interface Department {
  id: string
  name: string
  slug: string
  position: number
  created_at?: string
}

export interface Workspace {
  id: string
  name: string
  created_by: string
  created_at: string
}

export interface WorkspaceMember {
  workspace_id: string
  user_id: string
  role: Role
  profile?: Profile
}

export interface Board {
  id: string
  workspace_id: string
  name: string
  type: BoardType
  created_at: string
}

export interface Task {
  id: string
  board_id: string | null
  department_id?: string | null
  project_id?: string | null
  assigned_to?: string
  assignee_ids?: string[]
  created_by: string
  creator_id?: string
  creator_profile_id?: string | null
  title: string
  description: string | null
  priority: Priority
  status: TaskStatus
  section: TaskSection
  due_date?: string | null
  deadline_at: string | null
  remind_3d: boolean
  remind_24h: boolean
  xp_awarded: boolean
  position: number
  parent_task_id: string | null
  result_url: string | null
  labels: string[]
  google_drive_url: string | null
  reference_url?: string | null
  recurring_enabled?: boolean
  recurring_frequency?: RecurringFrequency | null
  recurring_config?: Record<string, unknown> | null
  needs_clarification?: boolean
  clarification_note?: string | null
  noticed_at?: string | null
  completed_at?: string | null
  approved_at?: string | null
  rejected_at?: string | null
  deleted_at?: string | null
  created_at: string
  updated_at: string
  assigned_profile?: Profile
  assignee_profiles?: Profile[]
  creator_profile?: Profile
  subtasks?: Subtask[]
  checklist_items?: ChecklistItem[]
  comments?: Comment[]
  attachments?: Attachment[]
}

export interface ChecklistItem {
  id: string
  task_id: string
  title: string
  done: boolean
  position: number
  created_at: string
}

export interface Subtask {
  id: string
  task_id: string
  title: string
  assigned_to: string | null
  done: boolean
  created_at: string
  assigned_profile?: Profile
}

export interface Comment {
  id: string
  task_id: string
  user_id: string
  content: string
  created_at: string
  profile?: Profile
  reactions?: Reaction[]
}

export interface Reaction {
  id: string
  comment_id: string
  user_id: string
  emoji: string
}

export interface Attachment {
  id: string
  task_id: string
  /** External link attachments. NULL for uploaded files (see storage_path). */
  url: string | null
  label: string
  /** Object path inside the private `task-files` bucket for uploaded files. */
  storage_path?: string | null
  file_type?: string | null
  created_by: string
  created_at: string
}

export interface NotificationPreferences {
  user_id: string
  in_app_enabled: boolean
  email_enabled: boolean
  digest_assignments: boolean
  email_from: string
  created_at?: string
  updated_at?: string
}

export interface Notification {
  id: string
  user_id: string
  type: NotificationType
  message: string
  task_id: string | null
  read: boolean
  created_at: string
}

export interface TaskTemplate {
  id: string
  title: string
  description: string | null
  checklist: string[]
  section: TaskSection
  priority: Priority
  reference_url: string | null
  default_deadline: TaskSection | 'CUSTOM'
  created_by: string
  deleted_at?: string | null
  created_at: string
  updated_at: string
}

export interface Quest {
  id: string
  title: string
  description: string | null
  department_id: string | null
  bonus_xp: number
  allow_multiple_accepts: boolean
  status: QuestStatus
  created_by: string
  deadline_at: string | null
  created_at: string
  updated_at: string
}

/** An accepted quest surfaced as a to-do on the member's board column.
 *  Read-only — quests keep their own accept/submit/approve flow on /quests. */
export interface QuestTodo {
  acceptance_id: string
  quest_id: string
  user_id: string
  title: string
  deadline_at: string | null
  status: QuestStatus
}

export interface AuditLog {
  id: string
  actor_id: string | null
  action: string
  entity_type: string
  entity_id: string | null
  metadata: Record<string, unknown>
  created_at: string
  actor_profile?: Profile
}

export interface XpLog {
  id: string
  user_id: string
  amount: number
  reason: string
  task_id: string | null
  created_at: string
}

export interface Archive {
  id: string
  task_id: string
  user_id: string
  archived_at: string
  task?: Task
}

// XP amounts are admin-configurable and live in the `xp_settings` table
// (migration 018); `approve_task()` reads them server-side on every approval.
// Do not hardcode XP values client-side — they would silently drift.
export const NEAR_DEADLINE_WINDOW_HOURS = 24 // UI hint only (isNearDeadline); actual window comes from xp_settings

export function getLevelInfo(xp: number) {
  const normalizedXp = Math.max(0, xp || 0)
  const level = Math.floor(normalizedXp / 100) + 1
  const current = { level, title: getRankForLevel(level), min: (level - 1) * 100 }
  const next = { level: level + 1, title: getRankForLevel(level + 1), min: level * 100 }
  const progress = ((normalizedXp - current.min) / 100) * 100
  return { current, next, progress }
}

export function getRankForLevel(level: number) {
  if (level >= 50) return 'Safari Legend'
  if (level >= 35) return 'Elite'
  if (level >= 20) return 'High Performer'
  if (level >= 10) return 'Executor'
  if (level >= 5) return 'Reliable'
  return 'Rookie'
}

export function normalizeRole(role: Role | string | null | undefined): Role {
  if (role === 'admin' || role === 'manager' || role === 'guest' || role === 'employee') return role
  // Legacy 'user' (and anything unknown/null) maps to Member.
  return 'employee'
}

export function isAdminRole(role: Role | string | null | undefined) {
  return role === 'admin'
}

/** Display names: stored values map to the product role names. */
export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  manager: 'Manager',
  employee: 'Member',
  guest: 'Viewer',
}

export function roleLabel(role: Role | string | null | undefined): string {
  return ROLE_LABELS[normalizeRole(role)]
}

/** Admin or Manager — the team-management tier (approve, edit/delete any task). */
export function canManageTeam(role: Role | string | null | undefined): boolean {
  const r = normalizeRole(role)
  return r === 'admin' || r === 'manager'
}

/** Viewer — read-only, no task writes. */
export function isViewerRole(role: Role | string | null | undefined): boolean {
  return normalizeRole(role) === 'guest'
}

/** Can this role create/edit tasks at all (everyone except Viewer)? */
export function canWriteTasks(role: Role | string | null | undefined): boolean {
  return !isViewerRole(role)
}

export function getTaskDeadline(task: Pick<Task, 'deadline_at' | 'due_date'>) {
  return task.deadline_at || task.due_date || null
}

// ── Shift Reports ────────────────────────────────────────────
export interface ShiftReportCreator {
  id: string
  name: string
  active: boolean
  created_at: string
}

export interface ShiftReportFile {
  id: string
  shift_report_id: string
  path: string
  file_name: string | null
  file_type: string | null
  created_at: string
  /** Signed URL, generated server-side for display. Not stored in the DB. */
  signed_url?: string | null
}

export type ShiftReportReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export interface ShiftReport {
  id: string
  creator_id: string | null
  creator_name: string | null
  chatter_name: string
  shift_date: string
  shift_label: string | null
  time_range: string | null
  gross_amount: number
  net_amount: number
  currency: string
  new_subs: number
  renew_subs: number
  mass_message_replies: number
  chat_engagements: number
  mass_message_note: string | null
  went_well: string | null
  went_wrong: string | null
  sub_behavior: string | null
  created_at: string
  // Self-service edits (migration 024): max 2 within 8h via a secret edit token.
  // The token itself is never included in the reports list — only the submitter has it.
  edit_count?: number
  last_edited_at?: string | null
  // Manager review (migration 033)
  review_status?: ShiftReportReviewStatus
  reviewed_by?: string | null
  reviewed_at?: string | null
  creator?: ShiftReportCreator | null
  files?: ShiftReportFile[]
}

