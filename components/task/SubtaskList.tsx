'use client'

import { useState } from 'react'
import { ChecklistItem, Subtask, Profile } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { toastError } from '@/lib/toast'
import { Plus, Check } from 'lucide-react'

interface SubtaskListProps {
  taskId: string
  subtasks: Array<Subtask | ChecklistItem>
  currentUser: Profile
}

export default function SubtaskList({ taskId, subtasks: initial, currentUser }: SubtaskListProps) {
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
    // Guard: without a real id we can't target a single row (and `.eq('id', undefined)`
    // would match nothing while `s.id === id` would flip every item). Skip safely.
    if (!id) return
    // Optimistic: flip immediately so the checkbox reacts to the click, then
    // revert (with a visible error) if neither table accepted the write.
    setSubtasks((prev) => prev.map((s) => (s.id === id ? { ...s, done: !done } : s)))
    const { error } = await supabase.from('checklist_items').update({ done: !done }).eq('id', id)
    if (error) {
      const fallback = await supabase.from('subtasks').update({ done: !done }).eq('id', id)
      if (fallback.error) {
        setSubtasks((prev) => prev.map((s) => (s.id === id ? { ...s, done } : s)))
        toastError(fallback.error.message || 'Checklist update failed.')
      }
    }
  }

  const total = subtasks.length
  const doneCount = subtasks.filter((s) => s.done).length
  const pct = total ? Math.round((doneCount / total) * 100) : 0

  return (
    <div className="space-y-2.5">
      {total > 0 && (
        <div className="mb-3.5">
          <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold" style={{ color: 'var(--muted)' }}>
            <span>{doneCount}/{total} done</span>
            <span style={{ color: pct === 100 ? 'var(--green)' : 'var(--muted)' }}>{pct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full" style={{ background: 'var(--surface3)' }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: 'var(--green)' }} />
          </div>
        </div>
      )}
      {subtasks.length === 0 && !adding && <div className="rounded-[10px] border border-dashed px-4 py-5 text-center text-xs leading-5" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>No checklist items yet.</div>}
      {subtasks.map((s) => (
        <div key={s.id} className="flex min-h-11 items-center gap-3 rounded-[9px] border px-3.5" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <button
            onClick={() => toggleSubtask(s.id, s.done)}
            className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-[5px] transition-all"
            style={{
              background: s.done ? 'var(--accent)' : 'transparent',
              border: `1px solid ${s.done ? 'var(--accent)' : 'var(--border)'}`,
            }}
          >
            {s.done && <Check size={10} color="#0e0e0e" />}
          </button>
          <span
            className="flex-1 text-[13px] leading-5"
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
        <div className="mt-3 flex gap-2">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addSubtask(); if (e.key === 'Escape') setAdding(false) }}
            placeholder="Subtask title..."
            autoFocus
            className="form-control min-w-0 flex-1"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
          <button
            onClick={addSubtask}
            className="btn btn-primary min-h-10 px-4 text-xs"
          >
            Add
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-3 flex min-h-9 items-center gap-2 rounded-[8px] px-2 text-xs font-semibold transition-colors hover:bg-[var(--surface3)] hover:text-[var(--text)]"
          style={{ color: 'var(--muted)' }}
        >
          <Plus size={11} />
          Add subtask
        </button>
      )}
    </div>
  )
}
