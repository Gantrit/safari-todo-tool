export type Role = 'admin' | 'manager' | 'employee' | 'guest'
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH'
export type TaskStatus = 'ASSIGNED' | 'NOTICED' | 'IN_EDIT' | 'DONE' | 'APPROVED' | 'REJECTED'
export type TaskSection = 'DAILY' | 'IMMINENT' | 'WEEKLY' | 'MONTHLY'
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
  deactivated_at?: string | null
  created_at: string
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
  url: string
  label: string
  created_by: string
  created_at: string
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

export const XP_VALUES: Record<Priority, number> = {
  LOW: 5,
  MEDIUM: 10,
  HIGH: 20,
}

export const XP_PENALTY: Record<Priority, number> = {
  LOW: -5,
  MEDIUM: -10,
  HIGH: -20,
}

export const IMMINENT_XP_BONUS = 10
export const MAX_EARLY_COMPLETION_BONUS = 10
export const MAX_STREAK_BONUS = 10

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

export function calculateApprovalXp(task: Pick<Task, 'priority' | 'section' | 'deadline_at' | 'due_date'>, completedAt = new Date()) {
  const base = XP_VALUES[task.priority]
  const imminent = task.section === 'IMMINENT' ? IMMINENT_XP_BONUS : 0
  const deadline = getTaskDeadline(task)
  let early = 0
  if (deadline) {
    const diffMs = new Date(deadline).getTime() - completedAt.getTime()
    early = Math.max(0, Math.min(MAX_EARLY_COMPLETION_BONUS, Math.floor(diffMs / 86_400_000)))
  }
  return base + imminent + early
}
