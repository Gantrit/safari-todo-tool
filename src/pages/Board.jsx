import { useEffect, useState } from 'react'
import {
  DndContext,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core'
import { supabase } from '../supabaseClient'
import Column from '../components/Column'
import TaskCard from '../components/TaskCard'
import AddTaskModal from '../components/AddTaskModal'

const COLUMNS = [
  { id: 'todo',        label: '📋 To Do',      color: 'bg-gray-100' },
  { id: 'inprogress',  label: '🔄 In Progress', color: 'bg-blue-50' },
  { id: 'done',        label: '✅ Done',        color: 'bg-green-50' },
]

export default function Board({ session }) {
  const [tasks, setTasks] = useState([])
  const [activeTask, setActiveTask] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(true)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // Fetch tasks
  useEffect(() => {
    fetchTasks()
    // Real-time subscription
    const channel = supabase
      .channel('tasks-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, fetchTasks)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  const fetchTasks = async () => {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('position', { ascending: true })
    if (!error) setTasks(data || [])
    setLoading(false)
  }

  const handleDragStart = (event) => {
    const task = tasks.find(t => t.id === event.active.id)
    setActiveTask(task)
  }

  const handleDragEnd = async (event) => {
    const { active, over } = event
    setActiveTask(null)
    if (!over) return

    const taskId = active.id
    const newStatus = over.id // over a column id

    const validColumns = COLUMNS.map(c => c.id)
    if (!validColumns.includes(newStatus)) return

    const task = tasks.find(t => t.id === taskId)
    if (!task || task.status === newStatus) return

    // Optimistic update
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t))

    await supabase.from('tasks').update({ status: newStatus }).eq('id', taskId)
  }

  const handleSignOut = () => supabase.auth.signOut()

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-brand-600">Team Todo</h1>
          <p className="text-xs text-gray-400">{session.user.email}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowModal(true)}
            className="bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
          >
            + Add Task
          </button>
          <button
            onClick={handleSignOut}
            className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2 rounded-lg border border-gray-200 transition"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Board */}
      <main className="flex-1 p-6 overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-brand-500 border-t-transparent" />
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-6 min-w-max">
              {COLUMNS.map(col => (
                <Column
                  key={col.id}
                  column={col}
                  tasks={tasks.filter(t => t.status === col.id)}
                  onRefresh={fetchTasks}
                />
              ))}
            </div>
            <DragOverlay>
              {activeTask ? <TaskCard task={activeTask} isDragging /> : null}
            </DragOverlay>
          </DndContext>
        )}
      </main>

      {showModal && (
        <AddTaskModal
          session={session}
          onClose={() => setShowModal(false)}
          onCreated={fetchTasks}
        />
      )}
    </div>
  )
}
