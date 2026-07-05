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
import { berlinDefaultDeadline } from '@/lib/utils'
import { AlertTriangle, LayoutGrid, Loader2, Plus, Trash2, Users } from 'lucide-react'

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
  const [deletingTask, setDeletingTask] = useState<Task | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
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
    const movedCrossColumn = activeTask.assigned_to !== overTask.assigned_to || activeTask.section !== overTask.section

    const newTasks = arrayMove(
      movedCrossColumn
        ? tasks.map((t) => (t.id === active.id ? { ...t, assigned_to: overTask.assigned_to, assignee_ids: [overTask.assigned_to].filter(Boolean) as string[], section: overTask.section } : t))
        : tasks,
      activeIdx,
      overIdx
    )
    setTasks(newTasks)

    // Persist new order within the target member+section so it survives reloads
    const targetMemberId = overTask.assigned_to
    const targetSection = overTask.section
    const orderedIds = newTasks
      .filter((t) => (t.assignee_ids || [t.assigned_to]).filter(Boolean).includes(targetMemberId!) && t.section === targetSection && !t.deleted_at)
      .map((t) => t.id)

    const updates = orderedIds.map((id, index) => {
      const patch: Record<string, unknown> = { position: index }
      if (id === active.id && movedCrossColumn) {
        patch.assigned_to = targetMemberId
        patch.assignee_ids = [targetMemberId].filter(Boolean)
        patch.section = targetSection
      }
      return supabase.from('tasks').update(patch).eq('id', id)
    })
    await Promise.all(updates)
  }

  const handleTaskUpdate = useCallback((updatedTask: Task) => {
    setTasks((prev) => prev.map((t) => (t.id === updatedTask.id ? updatedTask : t)))
    setSelectedTask(updatedTask)
  }, [])

  const handleTaskCreate = useCallback((newTask: Task) => {
    setTasks((prev) => [...prev, newTask])
    setAddingFor(null)
  }, [])

  // Quick add — optimistic insert with sensible defaults (current section,
  // column owner as assignee, medium priority), reconciled with the server row.
  const handleQuickAdd = useCallback(async (memberId: string, section: TaskSection, title: string) => {
    const trimmed = title.trim()
    if (!trimmed) return

    const deadline = berlinDefaultDeadline(section)
    const deadlineIso = deadline.toISOString()
    const nowIso = new Date().toISOString()
    const position = Math.floor(Date.now() / 1000)
    const tempId = `temp-${position}-${Math.random().toString(36).slice(2, 7)}`

    const optimistic: Task = {
      id: tempId,
      board_id: board.id,
      assigned_to: memberId,
      assignee_ids: [memberId],
      created_by: currentUser.id,
      creator_id: currentUser.id,
      title: trimmed,
      description: null,
      priority: 'MEDIUM',
      status: 'ASSIGNED',
      section,
      due_date: deadlineIso.slice(0, 10),
      deadline_at: deadlineIso,
      remind_3d: false,
      remind_24h: false,
      xp_awarded: false,
      position,
      parent_task_id: null,
      result_url: null,
      labels: [],
      google_drive_url: null,
      created_at: nowIso,
      updated_at: nowIso,
    }
    setTasks((prev) => [...prev, optimistic])

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        board_id: board.id,
        assigned_to: memberId,
        assignee_ids: [memberId],
        created_by: currentUser.id,
        creator_id: currentUser.id,
        title: trimmed,
        priority: 'MEDIUM',
        status: 'ASSIGNED',
        section,
        due_date: deadlineIso.slice(0, 10),
        deadline_at: deadlineIso,
        remind_3d: false,
        remind_24h: false,
        xp_awarded: false,
        position,
        labels: [],
      })
      .select('*, assigned_profile:profiles!tasks_assigned_to_fkey(*), creator_profile:profiles!tasks_created_by_fkey(*)')
      .single()

    if (error || !data) {
      setTasks((prev) => prev.filter((t) => t.id !== tempId))
      return
    }
    setTasks((prev) => prev.map((t) => (t.id === tempId ? (data as Task) : t)))
  }, [board.id, currentUser.id, supabase])

  // Soft-delete via SECURITY DEFINER RPC (creator or admin, enforced in DB).
  const confirmDelete = async () => {
    if (!deletingTask || deleteLoading) return
    const target = deletingTask
    const snapshot = tasks
    setDeleteLoading(true)
    setDeleteError(null)
    setTasks((prev) => prev.filter((t) => t.id !== target.id))

    const { error } = await supabase.rpc('soft_delete_task', { p_task_id: target.id })
    setDeleteLoading(false)

    if (error) {
      setTasks(snapshot)
      setDeleteError(error.message || 'Task could not be deleted.')
      return
    }
    if (selectedTask?.id === target.id) setSelectedTask(null)
    setDeletingTask(null)
  }

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
        <div className="flex h-full flex-col overflow-hidden p-4 sm:p-7 lg:p-9">
          <div className="board-surface">
          <div className="board-toolbar">
            <div><div className="flex items-center gap-2 text-xs font-bold" style={{ color: 'var(--text-secondary)' }}><Users size={15} style={{ color: 'var(--accent)' }} /> Team workload</div><p className="mt-1.5 text-[11px]" style={{ color: 'var(--muted)' }}>{members.length} team {members.length === 1 ? 'member' : 'members'} · {tasks.filter((task) => !task.deleted_at && task.status !== 'APPROVED').length} active tasks</p></div>
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
              onQuickAdd={handleQuickAdd}
              onDelete={(task) => { setDeleteError(null); setDeletingTask(task) }}
              currentUser={currentUser}
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

      {deletingTask && (
        <Modal open={true} onClose={() => { if (!deleteLoading) setDeletingTask(null) }} title="Delete task" size="sm">
          <div className="px-5 py-5 sm:px-7">
            <div className="flex items-start gap-4">
              <div className="icon-chip is-danger" style={{ width: 42, height: 42 }}><AlertTriangle size={19} /></div>
              <div className="min-w-0">
                <p className="text-sm leading-6" style={{ color: 'var(--text)' }}>
                  Delete <span className="font-bold">“{deletingTask.title}”</span>? It will be removed from the board and archived out of view. This can’t be undone from here.
                </p>
              </div>
            </div>
            {deleteError && (
              <div className="mt-4 rounded-[10px] border px-3.5 py-3 text-[12.5px]" style={{ background: 'var(--red-dim)', borderColor: 'rgba(240,85,90,.3)', color: 'var(--red)' }}>{deleteError}</div>
            )}
          </div>
          <div className="modal-actions">
            <button type="button" onClick={() => setDeletingTask(null)} disabled={deleteLoading} className="btn btn-secondary">Cancel</button>
            <button type="button" onClick={confirmDelete} disabled={deleteLoading} className="btn btn-primary" style={{ background: 'var(--red)', borderColor: 'var(--red)', color: '#fff', boxShadow: 'none' }}>
              {deleteLoading ? <><Loader2 className="animate-spin" size={15} /> Deleting…</> : <><Trash2 size={15} /> Delete task</>}
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
