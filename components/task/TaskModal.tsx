'use client'

import { useState } from 'react'
import { Task, TaskStatus, Profile } from '@/lib/types'
import Modal from '../ui/Modal'
import StatusBadge from '../ui/StatusBadge'
import PriorityBadge from '../ui/PriorityBadge'
import { formatDate, formatRelative, getInitials } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { ExternalLink, FolderOpen, Plus, Check, ChevronRight } from 'lucide-react'
import CommentSection from './CommentSection'
import SubtaskList from './SubtaskList'

interface TaskModalProps {
  task: Task
  currentUser: Profile
  members: Profile[]
  onClose: () => void
  onUpdate: (task: Task) => void
}

const STATUS_FLOW: Record<TaskStatus, TaskStatus | null> = {
  NOTICED: 'IN_EDIT',
  IN_EDIT: 'DONE',
  DONE: 'APPROVED',
  APPROVED: null,
}

export default function TaskModal({ task, currentUser, members, onClose, onUpdate }: TaskModalProps) {
  const [updating, setUpdating] = useState(false)
  const [resultUrl, setResultUrl] = useState(task.result_url || '')
  const [showResultInput, setShowResultInput] = useState(false)
  const supabase = createClient()

  const isAdmin = currentUser.role === 'admin'
  const canAdvanceStatus = () => {
    if (task.status === 'APPROVED') return false
    if (task.status === 'DONE' && !isAdmin) return false
    return true
  }

  async function advanceStatus() {
    const next = STATUS_FLOW[task.status]
    if (!next) return
    setUpdating(true)

    const { data, error } = await supabase
      .from('tasks')
      .update({ status: next })
      .eq('id', task.id)
      .select('*, assigned_profile:profiles!tasks_assigned_to_fkey(*), creator_profile:profiles!tasks_created_by_fkey(*)')
      .single()

    if (!error && data) {
      // Award XP on APPROVED
      if (next === 'APPROVED' && !task.xp_awarded) {
        const xpMap = { LOW: 5, MEDIUM: 10, HIGH: 20 }
        const xp = xpMap[task.priority]
        await supabase.rpc('award_xp', { p_user_id: task.assigned_to, p_amount: xp, p_reason: 'Task approved', p_task_id: task.id })
        await supabase.from('tasks').update({ xp_awarded: true }).eq('id', task.id)
        await supabase.from('archive').insert({ task_id: task.id, user_id: task.assigned_to })
      }
      onUpdate(data as Task)
    }
    setUpdating(false)
  }

  async function submitResult() {
    if (!resultUrl.trim()) return
    setUpdating(true)
    const { data } = await supabase
      .from('tasks')
      .update({ result_url: resultUrl.trim() })
      .eq('id', task.id)
      .select('*, assigned_profile:profiles!tasks_assigned_to_fkey(*)')
      .single()

    if (data) onUpdate(data as Task)
    setShowResultInput(false)
    setUpdating(false)
  }

  const nextStatus = STATUS_FLOW[task.status]

  return (
    <Modal open={true} onClose={onClose} size="xl">
      <div className="flex h-full" style={{ minHeight: '500px' }}>
        {/* Main content */}
        <div className="flex-1 p-6 overflow-y-auto border-r" style={{ borderColor: 'var(--border)' }}>
          {/* Header */}
          <div className="mb-4">
            <div className="flex items-start gap-2 mb-3">
              <div className="flex-1">
                <h2
                  className="text-lg font-bold leading-snug"
                  style={{
                    fontFamily: 'Syne, sans-serif',
                    color: 'var(--text)',
                    textDecoration: task.status === 'APPROVED' ? 'line-through' : 'none',
                    opacity: task.status === 'APPROVED' ? 0.6 : 1,
                  }}
                >
                  {task.title}
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={task.status} />
              <PriorityBadge priority={task.priority} />
              {task.labels?.map((label, i) => (
                <span
                  key={i}
                  className="text-xs px-2 py-0.5 rounded"
                  style={{ background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)' }}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Description */}
          {task.description && (
            <div className="mb-5">
              <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--muted)' }}>Description</p>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text)' }}>{task.description}</p>
            </div>
          )}

          {/* Subtasks */}
          <div className="mb-5">
            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--muted)' }}>Subtasks</p>
            <SubtaskList taskId={task.id} subtasks={task.subtasks || []} members={members} currentUser={currentUser} />
          </div>

          {/* Attachments */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Attachments</p>
              {task.google_drive_url && (
                <a
                  href={task.google_drive_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs hover:opacity-70 transition-opacity"
                  style={{ color: 'var(--accent)' }}
                >
                  <FolderOpen size={12} />
                  Drive
                </a>
              )}
            </div>
            <div className="space-y-1.5">
              {(task.attachments || []).map((att) => (
                <a
                  key={att.id}
                  href={att.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm hover:opacity-70 transition-opacity"
                  style={{ color: 'var(--blue)' }}
                >
                  <ExternalLink size={12} />
                  {att.label || att.url}
                </a>
              ))}
            </div>
          </div>

          {/* Result URL */}
          <div className="mb-5">
            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--muted)' }}>Result</p>
            {task.result_url && !showResultInput ? (
              <div className="flex items-center gap-2">
                <a
                  href={task.result_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm hover:opacity-70 transition-opacity"
                  style={{ color: 'var(--accent)' }}
                >
                  {task.result_url}
                </a>
                <button onClick={() => setShowResultInput(true)} className="text-xs" style={{ color: 'var(--muted)' }}>
                  Edit
                </button>
              </div>
            ) : showResultInput ? (
              <div className="flex gap-2">
                <input
                  value={resultUrl}
                  onChange={(e) => setResultUrl(e.target.value)}
                  placeholder="https://..."
                  className="flex-1 px-3 py-1.5 text-sm rounded-[8px] outline-none"
                  style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
                <button
                  onClick={submitResult}
                  className="px-3 py-1.5 text-sm rounded-[8px]"
                  style={{ background: 'var(--accent)', color: '#0e0e0e' }}
                >
                  Save
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowResultInput(true)}
                className="flex items-center gap-1.5 text-sm hover:opacity-70 transition-opacity"
                style={{ color: 'var(--muted)' }}
              >
                <Plus size={12} />
                Add result link
              </button>
            )}
          </div>

          {/* Comments */}
          <CommentSection taskId={task.id} comments={task.comments || []} currentUser={currentUser} />
        </div>

        {/* Sidebar */}
        <div className="w-56 p-5 flex-shrink-0">
          {/* Status advance */}
          {canAdvanceStatus() && nextStatus && (
            <button
              onClick={advanceStatus}
              disabled={updating}
              className="w-full py-2 text-sm font-semibold rounded-[8px] mb-4 flex items-center justify-center gap-1.5 disabled:opacity-50 transition-opacity"
              style={{ background: 'var(--accent)', color: '#0e0e0e' }}
            >
              <ChevronRight size={14} />
              {nextStatus === 'APPROVED' ? 'Approve' : `Mark ${nextStatus.replace('_', ' ')}`}
            </button>
          )}

          <div className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>Assigned To</p>
              {task.assigned_profile && (
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ background: 'var(--accent)', color: '#0e0e0e' }}
                  >
                    {getInitials(task.assigned_profile.full_name || task.assigned_profile.email)}
                  </div>
                  <span className="text-sm" style={{ color: 'var(--text)' }}>
                    {task.assigned_profile.full_name || task.assigned_profile.email}
                  </span>
                </div>
              )}
            </div>

            <div>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>Created By</p>
              {task.creator_profile && (
                <span className="text-sm" style={{ color: 'var(--text)' }}>
                  {task.creator_profile.full_name || task.creator_profile.email}
                </span>
              )}
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                {formatRelative(task.created_at)}
              </p>
            </div>

            {task.due_date && (
              <div>
                <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>Due Date</p>
                <p className="text-sm" style={{ color: 'var(--text)' }}>{formatDate(task.due_date)}</p>
              </div>
            )}

            <div>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>Section</p>
              <p className="text-sm" style={{ color: 'var(--text)' }}>{task.section}</p>
            </div>

            <div>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>Reminders</p>
              <div className="space-y-1">
                <p className="text-xs" style={{ color: task.remind_3d ? 'var(--accent)' : 'var(--muted)' }}>
                  {task.remind_3d ? '✓' : '○'} 3 days before
                </p>
                <p className="text-xs" style={{ color: task.remind_24h ? 'var(--accent)' : 'var(--muted)' }}>
                  {task.remind_24h ? '✓' : '○'} 24h before
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}
