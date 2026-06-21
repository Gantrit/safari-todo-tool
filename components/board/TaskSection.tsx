'use client'

import { useState } from 'react'
import { Task, TaskSection as TSectionType } from '@/lib/types'
import { ChevronRight, Plus } from 'lucide-react'
import TaskCard from './TaskCard'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'

interface TaskSectionProps {
  section: TSectionType
  tasks: Task[]
  onTaskClick: (task: Task) => void
  onAddTask: () => void
  memberId: string
}

const SECTION_LABELS: Record<TSectionType, { label: string; color: string }> = {
  DAILY: { label: 'Daily To-Dos', color: 'var(--text)' },
  IMMINENT: { label: 'Imminent', color: 'var(--accent)' },
  WEEKLY: { label: 'Weekly To-Dos', color: 'var(--blue)' },
  MONTHLY: { label: 'Monthly To-Dos', color: 'var(--purple)' },
}

export default function TaskSection({ section, tasks, onTaskClick, onAddTask, memberId }: TaskSectionProps) {
  const [collapsed, setCollapsed] = useState(false)
  const { label, color } = SECTION_LABELS[section]
  const { setNodeRef, isOver } = useDroppable({ id: `section:${memberId}:${section}` })

  return (
    <section className="mb-5">
      <div className="flex items-center gap-2 border-b pb-2" style={{ borderColor: 'var(--border)' }}>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex min-h-8 flex-1 items-center gap-2 rounded text-left transition-opacity hover:opacity-70"
      >
        <ChevronRight
          size={12}
          style={{
            color: 'var(--muted)',
            transform: collapsed ? 'none' : 'rotate(90deg)',
            transition: 'transform 0.2s',
          }}
        />
        <span className="text-[10.5px] font-extrabold uppercase tracking-[.11em]" style={{ color }}>
          {label}
        </span>
        <span
          className="ml-auto min-w-6 rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold"
          style={{ background: 'var(--surface2)', color: 'var(--muted)' }}
        >
          {tasks.length}
        </span>
      </button>
      <button onClick={onAddTask} className="flex h-8 w-8 flex-none items-center justify-center rounded-[7px] border transition-colors hover:bg-white/5" style={{ color: 'var(--muted)', borderColor: 'var(--border)' }} aria-label={`Add ${label} task`}><Plus size={13} /></button>
      </div>

      {!collapsed && (
        <div ref={setNodeRef} className="mt-3 min-h-12 space-y-2.5 rounded-[10px] transition-colors" style={{ background: isOver ? 'var(--accent-dim)' : undefined }}>
          <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            {tasks.map((task) => (
              <TaskCard key={task.id} task={task} onClick={onTaskClick} />
            ))}
            {tasks.length === 0 && <button onClick={onAddTask} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-[9px] border border-dashed text-[11px] font-semibold transition-colors hover:bg-white/[.025]" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}><Plus size={12} /> Add {label.toLowerCase()} task</button>}
          </SortableContext>
        </div>
      )}
    </section>
  )
}
