'use client'

import { useMemo, useState } from 'react'
import { Task, Profile } from '@/lib/types'
import { sortTasks, TableSortKey, SortDir } from '@/lib/boardViews'
import TaskCard from './TaskCard'
import EmptyState from '../ui/EmptyState'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { ArrowDown, ArrowUp, ClipboardList } from 'lucide-react'

interface TableViewProps {
  tasks: Task[]
  members: Profile[]
  currentUser: Profile
  onTaskClick: (task: Task) => void
  onDelete: (task: Task) => void
}

const SORT_KEYS: { key: TableSortKey; label: string }[] = [
  { key: 'deadline', label: 'Deadline' },
  { key: 'priority', label: 'Priority' },
  { key: 'status', label: 'Status' },
  { key: 'member', label: 'Member' },
  { key: 'title', label: 'Title' },
]

export default function TableView({ tasks, members, currentUser, onTaskClick, onDelete }: TableViewProps) {
  const [sortKey, setSortKey] = useState<TableSortKey>('deadline')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const memberName = useMemo(() => {
    const map = new Map(members.map((m) => [m.id, m.full_name || m.email]))
    return (id: string | undefined) => (id ? map.get(id) || '' : '')
  }, [members])

  const sorted = useMemo(() => sortTasks(tasks, sortKey, sortDir, memberName), [tasks, sortKey, sortDir, memberName])

  const onSort = (key: TableSortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  return (
    <div className="board-stack">
      <div className="board-list-toolbar">
        <span className="text-[11px] font-bold uppercase tracking-[.08em]" style={{ color: 'var(--muted)' }}>Sort by</span>
        {SORT_KEYS.map(({ key, label }) => {
          const active = key === sortKey
          return (
            <button key={key} onClick={() => onSort(key)} className={`filter-chip ${active ? 'is-active' : ''}`}>
              {label}
              {active && (sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
            </button>
          )
        })}
        <span className="ml-auto text-[11px] font-semibold" style={{ color: 'var(--muted)' }}>{tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}</span>
      </div>

      {sorted.length === 0 ? (
        <div className="app-card">
          <EmptyState tone="muted" icon={<ClipboardList size={22} />} title="No tasks match" text="Nothing here with the current filters. Adjust or clear them to see more." />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <SortableContext items={sorted.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            {sorted.map((task) => (
              <TaskCard key={task.id} task={task} onClick={onTaskClick} currentUser={currentUser} onDelete={onDelete} showAssignee />
            ))}
          </SortableContext>
        </div>
      )}
    </div>
  )
}
