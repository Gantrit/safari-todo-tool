'use client'

import { useState } from 'react'
import { ChecklistItem, Subtask, Profile } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { Plus, Check } from 'lucide-react'

interface SubtaskListProps {
  taskId: string
  subtasks: Array<Subtask | ChecklistItem>
  members: Profile[]
  currentUser: Profile
}

export default function SubtaskList({ taskId, subtasks: initial, members, currentUser }: SubtaskListProps) {
  const [subtasks, setSubtasks] = useState<Array<Subtask | ChecklistItem>>(initial)
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const supabase = createClient()

  async function addSubtask() {
    if (!newTitle.trim()) return
    const { data, error } = await supabase
      .from('checklist_items')
      .insert({ task_id: taskId, title: newTitle.trim(), position: subtasks.length, done: false })
      .select('*')
      .single()
    if (error) {
      const fallback = await supabase
        .from('subtasks')
        .insert({ task_id: taskId, title: newTitle.trim(), assigned_to: currentUser.id, done: false })
        .select('*')
        .single()
      if (fallback.data) {
        setSubtasks((prev) => [...prev, fallback.data as Subtask])
        setNewTitle('')
        setAdding(false)
      }
      return
    }
    if (data) {
      setSubtasks((prev) => [...prev, data as ChecklistItem])
      setNewTitle('')
      setAdding(false)
    }
  }

  async function toggleSubtask(id: string, done: boolean) {
    const { error } = await supabase.from('checklist_items').update({ done: !done }).eq('id', id)
    if (error) await supabase.from('subtasks').update({ done: !done }).eq('id', id)
    setSubtasks((prev) => prev.map((s) => (s.id === id ? { ...s, done: !done } : s)))
  }

  return (
    <div className="space-y-1.5">
      {subtasks.map((s) => (
        <div key={s.id} className="flex items-center gap-2">
          <button
            onClick={() => toggleSubtask(s.id, s.done)}
            className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-all"
            style={{
              background: s.done ? 'var(--accent)' : 'transparent',
              border: `1px solid ${s.done ? 'var(--accent)' : 'var(--border)'}`,
            }}
          >
            {s.done && <Check size={10} color="#0e0e0e" />}
          </button>
          <span
            className="text-sm flex-1"
            style={{
              color: 'var(--text)',
              textDecoration: s.done ? 'line-through' : 'none',
              opacity: s.done ? 0.5 : 1,
            }}
          >
            {s.title}
          </span>
        </div>
      ))}

      {adding ? (
        <div className="flex gap-2 mt-2">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addSubtask(); if (e.key === 'Escape') setAdding(false) }}
            placeholder="Subtask title..."
            autoFocus
            className="flex-1 px-2 py-1 text-sm rounded-[6px] outline-none"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
          <button
            onClick={addSubtask}
            className="px-2 py-1 text-xs rounded-[6px]"
            style={{ background: 'var(--accent)', color: '#0e0e0e' }}
          >
            Add
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 text-xs mt-1 hover:opacity-70 transition-opacity"
          style={{ color: 'var(--muted)' }}
        >
          <Plus size={11} />
          Add subtask
        </button>
      )}
    </div>
  )
}
