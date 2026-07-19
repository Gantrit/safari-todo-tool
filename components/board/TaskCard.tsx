'use client'

import { useEffect, useState } from 'react'
import { Task, Profile, Subtask, ChecklistItem } from '@/lib/types'
import { getInitials, getUrgency, isNearDeadline, taskAccentColor, canDeleteTask } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { toastError } from '@/lib/toast'
import PriorityBadge from '../ui/PriorityBadge'
import StatusBadge from '../ui/StatusBadge'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Bell, Check, CheckSquare, ChevronDown, ChevronRight, Link2, Maximize2, MessageSquare, Paperclip, Repeat, Trash2 } from 'lucide-react'
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
  const [checklistOpen, setChecklistOpen] = useState(false)
  const [items, setItems] = useState<Array<Subtask | ChecklistItem>>(() => task.checklist_items || task.subtasks || [])
  const supabase = createClient()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })

  // Reseed local checklist when the task object changes (e.g. after an edit refetch).
  useEffect(() => { setItems(task.checklist_items || task.subtasks || []) }, [task.checklist_items, task.subtasks])

  async function toggleItem(id: string, done: boolean) {
    if (!id) return
    setItems((prev) => prev.map((s) => (s.id === id ? { ...s, done: !done } : s)))
    const { error } = await supabase.from('checklist_items').update({ done: !done }).eq('id', id)
    if (error) {
      const fallback = await supabase.from('subtasks').update({ done: !done }).eq('id', id)
      if (fallback.error) {
        // Revert the optimistic flip and say why — otherwise the checkbox lies.
        setItems((prev) => prev.map((s) => (s.id === id ? { ...s, done } : s)))
        toastError(fallback.error.message || 'Checklist update failed.')
      }
    }
  }

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const deadline = getTaskDeadline(task)
  const urgency = getUrgency(deadline, task.status)
  const barColor = taskAccentColor(task.status, task.priority)
  const canDelete = canDeleteTask(task, currentUser)

  const subtaskCount = items.length
  const doneSubtasks = items.filter((s) => s.done).length
  const checklistPct = subtaskCount ? Math.round((doneSubtasks / subtaskCount) * 100) : 0
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

            {subtaskCount > 0 && (
              <div className="mb-3">
                <button
                  type="button"
                  onClick={() => setChecklistOpen((v) => !v)}
                  className="mb-1.5 flex w-full items-center gap-1.5 text-[11px] font-semibold transition-colors hover:text-[var(--text)]"
                  style={{ color: 'var(--muted)' }}
                  aria-expanded={checklistOpen}
                >
                  <CheckSquare size={12} /> Checklist · {doneSubtasks}/{subtaskCount}
                  <span className="ml-1 font-bold" style={{ color: checklistPct === 100 ? 'var(--green)' : 'var(--muted)' }}>{checklistPct}%</span>
                  <ChevronDown size={12} className="ml-auto transition-transform" style={{ transform: checklistOpen ? 'rotate(180deg)' : 'none' }} />
                </button>
                <div className="h-2 overflow-hidden rounded-full" style={{ background: 'var(--surface3)' }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${checklistPct}%`, background: 'var(--green)' }} />
                </div>
                {checklistOpen && (
                  <div className="mt-2.5 space-y-1.5">
                    {items.map((item) => (
                      <button
                        key={item.id || item.title}
                        type="button"
                        onClick={() => toggleItem(item.id, item.done)}
                        disabled={!item.id}
                        className="flex w-full items-center gap-2.5 rounded-[8px] border px-2.5 py-2 text-left transition-colors hover:border-[var(--border-strong)] disabled:cursor-default"
                        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                      >
                        <span
                          className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-[4px]"
                          style={{ background: item.done ? 'var(--green)' : 'transparent', border: `1px solid ${item.done ? 'var(--green)' : 'var(--border-strong)'}` }}
                        >
                          {item.done && <Check size={9} color="#071007" />}
                        </span>
                        <span className="flex-1 text-[12px] leading-4" style={{ color: 'var(--text)', textDecoration: item.done ? 'line-through' : 'none', opacity: item.done ? 0.55 : 1 }}>
                          {item.title}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
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
