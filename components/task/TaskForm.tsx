'use client'

import { useState } from 'react'
import { Task, Priority, TaskSection, Profile } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { berlinDefaultDeadline } from '@/lib/utils'

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

  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setLoading(true)
    setError(null)

    const primaryAssignee = assignedTo[0] || memberId
    const { data, error } = await supabase
      .from('tasks')
      .insert({
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
        position: 0,
        reference_url: referenceUrl.trim() || null,
        google_drive_url: referenceUrl.trim() || null,
        recurring_enabled: recurringEnabled,
        recurring_frequency: recurringEnabled ? recurringFrequency : null,
        labels: labels ? labels.split(',').map((l) => l.trim()).filter(Boolean) : [],
      })
      .select('*, assigned_profile:profiles!tasks_assigned_to_fkey(*), creator_profile:profiles!tasks_created_by_fkey(*)')
      .single()

    if (error) {
      setError(error.message)
    } else if (data) {
      const checklistItems = checklist
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item, index) => ({ task_id: data.id, title: item, position: index, done: false }))
      if (assignedTo.length > 1) {
        await supabase.from('task_assignees').insert(assignedTo.map((userId) => ({ task_id: data.id, user_id: userId })))
      }
      if (checklistItems.length > 0) {
        await supabase.from('checklist_items').insert(checklistItems)
      }
      onCreated({ ...(data as Task), assignee_ids: assignedTo })
    }
    setLoading(false)
  }

  const inputStyle = {
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    borderRadius: '8px',
    padding: '8px 12px',
    fontSize: '14px',
    width: '100%',
    outline: 'none',
  }

  const labelStyle = {
    display: 'block',
    fontSize: '11px',
    color: 'var(--muted)',
    marginBottom: '4px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label style={labelStyle}>Title *</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          style={inputStyle}
          placeholder="Task title..."
          autoFocus
        />
      </div>

      <div>
        <label style={labelStyle}>Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          style={{ ...inputStyle, resize: 'vertical' }}
          placeholder="Optional description..."
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label style={labelStyle}>Priority</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} style={inputStyle}>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
          </select>
        </div>

        <div>
          <label style={labelStyle}>Assign To</label>
          <select
            multiple
            value={assignedTo}
            onChange={(e) => setAssignedTo(Array.from(e.currentTarget.selectedOptions).map((option) => option.value))}
            style={{ ...inputStyle, minHeight: '92px' }}
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name || m.email}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label style={labelStyle}>Deadline (Europe/Berlin default)</label>
        <input
          type="datetime-local"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          style={inputStyle}
        />
      </div>

      <div>
        <label style={labelStyle}>Reference Link</label>
        <input
          value={referenceUrl}
          onChange={(e) => setReferenceUrl(e.target.value)}
          style={inputStyle}
          placeholder="https://drive.google.com/... or SOP link"
        />
      </div>

      <div>
        <label style={labelStyle}>Checklist (one item per line)</label>
        <textarea
          value={checklist}
          onChange={(e) => setChecklist(e.target.value)}
          rows={3}
          style={{ ...inputStyle, resize: 'vertical' }}
          placeholder="Collect source files&#10;Submit first draft&#10;Final QA"
        />
      </div>

      <div>
        <label style={labelStyle}>Labels (comma separated)</label>
        <input
          value={labels}
          onChange={(e) => setLabels(e.target.value)}
          style={inputStyle}
          placeholder="design, urgent, review"
        />
      </div>

      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--muted)' }}>
          <input type="checkbox" checked={remind3d} onChange={(e) => setRemind3d(e.target.checked)} />
          3-day reminder
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--muted)' }}>
          <input type="checkbox" checked={remind24h} onChange={(e) => setRemind24h(e.target.checked)} />
          24h reminder
        </label>
      </div>

      <div className="grid grid-cols-[auto_1fr] items-center gap-3">
        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--muted)' }}>
          <input type="checkbox" checked={recurringEnabled} onChange={(e) => setRecurringEnabled(e.target.checked)} />
          Recurring
        </label>
        <select
          value={recurringFrequency}
          onChange={(e) => setRecurringFrequency(e.target.value)}
          disabled={!recurringEnabled}
          style={inputStyle}
        >
          <option value="DAILY">Daily</option>
          <option value="WEEKLY">Weekly</option>
          <option value="MONTHLY">Monthly</option>
          <option value="CUSTOM">Custom</option>
        </select>
      </div>

      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 py-2 text-sm font-semibold rounded-[8px] disabled:opacity-50 transition-opacity"
          style={{ background: 'var(--accent)', color: '#0e0e0e' }}
        >
          {loading ? 'Creating...' : 'Create Task'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm rounded-[8px] transition-opacity hover:opacity-70"
          style={{ background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)' }}
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
