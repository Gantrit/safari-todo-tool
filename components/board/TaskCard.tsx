'use client'

import { useState } from 'react'
import { Task, Profile } from '@/lib/types'
import { getInitials, getUrgency, isNearDeadline, taskAccentColor, canDeleteTask } from '@/lib/utils'
import PriorityBadge from '../ui/PriorityBadge'
import StatusBadge from '../ui/StatusBadge'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Bell, CheckSquare, ChevronRight, Link2, Maximize2, MessageSquare, Paperclip, Repeat, Trash2 } from 'lucide-react'
import { getTaskDeadline } from '@/lib/types'

interface TaskCardProps {
  task: Task
  onClick: (task: Task) => void
  currentUser: Profile
  onDelete: (task: Task) => void
  showAssignee?: boolean
  draggable?: boolean
}

export default function TaskCard({ task, onClick, currentUser, onDelete, showAssignee = false, draggable = true }: TaskCardProps) {
  const [expanded, setExpanded] = useState(false)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const deadline = getTaskDeadline(task)
  const urgency = getUrgency(deadline, task.status)
  const barColor = taskAccentColor(task.status, task.priority)
  const canDelete = canDeleteTask(task, currentUser)

  const checklist = task.checklist_items || task.subtasks || []
  const subtaskCount = checklist.length
  const doneSubtasks = checklist.filter((s) => s.done).length
  const commentCount = task.comments?.length || 0
  const attachmentCount = task.attachments?.length || 0
  const assignees = task.assignee_profiles || (task.assigned_profile ? [task.assigned_profile] : [])
  const isImminent = isNearDeadline(deadline, task.status)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`task-row group ${expanded ? 'is-open' : ''} ${isImminent ? 'is-imminent' : ''} ${task.status === 'APPROVED' ? 'is-done' : ''}`}
    >
      <div className="task-row-head">
        {/* Colour bar = combined status/priority; also the drag handle when draggable */}
        <span
          {...(draggable ? attributes : {})}
          {...(draggable ? listeners : {})}
          className="task-row-bar"
          style={{ background: barColor, cursor: draggable ? undefined : 'default' }}
          aria-label={draggable ? 'Drag task' : undefined}
          title={draggable ? 'Drag to move' : undefined}
        />

        <button
          type="button"
          className="task-row-toggle"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse task' : 'Expand task'}
        >
          <ChevronRight size={13} />
        </button>

        <button type="button" className="task-row-title" onClick={() => setExpanded((v) => !v)}>
          {task.title}
        </button>

        {showAssignee && assignees.length > 0 && (
          <span className="flex flex-none items-center gap-1.5" title={assignees.map((a) => a.full_name || a.email).join(', ')}>
            <span className="flex h-5 w-5 items-center justify-center rounded-full text-[8px] font-extrabold" style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--border-strong)' }}>
              {getInitials(assignees[0].full_name || assignees[0].email)}
            </span>
            {assignees.length > 1 && <span className="text-[10px] font-bold" style={{ color: 'var(--muted)' }}>+{assignees.length - 1}</span>}
          </span>
        )}

        {urgency.level !== 'none' && (
          <span className="urgency-chip" style={{ color: urgency.color, background: urgency.bg }}>
            {urgency.label}
          </span>
        )}

        <div className="task-row-actions">
          <button type="button" className="task-row-action" onClick={() => onClick(task)} aria-label="Open task details" title="Open details">
            <Maximize2 size={13} />
          </button>
          {canDelete && (
            <button type="button" className="task-row-action is-danger" onClick={() => onDelete(task)} aria-label="Delete task" title="Delete task">
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      <div className={`task-row-collapse ${expanded ? 'is-open' : ''}`}>
        <div className="task-row-collapse-inner">
          <div className="task-row-body">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <StatusBadge status={task.status} />
              <PriorityBadge priority={task.priority} />
              {(task.recurring_enabled || task.recurring_frequency) && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: 'var(--accent)' }}><Repeat size={11} /> Recurring</span>
              )}
            </div>

            {task.description && (
              <p className="mb-3 text-[12.5px] leading-6" style={{ color: 'var(--text-secondary)' }}>{task.description}</p>
            )}

            {task.labels && task.labels.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {task.labels.map((label, i) => (
                  <span key={i} className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)' }}>{label}</span>
                ))}
              </div>
            )}

            {subtaskCount > 0 && (
              <div className="mb-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: 'var(--muted)' }}>
                  <CheckSquare size={12} /> Checklist · {doneSubtasks}/{subtaskCount}
                </div>
                <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--surface3)' }}>
                  <div className="h-full rounded-full" style={{ width: `${subtaskCount ? (doneSubtasks / subtaskCount) * 100 : 0}%`, background: 'var(--accent)' }} />
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {assignees.length > 0 && (
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-1.5">
                    {assignees.slice(0, 4).map((assignee) => (
                      <span key={assignee.id} className="flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-extrabold ring-2 ring-[var(--surface)]" style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--border-strong)' }} title={assignee.full_name || assignee.email}>
                        {getInitials(assignee.full_name || assignee.email)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {(task.remind_3d || task.remind_24h) && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: 'var(--muted)' }}>
                  <Bell size={11} /> {[task.remind_3d && '3d', task.remind_24h && '24h'].filter(Boolean).join(' · ')}
                </span>
              )}
              {commentCount > 0 && <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: 'var(--muted)' }}><MessageSquare size={11} /> {commentCount}</span>}
              {attachmentCount > 0 && <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: 'var(--muted)' }}><Paperclip size={11} /> {attachmentCount}</span>}
              {(task.reference_url || task.google_drive_url) && (
                <a href={task.reference_url || task.google_drive_url || '#'} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: 'var(--blue)' }}><Link2 size={11} /> Reference</a>
              )}
              <button type="button" onClick={() => onClick(task)} className="btn btn-secondary ml-auto !min-h-8 !px-3 !text-[11px]">Open details</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
