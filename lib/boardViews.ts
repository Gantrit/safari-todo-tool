import { Task, TaskStatus, Priority, getTaskDeadline } from './types'
import { getUrgency, UrgencyLevel } from './utils'

export type BoardViewMode = 'members' | 'table' | 'selection' | 'columns'

/** Persisted view states may predate the removal of the Focus view. */
export function normalizeViewMode(view: string | undefined): BoardViewMode | null {
  if (view === 'members' || view === 'table' || view === 'selection' || view === 'columns') return view
  if (view === 'focus') return 'members'
  return null
}

export interface BoardFilters {
  statuses: TaskStatus[]
  urgencies: UrgencyLevel[]
  creators: string[]
}

export const EMPTY_FILTERS: BoardFilters = { statuses: [], urgencies: [], creators: [] }

export function filtersActiveCount(f: BoardFilters): number {
  return f.statuses.length + f.urgencies.length + f.creators.length
}

/** Apply the combinable Status / Urgency / Creator filters. */
export function filterTasks(tasks: Task[], f: BoardFilters): Task[] {
  if (filtersActiveCount(f) === 0) return tasks
  return tasks.filter((t) => {
    if (f.statuses.length && !f.statuses.includes(t.status)) return false
    if (f.creators.length && !f.creators.includes(t.created_by)) return false
    if (f.urgencies.length) {
      const level = getUrgency(getTaskDeadline(t), t.status).level
      if (!f.urgencies.includes(level)) return false
    }
    return true
  })
}

export function taskBelongsToMember(task: Task, memberId: string): boolean {
  const ids = (task.assignee_ids && task.assignee_ids.length ? task.assignee_ids : [task.assigned_to]).filter(Boolean)
  return ids.includes(memberId)
}

// ---- Table sorting ---------------------------------------------------------

export type TableSortKey = 'deadline' | 'priority' | 'status' | 'member' | 'title'
export type SortDir = 'asc' | 'desc'

const PRIORITY_RANK: Record<Priority, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 }
const STATUS_RANK: Record<TaskStatus, number> = { ASSIGNED: 0, IN_EDIT: 1, DONE: 2, REJECTED: 3, APPROVED: 4 }

export function sortTasks(tasks: Task[], key: TableSortKey, dir: SortDir, memberName: (id: string | undefined) => string): Task[] {
  const factor = dir === 'asc' ? 1 : -1
  const copy = [...tasks]
  copy.sort((a, b) => {
    let d = 0
    switch (key) {
      case 'deadline': {
        const da = getTaskDeadline(a)
        const db = getTaskDeadline(b)
        d = (da ? new Date(da).getTime() : Infinity) - (db ? new Date(db).getTime() : Infinity)
        break
      }
      case 'priority':
        d = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
        break
      case 'status':
        d = STATUS_RANK[a.status] - STATUS_RANK[b.status]
        break
      case 'member':
        d = memberName(a.assigned_to).localeCompare(memberName(b.assigned_to))
        break
      case 'title':
        d = a.title.localeCompare(b.title)
        break
    }
    return d * factor
  })
  return copy
}

// ---- Persistence (per board, localStorage) ---------------------------------

export interface BoardViewState {
  view: BoardViewMode
  selectedMemberIds: string[]
  filters: BoardFilters
}

const key = (boardId: string) => `safari:boardview:${boardId}`

export function loadBoardViewState(boardId: string): Partial<BoardViewState> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key(boardId))
    return raw ? (JSON.parse(raw) as Partial<BoardViewState>) : null
  } catch {
    return null
  }
}

export function saveBoardViewState(boardId: string, state: BoardViewState): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key(boardId), JSON.stringify(state))
  } catch {
    /* ignore quota / private mode */
  }
}

// ---- Per-user column order (columns view) ----------------------------------
// Personalised, not shared: each user arranges their own columns. Keyed by
// user + board so shared devices don't collide. Default order is computed
// elsewhere (own column first, then alphabetical); this only stores an
// explicit drag arrangement as a list of member ids.

const colKey = (userId: string, boardId: string) => `safari:boardcols:${userId}:${boardId}`

export function loadColumnOrder(userId: string, boardId: string): string[] | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(colKey(userId, boardId))
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? (parsed as string[]) : null
  } catch {
    return null
  }
}

export function saveColumnOrder(userId: string, boardId: string, order: string[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(colKey(userId, boardId), JSON.stringify(order))
  } catch {
    /* ignore quota / private mode */
  }
}
