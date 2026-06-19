'use client'

import { Task } from '@/lib/types'
import { formatDate, isOverdue, daysUntilDue, getInitials } from '@/lib/utils'
import PriorityBadge from '../ui/PriorityBadge'
import StatusBadge from '../ui/StatusBadge'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Calendar, MessageSquare, Paperclip, CheckSquare } from 'lucide-react'

interface TaskCardProps {
  task: Task
  onClick: (task: Task) => void
}

export default function TaskCard({ task, onClick }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const overdue = isOverdue(task.due_date)
  const days = daysUntilDue(task.due_date)
  const subtaskCount = task.subtasks?.length || 0
  const doneSubtasks = task.subtasks?.filter((s) => s.done).length || 0
  const commentCount = task.comments?.length || 0
  const attachmentCount = task.attachments?.length || 0

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => onClick(task)}
      className="rounded-[8px] p-3 cursor-pointer transition-all hover:opacity-90 active:scale-[0.99]"
      style={{
        ...style,
        background: 'var(--surface2)',
        border: '1px solid var(--border)',
      }}
    >
      {/* Labels */}
      {task.labels && task.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {task.labels.slice(0, 3).map((label, i) => (
            <span
              key={i}
              className="text-xs px-1.5 py-0.5 rounded"
              style={{ background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}
            >
              {label}
            </span>
          ))}
        </div>
      )}

      {/* Title */}
      <p
        className="text-sm font-medium mb-2 leading-snug"
        style={{
          color: 'var(--text)',
          textDecoration: task.status === 'APPROVED' ? 'line-through' : 'none',
          opacity: task.status === 'APPROVED' ? 0.5 : 1,
        }}
      >
        {task.title}
      </p>

      {/* Status + Priority */}
      <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
        <StatusBadge status={task.status} />
        <PriorityBadge priority={task.priority} />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {task.due_date && (
            <span
              className="flex items-center gap-1 text-xs"
              style={{ color: overdue ? 'var(--red)' : days !== null && days <= 3 ? 'var(--amber)' : 'var(--muted)' }}
            >
              <Calendar size={10} />
              {formatDate(task.due_date)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {subtaskCount > 0 && (
            <span className="flex items-center gap-0.5 text-xs" style={{ color: 'var(--muted)' }}>
              <CheckSquare size={10} />
              {doneSubtasks}/{subtaskCount}
            </span>
          )}
          {commentCount > 0 && (
            <span className="flex items-center gap-0.5 text-xs" style={{ color: 'var(--muted)' }}>
              <MessageSquare size={10} />
              {commentCount}
            </span>
          )}
          {attachmentCount > 0 && (
            <span className="flex items-center gap-0.5 text-xs" style={{ color: 'var(--muted)' }}>
              <Paperclip size={10} />
              {attachmentCount}
            </span>
          )}
          {task.assigned_profile && (
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ background: 'var(--accent)', color: '#0e0e0e' }}
              title={task.assigned_profile.full_name}
            >
              {getInitials(task.assigned_profile.full_name || task.assigned_profile.email)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
