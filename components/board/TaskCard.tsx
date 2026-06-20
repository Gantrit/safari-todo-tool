'use client'

import { Task } from '@/lib/types'
import { deadlineLabel, getInitials, isOverdue, daysUntilDue, noticeSlaMissed } from '@/lib/utils'
import PriorityBadge from '../ui/PriorityBadge'
import StatusBadge from '../ui/StatusBadge'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AlertTriangle, Calendar, Link2, MessageSquare, Paperclip, Repeat, CheckSquare } from 'lucide-react'
import { getTaskDeadline } from '@/lib/types'

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

  const deadline = getTaskDeadline(task)
  const overdue = isOverdue(deadline) && !['APPROVED'].includes(task.status)
  const days = daysUntilDue(deadline)
  const checklist = task.checklist_items || task.subtasks || []
  const subtaskCount = checklist.length
  const doneSubtasks = checklist.filter((s) => s.done).length
  const commentCount = task.comments?.length || 0
  const attachmentCount = task.attachments?.length || 0
  const slaMissed = noticeSlaMissed(task.created_at, task.status, task.noticed_at)
  const assignees = task.assignee_profiles || (task.assigned_profile ? [task.assigned_profile] : [])

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => onClick(task)}
      className="cursor-pointer rounded-[10px] p-4 transition-colors hover:border-[var(--border-strong)]"
      style={{
        ...style,
        background: 'var(--surface2)',
        border: `1px solid ${overdue || slaMissed ? 'rgba(255,98,98,0.45)' : task.section === 'IMMINENT' ? 'var(--border-strong)' : 'var(--border)'}`,
        boxShadow: task.section === 'IMMINENT' ? '0 0 0 1px var(--accent-dim), inset 3px 0 0 var(--accent)' : undefined,
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

      {(overdue || slaMissed || task.needs_clarification) && (
        <div className="mb-2 flex flex-wrap gap-1">
          {overdue && <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold" style={{ color: 'var(--red)', border: '1px solid rgba(255,98,98,0.35)' }}><AlertTriangle size={10} />Overdue</span>}
          {slaMissed && <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold" style={{ color: 'var(--red)', border: '1px solid rgba(255,98,98,0.35)' }}>Notice SLA</span>}
          {task.needs_clarification && <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold" style={{ color: 'var(--amber)', border: '1px solid rgba(243,169,79,0.35)' }}>Clarification</span>}
        </div>
      )}

      {/* Status + Priority */}
      <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
        <StatusBadge status={task.status} />
        <PriorityBadge priority={task.priority} />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {deadline && (
            <span
              className="flex items-center gap-1 text-xs"
              style={{ color: overdue ? 'var(--red)' : days !== null && days <= 3 ? 'var(--amber)' : 'var(--muted)' }}
            >
              <Calendar size={10} />
              {deadlineLabel(deadline)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {(task.recurring_enabled || task.recurring_frequency) && (
            <Repeat size={10} style={{ color: 'var(--accent)' }} />
          )}
          {(task.reference_url || task.google_drive_url) && (
            <Link2 size={10} style={{ color: 'var(--blue)' }} />
          )}
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
          {assignees.slice(0, 3).map((assignee) => (
            <div
              key={assignee.id}
              className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ background: 'var(--accent)', color: '#0e0e0e' }}
              title={assignee.full_name || assignee.email}
            >
              {getInitials(assignee.full_name || assignee.email)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
