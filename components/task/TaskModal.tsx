'use client'

import { useState } from 'react'
import { Task, TaskStatus, Profile } from '@/lib/types'
import { celebrateApproval, celebrateTaskDone, feedbackReject, playSound } from '@/lib/gamification'
import Modal from '../ui/Modal'
import StatusBadge from '../ui/StatusBadge'
import PriorityBadge from '../ui/PriorityBadge'
import { deadlineLabel, formatDate, formatRelative, getInitials, isOverdue } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { AlertTriangle, Bell, CalendarDays, ChevronRight, ExternalLink, FolderOpen, Layers3, Link2, ListChecks, MessageSquare, Plus, RotateCcw, UserRound, X, XCircle } from 'lucide-react'
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
  ASSIGNED: 'NOTICED',
  NOTICED: 'IN_EDIT',
  IN_EDIT: 'DONE',
  DONE: null,
  APPROVED: null,
  REJECTED: 'IN_EDIT',
}

export default function TaskModal({ task, currentUser, members, onClose, onUpdate }: TaskModalProps) {
  const [updating, setUpdating] = useState(false)
  const [resultUrl, setResultUrl] = useState(task.result_url || '')
  const [showResultInput, setShowResultInput] = useState(false)
  const [clarificationNote, setClarificationNote] = useState('')
  const supabase = createClient()

  const isAdmin = currentUser.role === 'admin'
  const assigneeIds = task.assignee_ids || [task.assigned_to].filter(Boolean) as string[]
  const isAssignee = assigneeIds.includes(currentUser.id)
  const canAdvanceStatus = () => {
    if (task.status === 'APPROVED') return false
    if (task.status === 'DONE') return false
    return isAdmin || isAssignee || task.created_by === currentUser.id
  }

  async function updateStatus(next: TaskStatus) {
    if (!next) return
    setUpdating(true)

    const patch: Record<string, unknown> = { status: next }
    if (next === 'NOTICED') patch.noticed_at = new Date().toISOString()
    if (next === 'DONE') patch.completed_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('tasks')
      .update(patch)
      .eq('id', task.id)
      .select('*, assigned_profile:profiles!tasks_assigned_to_fkey(*), creator_profile:profiles!tasks_created_by_fkey(*)')
      .single()

    if (!error && data) {
      if (next === 'DONE') celebrateTaskDone()
      else playSound('click')
      onUpdate(data as Task)
    }
    setUpdating(false)
  }

  async function advanceStatus() {
    const next = STATUS_FLOW[task.status]
    if (next) await updateStatus(next)
  }

  async function refetchTask(): Promise<Task | null> {
    const { data } = await supabase
      .from('tasks')
      .select('*, assigned_profile:profiles!tasks_assigned_to_fkey(*), creator_profile:profiles!tasks_created_by_fkey(*)')
      .eq('id', task.id)
      .single()
    return (data as Task) || null
  }

  // Approval, rejection, and reopening run through SECURITY DEFINER RPCs so the
  // XP math, archive entries, and notifications happen atomically server-side.
  async function adminDecision(next: 'APPROVED' | 'REJECTED' | 'IN_EDIT', qualityPenalty = false) {
    setUpdating(true)

    if (next === 'APPROVED') {
      const { data: result, error } = await supabase.rpc('approve_task', { p_task_id: task.id })
      if (!error) {
        const xp = typeof result?.xp_per_assignee === 'number' ? result.xp_per_assignee : undefined
        celebrateApproval(xp)
      }
    } else if (next === 'REJECTED') {
      const { error } = await supabase.rpc('reject_task', { p_task_id: task.id, p_quality_penalty: qualityPenalty })
      if (!error) feedbackReject()
    } else {
      await supabase.rpc('reopen_task', { p_task_id: task.id })
    }

    const fresh = await refetchTask()
    if (fresh) onUpdate(fresh)
    setUpdating(false)
  }

  async function requestClarification() {
    if (!clarificationNote.trim()) return
    setUpdating(true)
    await supabase.from('comments').insert({ task_id: task.id, user_id: currentUser.id, content: `Need clarification: ${clarificationNote.trim()}` })
    const { data } = await supabase
      .from('tasks')
      .update({ needs_clarification: true, clarification_note: clarificationNote.trim(), status: task.status === 'ASSIGNED' ? 'NOTICED' : task.status, noticed_at: task.noticed_at || new Date().toISOString() })
      .eq('id', task.id)
      .select('*, assigned_profile:profiles!tasks_assigned_to_fkey(*), creator_profile:profiles!tasks_created_by_fkey(*)')
      .single()
    if (data) onUpdate(data as Task)
    setClarificationNote('')
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
  const deadline = task.deadline_at || task.due_date || null
  const overdue = isOverdue(deadline) && task.status !== 'APPROVED'
  const assignees = task.assignee_profiles || (task.assigned_profile ? [task.assigned_profile] : [])
  const hasStatusAction = (canAdvanceStatus() && !!nextStatus) || (isAdmin && task.status === 'DONE') || (isAdmin && ['APPROVED', 'REJECTED'].includes(task.status))

  return (
    <Modal open={true} onClose={onClose} size="2xl">
      <article className="min-h-[620px]">
        <header className="flex items-start justify-between gap-6 border-b px-6 py-6 sm:px-9" style={{ borderColor: 'var(--border)' }}>
          <div className="min-w-0 flex-1">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <StatusBadge status={task.status} />
              <PriorityBadge priority={task.priority} />
              {overdue && <span className="inline-flex min-h-6 items-center gap-1.5 rounded-full px-2 text-[10px] font-extrabold uppercase tracking-[.055em]" style={{ color: 'var(--red)', background: 'var(--red-dim)', border: '1px solid rgba(255,98,98,.32)' }}><AlertTriangle size={10} /> Overdue</span>}
            </div>
            <h2 className="max-w-3xl text-[22px] font-extrabold leading-[1.35] tracking-[-.025em] sm:text-[25px]" style={{ color: 'var(--text)', textDecoration: task.status === 'APPROVED' ? 'line-through' : 'none', opacity: task.status === 'APPROVED' ? 0.6 : 1 }}>{task.title}</h2>
            {!!task.labels?.length && <div className="mt-3 flex flex-wrap gap-1.5">{task.labels.map((label, index) => <span key={index} className="rounded-full border px-2.5 py-1 text-[10px] font-bold" style={{ background: 'var(--surface2)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>{label}</span>)}</div>}
          </div>
          <button onClick={onClose} className="icon-button flex-none" aria-label="Close task details"><X size={17} /></button>
        </header>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_310px]">
          <main className="space-y-6 px-5 py-7 sm:px-9 sm:py-8 lg:border-r" style={{ borderColor: 'var(--border)' }}>
            <section className="rounded-[12px] border p-5 sm:p-6" style={{ background: 'var(--surface2)', borderColor: 'var(--border)' }}>
              <SectionHeading icon={<MessageSquare size={14} />} title="Description" />
              {task.description ? <p className="whitespace-pre-wrap text-sm leading-7" style={{ color: 'var(--text-secondary)' }}>{task.description}</p> : <p className="text-sm leading-6" style={{ color: 'var(--muted)' }}>No description has been added.</p>}
            </section>

            <section className="rounded-[12px] border p-5 sm:p-6" style={{ background: 'var(--surface2)', borderColor: 'var(--border)' }}>
              <SectionHeading icon={<ListChecks size={14} />} title="Checklist" meta={`${(task.checklist_items || task.subtasks || []).filter((item) => item.done).length}/${(task.checklist_items || task.subtasks || []).length}`} />
              <SubtaskList taskId={task.id} subtasks={task.checklist_items || task.subtasks || []} members={members} currentUser={currentUser} />
            </section>

            <section className="rounded-[12px] border p-5 sm:p-6" style={{ background: 'var(--surface2)', borderColor: 'var(--border)' }}>
              <SectionHeading icon={<Link2 size={14} />} title="Files & delivery" />
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <p className="mb-3 text-[10px] font-extrabold uppercase tracking-[.1em]" style={{ color: 'var(--muted)' }}>References</p>
                  <div className="space-y-2.5">
                    {(task.reference_url || task.google_drive_url) && <a href={task.reference_url || task.google_drive_url || '#'} target="_blank" rel="noopener noreferrer" className="flex min-h-10 items-center gap-2.5 rounded-[9px] border px-3 text-xs font-semibold transition-colors hover:border-[var(--border-strong)]" style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--accent)' }}><FolderOpen size={14} /> Open reference <ExternalLink className="ml-auto" size={12} /></a>}
                    {(task.attachments || []).map((attachment) => <a key={attachment.id} href={attachment.url} target="_blank" rel="noopener noreferrer" className="flex min-h-10 items-center gap-2.5 rounded-[9px] border px-3 text-xs font-semibold transition-colors hover:border-[var(--border-strong)]" style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--blue)' }}><ExternalLink size={13} /><span className="truncate">{attachment.label || attachment.url}</span></a>)}
                    {!task.reference_url && !task.google_drive_url && !(task.attachments || []).length && <p className="text-xs leading-5" style={{ color: 'var(--muted)' }}>No references or attachments.</p>}
                  </div>
                </div>
                <div>
                  <p className="mb-3 text-[10px] font-extrabold uppercase tracking-[.1em]" style={{ color: 'var(--muted)' }}>Result link</p>
                  {task.result_url && !showResultInput ? <div className="space-y-2"><a href={task.result_url} target="_blank" rel="noopener noreferrer" className="flex min-h-10 items-center gap-2.5 rounded-[9px] border px-3 text-xs font-semibold transition-colors hover:border-[var(--border-strong)]" style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--accent)' }}><ExternalLink size={13} /><span className="truncate">Open submitted result</span></a><button onClick={() => setShowResultInput(true)} className="text-[11px] font-semibold" style={{ color: 'var(--muted)' }}>Edit result link</button></div> : showResultInput ? <div className="space-y-2.5"><input value={resultUrl} onChange={(event) => setResultUrl(event.target.value)} placeholder="https://..." className="form-control" /><button onClick={submitResult} disabled={updating || !resultUrl.trim()} className="btn btn-primary min-h-10 w-full">Save result</button></div> : <button onClick={() => setShowResultInput(true)} className="flex min-h-10 w-full items-center gap-2.5 rounded-[9px] border px-3 text-left text-xs font-semibold transition-colors hover:border-[var(--border-strong)]" style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--muted)' }}><Plus size={13} /> Add result link</button>}
                </div>
              </div>
            </section>

            <section className="rounded-[12px] border p-5 sm:p-6" style={{ background: 'var(--surface2)', borderColor: 'var(--border)' }}>
              <CommentSection taskId={task.id} comments={task.comments || []} currentUser={currentUser} />
            </section>
          </main>

          <aside className="px-5 py-7 sm:px-7 sm:py-8" style={{ background: 'var(--surface2)' }}>
            <div className="space-y-6 lg:sticky lg:top-0">
              <section>
                <p className="mb-3 text-[10px] font-extrabold uppercase tracking-[.11em]" style={{ color: 'var(--muted)' }}>Task actions</p>
          {canAdvanceStatus() && nextStatus && (
            <button
              onClick={advanceStatus}
              disabled={updating}
              className="btn btn-primary min-h-12 w-full"
            >
              <ChevronRight size={15} /> Mark as {nextStatus.replace('_', ' ')}
            </button>
          )}

          {isAdmin && task.status === 'DONE' && (
            <div className="space-y-2.5">
              <button onClick={() => adminDecision('APPROVED')} disabled={updating} className="flex min-h-11 w-full items-center justify-center rounded-[9px] text-sm font-bold disabled:opacity-50" style={{ background: 'var(--green)', color: '#071007' }}>Approve task</button>
              <button onClick={() => adminDecision('REJECTED')} disabled={updating} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[9px] border text-sm font-bold disabled:opacity-50" style={{ background: 'var(--red-dim)', color: 'var(--red)', borderColor: 'rgba(255,98,98,.35)' }}><XCircle size={14} /> Reject task</button>
              <button onClick={() => adminDecision('REJECTED', true)} disabled={updating} className="w-full px-3 py-2 text-[11px] font-semibold disabled:opacity-50" style={{ color: 'var(--red)' }}>Reject with -5 XP quality issue</button>
            </div>
          )}

          {isAdmin && ['APPROVED', 'REJECTED'].includes(task.status) && (
            <button onClick={() => adminDecision('IN_EDIT')} disabled={updating} className="btn btn-secondary min-h-11 w-full"><RotateCcw size={14} /> Reopen task</button>
          )}
          {!hasStatusAction && <div className="rounded-[9px] border px-3.5 py-3 text-xs leading-5" style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--muted)' }}>No status action is available for this task.</div>}
              </section>

          {isAssignee && !['DONE', 'APPROVED'].includes(task.status) && (
            <section className="border-t pt-6" style={{ borderColor: 'var(--border)' }}>
              <p className="mb-2 text-xs font-bold">Need clarification?</p>
              <p className="mb-3 text-[11px] leading-5" style={{ color: 'var(--muted)' }}>Ask the creator for missing context before continuing.</p>
              <textarea value={clarificationNote} onChange={(event) => setClarificationNote(event.target.value)} rows={3} placeholder="Explain what is unclear..." className="form-control !min-h-24 text-xs" />
              <button onClick={requestClarification} disabled={updating || !clarificationNote.trim()} className="mt-2.5 min-h-10 w-full rounded-[9px] border px-3 text-xs font-bold disabled:opacity-50" style={{ color: 'var(--amber)', borderColor: 'rgba(243,169,79,.35)' }}>Request clarification</button>
            </section>
          )}

              <section className="border-t pt-6" style={{ borderColor: 'var(--border)' }}>
                <p className="mb-3 text-[10px] font-extrabold uppercase tracking-[.11em]" style={{ color: 'var(--muted)' }}>Task details</p>
                <div className="overflow-hidden rounded-[11px] border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                  <DetailRow icon={<UserRound size={14} />} label="Assignees"><div className="space-y-2">{assignees.map((assignee) => <div key={assignee.id} className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-extrabold" style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--border-strong)' }}>{getInitials(assignee.full_name || assignee.email)}</span><span className="truncate text-xs font-semibold">{assignee.full_name || assignee.email}</span></div>)}</div></DetailRow>
                  <DetailRow icon={<UserRound size={14} />} label="Creator"><p className="truncate text-xs font-semibold">{task.creator_profile?.full_name || task.creator_profile?.email || 'Unknown'}</p><p className="mt-1 text-[10.5px]" style={{ color: 'var(--muted)' }}>{formatRelative(task.created_at)}</p></DetailRow>
                  <DetailRow icon={<CalendarDays size={14} />} label="Deadline"><p className="text-xs font-semibold" style={{ color: overdue ? 'var(--red)' : 'var(--text)' }}>{deadline ? deadlineLabel(deadline) : 'No deadline'}</p>{deadline && <p className="mt-1 text-[10.5px]" style={{ color: 'var(--muted)' }}>{formatDate(deadline)}</p>}</DetailRow>
                  <DetailRow icon={<Layers3 size={14} />} label="Section"><p className="text-xs font-semibold capitalize">{task.section.toLowerCase()}</p></DetailRow>
                  <DetailRow icon={<Bell size={14} />} label="Reminders" last><div className="flex flex-wrap gap-1.5"><ReminderPill active={!!task.remind_3d}>3 days</ReminderPill><ReminderPill active={!!task.remind_24h}>24 hours</ReminderPill></div></DetailRow>
                </div>
              </section>
            </div>
          </aside>
        </div>
      </article>
    </Modal>
  )
}

function SectionHeading({ icon, title, meta }: { icon: React.ReactNode; title: string; meta?: string }) {
  return <div className="mb-5 flex items-center gap-2.5"><span style={{ color: 'var(--accent)' }}>{icon}</span><h3 className="text-[13px] font-bold">{title}</h3>{meta && <span className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: 'var(--surface3)', color: 'var(--muted)' }}>{meta}</span>}</div>
}

function DetailRow({ icon, label, children, last = false }: { icon: React.ReactNode; label: string; children: React.ReactNode; last?: boolean }) {
  return <div className={`grid grid-cols-[18px_minmax(0,1fr)] gap-x-3 px-4 py-4 ${last ? '' : 'border-b'}`} style={{ borderColor: 'var(--border)' }}><span className="mt-0.5" style={{ color: 'var(--muted)' }}>{icon}</span><div className="min-w-0"><p className="mb-2 text-[9.5px] font-extrabold uppercase tracking-[.1em]" style={{ color: 'var(--muted)' }}>{label}</p>{children}</div></div>
}

function ReminderPill({ active, children }: { active: boolean; children: React.ReactNode }) {
  return <span className="rounded-full border px-2 py-1 text-[10px] font-bold" style={{ color: active ? 'var(--accent)' : 'var(--muted)', background: active ? 'var(--accent-dim)' : 'transparent', borderColor: active ? 'var(--border-strong)' : 'var(--border)' }}>{children}</span>
}
