'use client'

import { useEffect, useState } from 'react'
import { Task, TaskSection as TSectionType, Profile, canWriteTasks } from '@/lib/types'
import { ChevronRight, Plus } from 'lucide-react'
import TaskCard from './TaskCard'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'

interface TaskSectionProps {
  section: TSectionType
  tasks: Task[]
  onTaskClick: (task: Task) => void
  onAddTask: () => void
  onQuickAdd: (memberId: string, section: TSectionType, title: string) => void
  onDelete: (task: Task) => void
  currentUser: Profile
  memberId: string
}

const SECTION_LABELS: Record<TSectionType, { label: string; color: string }> = {
  DAILY: { label: 'Daily To-Dos', color: 'var(--text)' },
  WEEKLY: { label: 'Weekly To-Dos', color: 'var(--blue)' },
  MONTHLY: { label: 'Monthly To-Dos', color: 'var(--purple)' },
}

export default function TaskSection({ section, tasks, onTaskClick, onAddTask, onQuickAdd, onDelete, currentUser, memberId }: TaskSectionProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [manuallyOpened, setManuallyOpened] = useState(false)
  const [quickTitle, setQuickTitle] = useState('')

  // Once real tasks land, the "manually opened" override has done its job —
  // reset it so the section correctly collapses back to a chip if it empties
  // out again later (e.g. the task gets approved/archived or deleted elsewhere).
  useEffect(() => {
    if (tasks.length > 0 && manuallyOpened) setManuallyOpened(false)
  }, [tasks.length, manuallyOpened])
  const { label, color } = SECTION_LABELS[section]
  const { setNodeRef, isOver } = useDroppable({ id: `section:${memberId}:${section}` })
  const canWrite = canWriteTasks(currentUser.role)

  const submitQuickAdd = () => {
    const title = quickTitle.trim()
    if (!title) return
    onQuickAdd(memberId, section, title)
    setQuickTitle('')
  }

  // Days with nothing planned in a section are common — collapse it to a slim
  // "+ Section" chip instead of an empty header/card-stack taking up space.
  if (tasks.length === 0 && !manuallyOpened) {
    if (!canWrite) return null
    return (
      <button
        ref={setNodeRef}
        type="button"
        onClick={() => setManuallyOpened(true)}
        className="mb-2 flex h-8 w-full items-center gap-2 rounded-[8px] border border-dashed px-2.5 text-left transition-colors hover:bg-[var(--surface3)] last:mb-0"
        style={{ borderColor: isOver ? 'var(--accent)' : 'var(--border)', background: isOver ? 'var(--accent-dim)' : undefined }}
        aria-label={`Add a ${label} task`}
      >
        <Plus size={12} style={{ color: 'var(--muted)' }} />
        <span className="text-[10.5px] font-extrabold uppercase tracking-[.11em]" style={{ color: 'var(--muted)' }}>{label}</span>
      </button>
    )
  }

  return (
    <section className="task-section-surface last:mb-0">
      <div className="task-section-header">
        <button
          onClick={() => (tasks.length === 0 ? setManuallyOpened(false) : setCollapsed(!collapsed))}
          className="flex min-h-10 flex-1 items-center gap-2.5 rounded-[8px] px-2 text-left transition-colors hover:bg-[var(--surface3)]"
        >
          <ChevronRight
            size={12}
            style={{ color: 'var(--muted)', transform: collapsed ? 'none' : 'rotate(90deg)', transition: 'transform 0.2s' }}
          />
          <span className="text-[10.5px] font-extrabold uppercase tracking-[.11em]" style={{ color }}>
            {label}
          </span>
          <span className="ml-auto min-w-6 rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold" style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>
            {tasks.length}
          </span>
        </button>
        {canWrite && <button onClick={onAddTask} className="flex h-8 w-8 flex-none items-center justify-center rounded-[7px] transition-colors hover:bg-white/5 hover:text-[var(--text)]" style={{ color: 'var(--muted)' }} aria-label={`Open full form for ${label}`} title="Create task with full form"><Plus size={14} /></button>}
      </div>

      {!collapsed && (
        <div ref={setNodeRef} className="task-card-stack rounded-[11px] transition-colors" style={{ background: isOver ? 'var(--accent-dim)' : undefined }}>
          <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            {tasks.map((task) => (
              <TaskCard key={task.id} task={task} onClick={onTaskClick} currentUser={currentUser} onDelete={onDelete} />
            ))}
          </SortableContext>

          {/* Quick add — type a title, press Enter to create with sensible defaults */}
          {canWrite && <div className="quick-add">
            <Plus size={14} style={{ color: 'var(--muted)', flex: 'none' }} />
            <input
              value={quickTitle}
              onChange={(e) => setQuickTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); submitQuickAdd() }
                if (e.key === 'Escape') setQuickTitle('')
              }}
              className="quick-add-input"
              placeholder="Add a task…"
              aria-label={`Quick add task to ${label}`}
            />
            {quickTitle.trim() ? (
              <button type="button" onClick={submitQuickAdd} className="quick-add-hint" style={{ color: 'var(--accent)', borderColor: 'var(--accent-line)' }}>Enter ↵</button>
            ) : (
              <span className="quick-add-hint">↵</span>
            )}
          </div>}
        </div>
      )}
    </section>
  )
}
