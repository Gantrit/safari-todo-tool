'use client'

import { useState } from 'react'
import { Task, TaskSection as TSectionType } from '@/lib/types'
import { ChevronRight } from 'lucide-react'
import TaskCard from './TaskCard'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'

interface TaskSectionProps {
  section: TSectionType
  tasks: Task[]
  onTaskClick: (task: Task) => void
}

const SECTION_LABELS: Record<TSectionType, { label: string; color: string }> = {
  DAILY: { label: 'Daily To-Dos', color: 'var(--text)' },
  IMMINENT: { label: 'Imminent', color: 'var(--accent)' },
  WEEKLY: { label: 'Weekly To-Dos', color: 'var(--blue)' },
  MONTHLY: { label: 'Monthly To-Dos', color: 'var(--purple)' },
}

export default function TaskSection({ section, tasks, onTaskClick }: TaskSectionProps) {
  const [collapsed, setCollapsed] = useState(false)
  const { label, color } = SECTION_LABELS[section]
  const { setNodeRef } = useDroppable({ id: `section-${section}` })

  return (
    <div className="mb-3">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-1.5 py-1.5 px-1 rounded transition-opacity hover:opacity-70"
      >
        <ChevronRight
          size={12}
          style={{
            color: 'var(--muted)',
            transform: collapsed ? 'none' : 'rotate(90deg)',
            transition: 'transform 0.2s',
          }}
        />
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color }}>
          {label}
        </span>
        <span
          className="ml-auto text-xs px-1.5 py-0.5 rounded-full"
          style={{ background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}
        >
          {tasks.length}
        </span>
      </button>

      {!collapsed && (
        <div ref={setNodeRef} className="mt-1 space-y-1.5 min-h-[2px]">
          <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            {tasks.map((task) => (
              <TaskCard key={task.id} task={task} onClick={onTaskClick} />
            ))}
          </SortableContext>
        </div>
      )}
    </div>
  )
}
