'use client'

import { useState } from 'react'
import { Task, Priority, TaskSection, Profile } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'

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
  const [assignedTo, setAssignedTo] = useState(memberId)
  const [dueDate, setDueDate] = useState('')
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

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        board_id: boardId,
        assigned_to: assignedTo,
        created_by: currentUser.id,
        title: title.trim(),
        description: description.trim() || null,
        priority,
        status: 'NOTICED',
        section,
        due_date: dueDate || null,
        remind_3d: remind3d,
        remind_24h: remind24h,
        xp_awarded: false,
        position: 0,
        labels: labels ? labels.split(',').map((l) => l.trim()).filter(Boolean) : [],
      })
      .select('*, assigned_profile:profiles!tasks_assigned_to_fkey(*), creator_profile:profiles!tasks_created_by_fkey(*)')
      .single()

    if (error) {
      setError(error.message)
    } else {
      onCreated(data as Task)
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
          <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} style={inputStyle}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name || m.email}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label style={labelStyle}>Due Date</label>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          style={inputStyle}
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
