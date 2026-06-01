import { useEffect, useState } from 'react'
import { DndContext, closestCorners, PointerSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core'
import { supabase } from '../supabaseClient'
import Column from '../components/Column'
import TaskCard from '../components/TaskCard'
import AddTaskModal from '../components/AddTaskModal'

const COLUMNS = [
  { id: 'todo',       label: 'To Do',      color: 'bg-card' },
  { id: 'inprogress', label: 'In Progress', color: 'bg-card' },
  { id: 'done',       label: 'Done',        color: 'bg-card' },
]

export default function Board({ session }) {
  const [tasks, setTasks] = useState([])
  const [activeTask, setActiveTask] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(true)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  useEffect(() => {
    fetchTasks()
    const channel = supabase
      .channel('tasks-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, fetchTasks)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  const fetchTasks = async () => {
    const { data, error } = await supabase.from('tasks').select('*').order('created_at', { ascending: true })
    if (!error) setTasks(data || [])
    setLoading(false)
  }

  const handleDragStart = (event) => {
    setActiveTask(tasks.find(t => t.id === event.active.id))
  }

  const handleDragEnd = async (event) => {
    const { active, over } = event
    setActiveTask(null)
    if (!over) return
    const newStatus = over.id
    if (!COLUMNS.map(c => c.id).includes(newStatus)) return
    const task = tasks.find(t => t.id === active.id)
    if (!task || task.status === newStatus) return
    setTasks(prev => prev.map(t => t.id === active.id ? { ...t, status: newStatus } : t))
    await supabase.from('tasks').update({ status: newStatus }).eq('id', active.id)
  }

  const counts = {
    todo: tasks.filter(t => t.status === 'todo').length,
    inprogress: tasks.filter(t => t.status === 'inprogress').length,
    done: tasks.filter(t => t.status === 'done').length,
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-8 py-5 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="text-white font-semibold text-lg">Board</h2>
          <p className="text-gray-500 text-xs mt-0.5">{tasks.length} total tasks</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-accent hover:bg-accent-hover text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
        >
          + Add Task
        </button>
      </div>

      {/* Stats row */}
      <div className="px-8 py-4 flex gap-4">
        {[
          { label: 'To Do', count: counts.todo, color: 'text-gray-400' },
          { label: 'In Progress', count: counts.inprogress, color: 'text-blue-400' },
          { label: 'Done', count: counts.done, color: 'text-green-400' },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl px-5 py-3 flex items-center gap-3">
            <span className={`text-2xl font-bold ${s.color}`}>{s.count}</span>
            <span className="text-gray-500 text-sm">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Kanban */}
      <div className="flex-1 px-8 pb-8 overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-accent border-t-transparent" />
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="flex gap-5 min-w-max pt-2">
              {COLUMNS.map(col => (
                <Column key={col.id} column={col} tasks={tasks.filter(t => t.status === col.id)} onRefresh={fetchTasks} />
              ))}
            </div>
            <DragOverlay>
              {activeTask ? <TaskCard task={activeTask} isDragging /> : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {showModal && (
        <AddTaskModal session={session} onClose={() => setShowModal(false)} onCreated={fetchTasks} />
      )}
    </div>
  )
}
