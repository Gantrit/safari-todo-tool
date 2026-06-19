import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow, isPast, differenceInDays } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | null) {
  if (!date) return null
  return format(new Date(date), 'MMM d, yyyy')
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
  return differenceInDays(new Date(dueDate), new Date())
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
