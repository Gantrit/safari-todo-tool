export type Role = 'admin' | 'user'
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH'
export type TaskStatus = 'NOTICED' | 'IN_EDIT' | 'DONE' | 'APPROVED'
export type TaskSection = 'DAILY' | 'IMMINENT' | 'WEEKLY' | 'MONTHLY'
export type BoardType = 'kanban' | 'calendar'
export type NotificationType = 'assignment' | 'mention' | 'reminder' | 'result_submitted' | 'approved'

export interface Profile {
  id: string
  email: string
  full_name: string
  role: Role
  avatar_url: string | null
  xp: number
  level: number
  created_at: string
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
  board_id: string
  assigned_to: string
  created_by: string
  title: string
  description: string | null
  priority: Priority
  status: TaskStatus
  section: TaskSection
  due_date: string | null
  remind_3d: boolean
  remind_24h: boolean
  xp_awarded: boolean
  position: number
  parent_task_id: string | null
  result_url: string | null
  labels: string[]
  google_drive_url: string | null
  created_at: string
  updated_at: string
  assigned_profile?: Profile
  creator_profile?: Profile
  subtasks?: Subtask[]
  comments?: Comment[]
  attachments?: Attachment[]
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
  LOW: -10,
  MEDIUM: -20,
  HIGH: -40,
}

export const LEVEL_THRESHOLDS = [
  { level: 1, title: 'Rookie', min: 0 },
  { level: 2, title: 'Active', min: 100 },
  { level: 3, title: 'Consistent', min: 250 },
  { level: 4, title: 'Reliable', min: 500 },
  { level: 5, title: 'Elite', min: 1000 },
]

export function getLevelInfo(xp: number) {
  let current = LEVEL_THRESHOLDS[0]
  let next = LEVEL_THRESHOLDS[1]
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i].min) {
      current = LEVEL_THRESHOLDS[i]
      next = LEVEL_THRESHOLDS[i + 1] || null
      break
    }
  }
  const progress = next
    ? ((xp - current.min) / (next.min - current.min)) * 100
    : 100
  return { current, next, progress }
}
