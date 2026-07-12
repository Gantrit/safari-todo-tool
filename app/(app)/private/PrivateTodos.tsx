'use client'

import { useState } from 'react'
import { Task, Profile, Priority } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Plus, Check, Trash2 } from 'lucide-react'
import { playSound } from '@/lib/gamification'
import PriorityBadge from '@/components/ui/PriorityBadge'
import { formatDate } from '@/lib/utils'

interface PrivateTodosProps {
  tasks: Task[]
  profile: Profile
}

export default function PrivateTodos({ tasks: initial, profile }: PrivateTodosProps) {
  const [tasks, setTasks] = useState<Task[]>(initial)
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<Priority>('MEDIUM')
  const [dueDate, setDueDate] = useState('')
  const supabase = createClient()
  const router = useRouter()

  async function addTask() {
    if (!title.trim()) return
    const { data } = await supabase
      .from('tasks')
      .insert({
        board_id: null,
        assigned_to: profile.id,
        created_by: profile.id,
        title: title.trim(),
        priority,
        status: 'ASSIGNED',
        section: 'DAILY',
        due_date: dueDate || null,
        xp_awarded: false,
        position: 0,
        labels: [],
        remind_3d: false,
        remind_24h: false,
      })
      .select('*, subtasks(*)')
      .single()
    if (data) {
      setTasks((prev) => [data as Task, ...prev])
      setTitle('')
      setDueDate('')
      setAdding(false)
    }
  }

  async function toggleDone(task: Task) {
    const next = task.status === 'DONE' ? 'ASSIGNED' : 'DONE'
    if (next === 'DONE') playSound('done')
    await supabase.from('tasks').update({ status: next }).eq('id', task.id)
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: next } : t)))
  }

  async function deleteTask(id: string) {
    await supabase.from('tasks').delete().eq('id', id)
    setTasks((prev) => prev.filter((t) => t.id !== id))
  }

  return (
    <div>
      <div className="space-y-2 mb-4">
        {tasks.map((task) => (
          <div
            key={task.id}
            className="flex items-center gap-3 p-3 rounded-[10px]"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <button
              onClick={() => toggleDone(task)}
              className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-all"
              style={{
                background: task.status === 'DONE' ? 'var(--accent)' : 'transparent',
                border: `1px solid ${task.status === 'DONE' ? 'var(--accent)' : 'var(--border)'}`,
              }}
            >
              {task.status === 'DONE' && <Check size={11} color="#0e0e0e" />}
            </button>
            <span
              className="flex-1 text-sm"
              style={{
                color: 'var(--text)',
                textDecoration: task.status === 'DONE' ? 'line-through' : 'none',
                opacity: task.status === 'DONE' ? 0.5 : 1,
              }}
            >
              {task.title}
            </span>
            {task.due_date && (
              <span className="text-xs" style={{ color: 'var(--muted)' }}>{formatDate(task.due_date)}</span>
            )}
            <PriorityBadge priority={task.priority} />
            <button
              onClick={() => deleteTask(task.id)}
              className="p-1 hover:opacity-70 transition-opacity"
              style={{ color: 'var(--muted)' }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>

      {adding ? (
        <div className="app-card space-y-3 p-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addTask(); if (e.key === 'Escape') setAdding(false) }}
            placeholder="Task title..."
            autoFocus
            className="w-full rounded-[8px] px-3 py-2 text-sm outline-none"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
          <div className="flex gap-2">
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              className="rounded-[8px] px-2 py-1.5 text-sm outline-none"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
            >
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="flex-1 rounded-[8px] px-2 py-1.5 text-sm outline-none [color-scheme:dark]"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
          </div>
          <div className="flex gap-2">
            <button onClick={addTask} className="btn btn-primary !min-h-9 px-3 text-sm">Add</button>
            <button onClick={() => setAdding(false)} className="btn btn-secondary !min-h-9 px-3 text-sm">Cancel</button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-2 text-sm hover:opacity-70 transition-opacity"
          style={{ color: 'var(--muted)' }}
        >
          <Plus size={14} />
          Add private task
        </button>
      )}
    </div>
  )
}
