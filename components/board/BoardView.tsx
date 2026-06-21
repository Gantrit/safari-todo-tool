'use client'

import { useState, useCallback } from 'react'
import { Task, Profile, TaskSection } from '@/lib/types'
import MemberColumn from './MemberColumn'
import TaskModal from '../task/TaskModal'
import TaskForm from '../task/TaskForm'
import Modal from '../ui/Modal'
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  DragOverlay,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { createClient } from '@/lib/supabase/client'
import { LayoutGrid, Plus, Users } from 'lucide-react'

interface BoardViewProps {
  board: any
  departments?: any[]
  members: Profile[]
  tasks: Task[]
  currentUser: Profile
}

export default function BoardView({ board, members, tasks: initialTasks, currentUser }: BoardViewProps) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [addingFor, setAddingFor] = useState<{ memberId: string; section: TaskSection } | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)

  const supabase = createClient()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id))
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    if (!over || active.id === over.id) return

    const activeTask = tasks.find((t) => t.id === active.id)
    if (!activeTask) return

    const overId = String(over.id)

    // Drop on section droppable
    if (overId.startsWith('section:')) {
      const [, newMemberId, sectionValue] = overId.split(':')
      const newSection = sectionValue as TaskSection
      const updatedTasks = tasks.map((t) =>
        t.id === active.id ? { ...t, assigned_to: newMemberId, assignee_ids: [newMemberId], section: newSection } : t
      )
      setTasks(updatedTasks)
      await supabase.from('tasks').update({ assigned_to: newMemberId, assignee_ids: [newMemberId], section: newSection }).eq('id', active.id)
      return
    }

    // Drop on another task — reorder
    const overTask = tasks.find((t) => t.id === overId)
    if (!overTask) return

    const activeIdx = tasks.findIndex((t) => t.id === active.id)
    const overIdx = tasks.findIndex((t) => t.id === over.id)
    const newTasks = arrayMove(tasks, activeIdx, overIdx)
    setTasks(newTasks)

    // If dropping on different member's column, reassign
    if (activeTask.assigned_to !== overTask.assigned_to) {
      await supabase.from('tasks').update({
        assigned_to: overTask.assigned_to,
        section: overTask.section,
      }).eq('id', active.id)
    }
  }

  const handleTaskUpdate = useCallback((updatedTask: Task) => {
    setTasks((prev) => prev.map((t) => (t.id === updatedTask.id ? updatedTask : t)))
    setSelectedTask(updatedTask)
  }, [])

  const handleTaskCreate = useCallback((newTask: Task) => {
    setTasks((prev) => [...prev, newTask])
    setAddingFor(null)
  }, [])

  const activeTask = tasks.find((t) => t.id === activeId)
  const defaultMember = members.find((member) => member.id === currentUser.id) || members[0]

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex h-full flex-col overflow-hidden p-4 sm:p-6 lg:p-8">
          <div className="board-surface">
          <div className="board-toolbar">
            <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--muted)' }}><Users size={15} /> {members.length} team {members.length === 1 ? 'member' : 'members'} · {tasks.filter((task) => !task.deleted_at && task.status !== 'APPROVED').length} active tasks</div>
            <button onClick={() => defaultMember && setAddingFor({ memberId: defaultMember.id, section: 'DAILY' })} disabled={!defaultMember} className="btn btn-primary"><Plus size={16} /> Create task</button>
          </div>
          {members.length > 0 ? (
          <div className={`board-columns board-canvas ${members.length === 1 ? 'is-single' : ''}`}>
            {members.map((member) => (
            <MemberColumn
              key={member.id}
              member={member}
              tasks={tasks.filter((t) => (t.assignee_ids || [t.assigned_to]).filter(Boolean).includes(member.id) && !t.deleted_at)}
              onTaskClick={setSelectedTask}
              onAddTask={(memberId, section) => setAddingFor({ memberId, section })}
              currentUserId={currentUser.id}
            />
            ))}
          </div>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8">
              <div className="app-card max-w-md p-8 text-center"><LayoutGrid className="mx-auto mb-4" size={30} style={{ color: 'var(--accent)' }} /><h2 className="text-lg font-bold">No team members on this board</h2><p className="mt-2 text-sm leading-6" style={{ color: 'var(--muted)' }}>Invite members from Settings before creating and assigning work.</p></div>
            </div>
          )}
          </div>
        </div>

        <DragOverlay>
          {activeTask && (
            <div
              className="rounded-[8px] p-3 shadow-2xl rotate-1"
              style={{ background: 'var(--surface2)', border: '1px solid var(--accent)', width: '260px' }}
            >
              <p className="text-sm" style={{ color: 'var(--text)' }}>{activeTask.title}</p>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {selectedTask && (
        <TaskModal
          task={selectedTask}
          currentUser={currentUser}
          onClose={() => setSelectedTask(null)}
          onUpdate={handleTaskUpdate}
          members={members}
        />
      )}

      {addingFor && (
        <Modal
          open={true}
          onClose={() => setAddingFor(null)}
          title="Create task"
          subtitle="Define the work, assign ownership, and set the delivery cadence."
          size="2xl"
        >
          <TaskForm
            boardId={board.id}
            memberId={addingFor.memberId}
            section={addingFor.section}
            members={members}
            currentUser={currentUser}
            onCreated={handleTaskCreate}
            onCancel={() => setAddingFor(null)}
          />
        </Modal>
      )}
    </>
  )
}
