import { useState } from 'react'
import { supabase } from '../supabaseClient'

export default function AddTaskModal({ session, onClose, onCreated }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [deadline, setDeadline] = useState('')
  const [priority, setPriority] = useState('medium')
  const [assignedTo, setAssignedTo] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!title.trim()) return
    setLoading(true)
    setError('')

    const { error } = await supabase.from('tasks').insert({
      title: title.trim(),
      description: description.trim() || null,
      deadline: deadline || null,
      priority,
      assigned_to: assignedTo.trim() || null,
      status: 'todo',
      created_by: session.user.id,
    })

    if (error) { setError(error.message); setLoading(false) }
    else { onCreated(); onClose() }
  }

  const inputClass = "w-full bg-sidebar border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-accent"

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white font-semibold">New Task</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-2xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Title *</label>
            <input type="text" required value={title} onChange={e => setTitle(e.target.value)}
              className={inputClass} placeholder="Task title..." />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              rows={2} className={`${inputClass} resize-none`} placeholder="Optional details..." />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Priority</label>
              <select value={priority} onChange={e => setPriority(e.target.value)} className={inputClass}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Deadline</label>
              <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className={inputClass} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Assign to</label>
            <input type="text" value={assignedTo} onChange={e => setAssignedTo(e.target.value)}
              className={inputClass} placeholder="Team member name..." />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 border border-border text-gray-400 font-medium py-2 rounded-lg hover:bg-sidebar transition text-sm">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 bg-accent hover:bg-accent-hover text-white font-semibold py-2 rounded-lg transition text-sm disabled:opacity-50">
              {loading ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
