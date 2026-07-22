import { format, formatDistanceToNow, isPast, differenceInCalendarDays, differenceInHours, endOfMonth, endOfWeek, setHours, setMinutes, setSeconds } from 'date-fns'
import type { Task, TaskStatus, Priority } from './types'
import { canManageTeam } from './types'

export function formatDate(date: string | null) {
  if (!date) return null
  return format(new Date(date), 'MMM d, HH:mm')
}

export function formatRelative(date: string) {
  return formatDistanceToNow(new Date(date), { addSuffix: true })
}

export function isOverdue(dueDate: string | null) {
  if (!dueDate) return false
  return isPast(new Date(dueDate))
}

export function daysUntilDue(dueDate: string | null) {
  if (!dueDate) return null
  return differenceInCalendarDays(new Date(dueDate), new Date())
}

export function deadlineLabel(deadline: string | null) {
  if (!deadline) return 'No deadline'
  const days = daysUntilDue(deadline)
  if (days === null) return 'No deadline'
  if (days < 0) return 'Overdue'
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days <= 7) return 'This Week'
  if (days <= 14) return 'Next Week'
  return formatDate(deadline)
}

export function berlinDefaultDeadline(section: string) {
  const now = new Date()
  const atEndOfDay = (date: Date) => setSeconds(setMinutes(setHours(date, 23), 59), 0)
  if (section === 'WEEKLY') return atEndOfDay(endOfWeek(now, { weekStartsOn: 1 }))
  if (section === 'MONTHLY') return atEndOfDay(endOfMonth(now))
  return atEndOfDay(now)
}

export function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

/**
 * Admin-defined board order (boards.position, migration 025) with created_at as
 * tiebreaker. Sorted in JS instead of `.order('position')` so the app keeps
 * working if a deploy lands before the migration ran (missing column in a
 * PostgREST order/select would error the whole query).
 */
export function sortBoards<T extends { position?: number | null; created_at?: string | null }>(boards: T[]): T[] {
  return [...boards].sort((a, b) => {
    const pa = a.position ?? Number.MAX_SAFE_INTEGER
    const pb = b.position ?? Number.MAX_SAFE_INTEGER
    if (pa !== pb) return pa - pb
    return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
  })
}

export type UrgencyLevel = 'overdue' | 'soon' | 'near' | 'far' | 'none'

export interface Urgency {
  level: UrgencyLevel
  label: string
  color: string
  bg: string
}

/**
 * Graded deadline urgency — colour AND text convey how pressing a task is.
 * overdue (red) · today / ≤2h (orange) · tomorrow / ≤3d (yellow) · further out (neutral).
 * Settled tasks (approved/rejected) carry no urgency.
 */
export function getUrgency(deadline: string | null, status?: TaskStatus): Urgency {
  if (status === 'APPROVED' || status === 'REJECTED') {
    return { level: 'none', label: deadlineLabel(deadline) || 'No deadline', color: 'var(--muted)', bg: 'transparent' }
  }
  // Once submitted for review the member has done their part — pause the deadline
  // clock so a task waiting on the reviewer never shows as overdue (Tan, 2026-07-20).
  // The XP overdue penalty is judged separately on completed_at, so on-time work
  // stays unpenalised even if approval lands late.
  if (status === 'DONE') {
    return { level: 'none', label: 'Awaiting review', color: 'var(--muted)', bg: 'transparent' }
  }
  if (!deadline) {
    return { level: 'none', label: 'No deadline', color: 'var(--muted)', bg: 'transparent' }
  }

  const target = new Date(deadline)
  const now = new Date()
  const days = differenceInCalendarDays(target, now)

  if (isPast(target)) {
    const overdueBy = Math.abs(days)
    return { level: 'overdue', label: overdueBy >= 1 ? `${overdueBy}d overdue` : 'Overdue', color: 'var(--red)', bg: 'var(--red-dim)' }
  }

  const hours = differenceInHours(target, now)
  if (hours <= 2) return { level: 'soon', label: `in ${Math.max(1, hours)}h`, color: 'var(--orange)', bg: 'var(--orange-dim)' }
  if (days === 0) return { level: 'soon', label: 'Today', color: 'var(--orange)', bg: 'var(--orange-dim)' }
  if (days === 1) return { level: 'near', label: 'Tomorrow', color: 'var(--yellow)', bg: 'var(--yellow-dim)' }
  if (days <= 3) return { level: 'near', label: `in ${days} days`, color: 'var(--yellow)', bg: 'var(--yellow-dim)' }

  return { level: 'far', label: formatDate(deadline) || 'Scheduled', color: 'var(--muted)', bg: 'transparent' }
}

/**
 * Whether a task is within its near-deadline XP-bonus window (24h before the
 * deadline) — future deadline, not yet settled.
 */
export function isNearDeadline(deadline: string | null, status?: TaskStatus): boolean {
  if (!deadline || status === 'APPROVED' || status === 'REJECTED') return false
  const hours = differenceInHours(new Date(deadline), new Date())
  return hours >= 0 && hours <= 24
}

/** Combined status/priority colour for the task-row accent bar. */
export function taskAccentColor(status: TaskStatus, priority: Priority): string {
  if (status === 'APPROVED') return 'var(--green)'
  if (status === 'REJECTED') return 'var(--red)'
  if (status === 'DONE') return 'var(--accent)'
  const byPriority: Record<Priority, string> = { HIGH: 'var(--red)', MEDIUM: 'var(--amber)', LOW: 'var(--green)' }
  return byPriority[priority]
}

/** Whether the given user may delete a task: the creator, a manager, or an admin. */
export function canDeleteTask(task: Pick<Task, 'created_by' | 'creator_id'>, user: { id: string; role?: string | null }): boolean {
  if (canManageTeam(user.role)) return true
  return task.created_by === user.id || task.creator_id === user.id
}
