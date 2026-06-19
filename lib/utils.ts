import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow, isPast, differenceInCalendarDays, endOfMonth, endOfWeek, setHours, setMinutes, setSeconds } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

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

export function noticeSlaMissed(createdAt: string, status: string, noticedAt?: string | null) {
  if (status !== 'ASSIGNED' || noticedAt) return false
  return Date.now() - new Date(createdAt).getTime() > 12 * 60 * 60 * 1000
}

export function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function generateId() {
  return Math.random().toString(36).slice(2, 11)
}
