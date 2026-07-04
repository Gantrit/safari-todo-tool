'use client'

import { useState } from 'react'
import { Task, Priority, TaskSection, Profile } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { berlinDefaultDeadline, getInitials } from '@/lib/utils'
import { Bell, Check, Link2, ListChecks, Loader2, Repeat2 } from 'lucide-react'

interface TaskFormProps {
  boardId: string
  memberId: string
  section: TaskSection
  members: Profile[]
  currentUser: Profile
  onCreated: (task: Task) => void
  onCancel: () => void
}

export default function TaskForm({ boardId, memberId, section, members, currentUser, onCreated, onCancel }: TaskFormProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<Priority>('MEDIUM')
  const [assignedTo, setAssignedTo] = useState<string[]>([memberId])
  const [deadline, setDeadline] = useState(() => berlinDefaultDeadline(section).toISOString().slice(0, 16))
  const [referenceUrl, setReferenceUrl] = useState('')
  const [checklist, setChecklist] = useState('')
  const [recurringEnabled, setRecurringEnabled] = useState(false)
  const [recurringFrequency, setRecurringFrequency] = useState('WEEKLY')
  const [remind3d, setRemind3d] = useState(false)
  const [remind24h, setRemind24h] = useState(false)
  const [labels, setLabels] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [supabase] = useState(() => createClient())

  const toggleAssignee = (id: string) => {
    setAssignedTo((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || assignedTo.length === 0 || loading) return
    setLoading(true)
    setError(null)

    const primaryAssignee = assignedTo[0]
    const { data, error: insertError } = await supabase.from('tasks').insert({
      board_id: boardId,
      assigned_to: primaryAssignee,
      assignee_ids: assignedTo,
      created_by: currentUser.id,
      creator_id: currentUser.id,
      title: title.trim(),
      description: description.trim() || null,
      priority,
      status: 'ASSIGNED',
      section,
      due_date: deadline ? deadline.slice(0, 10) : null,
      deadline_at: deadline ? new Date(deadline).toISOString() : null,
      remind_3d: remind3d,
      remind_24h: remind24h,
      xp_awarded: false,
      position: Math.floor(Date.now() / 1000),
      reference_url: referenceUrl.trim() || null,
      google_drive_url: referenceUrl.trim() || null,
      recurring_enabled: recurringEnabled,
      recurring_frequency: recurringEnabled ? recurringFrequency : null,
      labels: labels.split(',').map((label) => label.trim()).filter(Boolean),
    }).select('*, assigned_profile:profiles!tasks_assigned_to_fkey(*), creator_profile:profiles!tasks_created_by_fkey(*)').single()

    if (insertError || !data) {
      setError(insertError?.message || 'Task could not be created.')
      setLoading(false)
      return
    }

    const checklistItems = checklist.split('\n').map((item) => item.trim()).filter(Boolean).map((item, index) => ({ task_id: data.id, title: item, position: index, done: false }))
    const writes = []
    if (assignedTo.length > 1) writes.push(supabase.from('task_assignees').insert(assignedTo.map((userId) => ({ task_id: data.id, user_id: userId }))))
    if (checklistItems.length > 0) writes.push(supabase.from('checklist_items').insert(checklistItems))
    const results = await Promise.all(writes)
    const relatedError = results.find((result) => result.error)?.error
    if (relatedError) {
      setError(`Task created, but related details could not be saved: ${relatedError.message}`)
      setLoading(false)
      return
    }

    onCreated({ ...(data as Task), assignee_ids: assignedTo, checklist_items: checklistItems as any })
  }

  const fieldClass = 'create-task-control'
  const fieldStyle = { background: 'var(--surface2)', borderColor: 'var(--border)', color: 'var(--text)' }
  const labelClass = 'block text-[10.5px] font-bold uppercase tracking-[.1em]'
  const groupClass = 'create-task-group'

  return (
    <form onSubmit={handleSubmit}>
      <div className="create-task-body">
        <div className="create-task-main">
          <div className={groupClass}>
            <label className={labelClass} style={{ color: 'var(--text-secondary)' }}>Task title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required className={`${fieldClass} text-[15px] font-semibold`} style={fieldStyle} placeholder="What needs to be done?" autoFocus />
          </div>
          <div className={groupClass}>
            <label className={labelClass} style={{ color: 'var(--text-secondary)' }}>Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} className={fieldClass} style={fieldStyle} placeholder="Add context, expected outcome, or handoff notes." />
          </div>
          <div className="create-task-paired">
            <div className={groupClass}><label className={labelClass} style={{ color: 'var(--text-secondary)' }}>Priority</label><select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className={fieldClass} style={fieldStyle}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option></select></div>
            <div className={groupClass}><label className={labelClass} style={{ color: 'var(--text-secondary)' }}>Deadline · Berlin</label><input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={fieldClass} style={fieldStyle} /></div>
          </div>
          <div className={groupClass}>
            <label className={`${labelClass} flex items-center gap-2`} style={{ color: 'var(--text-secondary)' }}><ListChecks size={13} /> Checklist</label>
            <textarea value={checklist} onChange={(e) => setChecklist(e.target.value)} rows={5} className={fieldClass} style={fieldStyle} placeholder={'Collect source files\nSubmit first draft\nFinal QA'} />
            <p className="mt-2.5 text-[11.5px] leading-5" style={{ color: 'var(--muted)' }}>One checklist item per line.</p>
          </div>
          <div className="create-task-paired">
            <div className={groupClass}><label className={`${labelClass} flex items-center gap-2`} style={{ color: 'var(--text-secondary)' }}><Link2 size={13} /> Reference link</label><input value={referenceUrl} onChange={(e) => setReferenceUrl(e.target.value)} className={fieldClass} style={fieldStyle} placeholder="Drive, brief, or SOP URL" /></div>
            <div className={groupClass}><label className={labelClass} style={{ color: 'var(--text-secondary)' }}>Labels</label><input value={labels} onChange={(e) => setLabels(e.target.value)} className={fieldClass} style={fieldStyle} placeholder="design, review" /></div>
          </div>
        </div>

        <aside className="create-task-automation self-start">
          <div className="create-task-automation-header">
            <p className="text-[15px] font-bold tracking-[-.01em]">Assignment &amp; automation</p>
            <p className="mt-2 text-xs leading-5" style={{ color: 'var(--muted)' }}>Choose owners and configure deadline follow-ups.</p>
          </div>
          <div className="create-task-automation-body">
          <div className={groupClass}>
            <label className={labelClass} style={{ color: 'var(--text-secondary)' }}>Assignees</label>
            <div className="space-y-3">
              {members.map((member) => { const active = assignedTo.includes(member.id); return <button key={member.id} type="button" onClick={() => toggleAssignee(member.id)} className="flex min-h-[54px] w-full items-center gap-3 rounded-[10px] border px-3.5 text-left transition-colors hover:border-[var(--border-strong)]" style={{ background: active ? 'var(--accent-dim)' : 'var(--surface)', borderColor: active ? 'rgba(200,169,106,.42)' : 'var(--border)' }}><span className="flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-extrabold" style={{ background: active ? 'var(--accent)' : 'var(--surface3)', color: active ? '#0b0d09' : 'var(--text)' }}>{getInitials(member.full_name || member.email)}</span><span className="min-w-0 flex-1 truncate text-xs font-semibold">{member.full_name || member.email}</span>{active && <Check size={14} style={{ color: 'var(--accent)' }} />}</button> })}
            </div>
            {assignedTo.length === 0 && <p className="mt-2 text-xs" style={{ color: 'var(--red)' }}>Select at least one assignee.</p>}
          </div>

          <div className="border-t pt-6" style={{ borderColor: 'var(--border)' }}>
            <div className="mb-4 flex items-center gap-2 text-xs font-bold"><Bell size={14} style={{ color: 'var(--accent)' }} /> Reminders</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <Toggle checked={remind3d} onChange={setRemind3d} label="3 days before" />
              <Toggle checked={remind24h} onChange={setRemind24h} label="24 hours before" />
            </div>
          </div>

          <div className="border-t pt-6" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-xs font-bold"><Repeat2 size={14} style={{ color: 'var(--text-secondary)' }} /> Recurring task</span><Toggle checked={recurringEnabled} onChange={setRecurringEnabled} compact /></div>
            <p className="mt-2 text-[11.5px] leading-5" style={{ color: 'var(--muted)' }}>Repeat this task on a fixed schedule.</p>
            <div className="mt-4"><label className={labelClass} style={{ color: 'var(--text-secondary)' }}>Frequency</label><select value={recurringFrequency} onChange={(e) => setRecurringFrequency(e.target.value)} disabled={!recurringEnabled} className={`${fieldClass} disabled:cursor-not-allowed disabled:opacity-40`} style={fieldStyle}><option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option><option value="CUSTOM">Custom</option></select></div>
          </div>
          </div>
        </aside>
      </div>

      {error && <div className="mx-5 mb-6 rounded-[10px] border px-4 py-3.5 text-sm sm:mx-10" style={{ background: 'var(--red-dim)', borderColor: 'rgba(255,98,98,.3)', color: 'var(--red)' }}>{error}</div>}
      <footer className="create-task-footer sticky bottom-0 z-10">
        <button type="button" onClick={onCancel} disabled={loading} className="btn btn-secondary sm:min-w-28">Cancel</button>
        <button type="submit" disabled={loading || !title.trim() || assignedTo.length === 0} className="btn btn-primary sm:min-w-40">{loading ? <><Loader2 className="animate-spin" size={15} /> Creating task…</> : 'Create task'}</button>
      </footer>
    </form>
  )
}

function Toggle({ checked, onChange, label, compact = false }: { checked: boolean; onChange: (value: boolean) => void; label?: string; compact?: boolean }) {
  return <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`flex items-center ${label ? 'min-h-[52px] justify-between gap-4 rounded-[10px] border px-4 py-3 text-left text-xs font-medium transition-colors hover:border-[var(--border-strong)]' : ''}`} style={label ? { background: 'var(--surface)', borderColor: 'var(--border)', color: checked ? 'var(--text)' : 'var(--text-secondary)' } : undefined}>{label && <span>{label}</span>}<span className={`relative inline-flex ${compact ? 'h-5 w-9' : 'h-5 w-9'} flex-none rounded-full transition-colors`} style={{ background: checked ? 'var(--accent)' : 'var(--surface3)' }}><span className="absolute top-0.5 h-4 w-4 rounded-full transition-transform" style={{ background: checked ? '#0b0d09' : 'var(--muted)', transform: checked ? 'translateX(18px)' : 'translateX(2px)' }} /></span></button>
}
