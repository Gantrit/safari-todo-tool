'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { Task, Profile, TaskSection, canWriteTasks } from '@/lib/types'
import MemberColumn from './MemberColumn'
import MemberRowsView from './MemberRowsView'
import TableView from './TableView'
import BoardViewSwitcher from './BoardViewSwitcher'
import BoardFilterBar from './BoardFilterBar'
import TaskModal from '../task/TaskModal'
import TaskForm from '../task/TaskForm'
import Modal from '../ui/Modal'
import EmptyState from '../ui/EmptyState'
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
import { berlinDefaultDeadline, getInitials } from '@/lib/utils'
import {
  BoardViewMode,
  BoardFilters,
  EMPTY_FILTERS,
  filterTasks,
  loadBoardViewState,
  saveBoardViewState,
} from '@/lib/boardViews'
import { AlertTriangle, LayoutGrid, Loader2, Plus, Trash2, UserRound, Users } from 'lucide-react'

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

  // View + filter state (persisted per board in localStorage)
  const [view, setView] = useState<BoardViewMode>('members')
  const [focusMemberId, setFocusMemberId] = useState<string | null>(currentUser.id)
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([currentUser.id])
  const [filters, setFilters] = useState<BoardFilters>(EMPTY_FILTERS)
  const [hydrated, setHydrated] = useState(false)

  const supabase = createClient()

  // Hydrate persisted view/filters after mount. Doing this in an effect (not a
  // lazy initializer) is deliberate: the component is SSR-rendered, so reading
  // localStorage during render would cause a hydration mismatch.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const saved = loadBoardViewState(board.id)
    if (saved) {
      if (saved.view) setView(saved.view)
      if (saved.focusMemberId !== undefined) setFocusMemberId(saved.focusMemberId)
      if (saved.selectedMemberIds) setSelectedMemberIds(saved.selectedMemberIds)
      if (saved.filters) setFilters({ ...EMPTY_FILTERS, ...saved.filters })
    }
    setHydrated(true)
  }, [board.id])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!hydrated) return
    saveBoardViewState(board.id, { view, focusMemberId, selectedMemberIds, filters })
  }, [hydrated, board.id, view, focusMemberId, selectedMemberIds, filters])

  const liveTasks = useMemo(() => tasks.filter((t) => !t.deleted_at), [tasks])
  const filteredTasks = useMemo(() => filterTasks(liveTasks, filters), [liveTasks, filters])
  const creators = useMemo(
    () => members.filter((m) => liveTasks.some((t) => t.created_by === m.id)),
    [members, liveTasks]
  )
  const focusMember = members.find((m) => m.id === focusMemberId) || members.find((m) => m.id === currentUser.id) || members[0] || null
  const selectedMembers = members.filter((m) => selectedMemberIds.includes(m.id))

  const toggleSelected = (id: string) =>
    setSelectedMemberIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]))

  const openDelete = (task: Task) => { setDeleteError(null); setDeletingTask(task) }
  const openFullForm = (memberId: string, section: TaskSection) => setAddingFor({ memberId, section })

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
            <BoardViewSwitcher view={view} onChange={setView} />
            <div className="flex items-center gap-3">
              <span className="hidden text-[11px] font-semibold sm:inline" style={{ color: 'var(--muted)' }}>{members.length} {members.length === 1 ? 'member' : 'members'} · {liveTasks.filter((t) => t.status !== 'APPROVED').length} active</span>
              {canWriteTasks(currentUser.role) && <button onClick={() => defaultMember && setAddingFor({ memberId: defaultMember.id, section: 'DAILY' })} disabled={!defaultMember} className="btn btn-primary"><Plus size={16} /> Create task</button>}
            </div>
          </div>

          {members.length > 0 ? (
            <>
              <div className="flex flex-none flex-col gap-3 border-b px-5 py-4 sm:px-6" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                {view === 'focus' && (
                  <div className="board-list-toolbar !mb-0">
                    <span className="text-[11px] font-bold uppercase tracking-[.08em]" style={{ color: 'var(--muted)' }}>Focus on</span>
                    {members.map((m) => (
                      <button key={m.id} onClick={() => setFocusMemberId(m.id)} className={`filter-chip ${focusMember?.id === m.id ? 'is-active' : ''}`}>
                        <span className="flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-extrabold" style={{ background: 'var(--surface3)', color: 'var(--text)' }}>{getInitials(m.full_name || m.email)}</span>
                        {m.full_name?.split(' ')[0] || m.email}
                      </button>
                    ))}
                  </div>
                )}
                {view === 'selection' && (
                  <div className="board-list-toolbar !mb-0">
                    <span className="text-[11px] font-bold uppercase tracking-[.08em]" style={{ color: 'var(--muted)' }}>Members</span>
                    {members.map((m) => (
                      <button key={m.id} onClick={() => toggleSelected(m.id)} className={`filter-chip ${selectedMemberIds.includes(m.id) ? 'is-active' : ''}`}>
                        <span className="flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-extrabold" style={{ background: 'var(--surface3)', color: 'var(--text)' }}>{getInitials(m.full_name || m.email)}</span>
                        {m.full_name?.split(' ')[0] || m.email}
                      </button>
                    ))}
                    <div className="ml-auto flex gap-2">
                      <button onClick={() => setSelectedMemberIds(members.map((m) => m.id))} className="filter-chip">All</button>
                      <button onClick={() => setSelectedMemberIds([])} className="filter-chip">None</button>
                    </div>
                  </div>
                )}
                <BoardFilterBar filters={filters} onChange={setFilters} creators={creators} />
              </div>

              {view === 'columns' ? (
                <div className={`board-columns board-canvas ${members.length === 1 ? 'is-single' : ''}`}>
                  {members.map((member) => (
                    <MemberColumn
                      key={member.id}
                      member={member}
                      tasks={filteredTasks.filter((t) => (t.assignee_ids || [t.assigned_to]).filter(Boolean).includes(member.id))}
                      onTaskClick={setSelectedTask}
                      onAddTask={openFullForm}
                      onQuickAdd={handleQuickAdd}
                      onDelete={openDelete}
                      currentUser={currentUser}
                    />
                  ))}
                </div>
              ) : (
                <div className="board-scroll">
                  {view === 'members' && (
                    <MemberRowsView members={members} tasks={filteredTasks} currentUser={currentUser} onTaskClick={setSelectedTask} onAddTask={openFullForm} onQuickAdd={handleQuickAdd} onDelete={openDelete} />
                  )}
                  {view === 'table' && (
                    <TableView tasks={filteredTasks} members={members} currentUser={currentUser} onTaskClick={setSelectedTask} onDelete={openDelete} />
                  )}
                  {view === 'focus' && (focusMember ? (
                    <MemberRowsView members={[focusMember]} tasks={filteredTasks} currentUser={currentUser} collapsible={false} initiallyExpanded onTaskClick={setSelectedTask} onAddTask={openFullForm} onQuickAdd={handleQuickAdd} onDelete={openDelete} />
                  ) : (
                    <div className="board-stack"><div className="app-card"><EmptyState tone="muted" icon={<UserRound size={22} />} title="No one to focus on" text="Add a team member to this board first." /></div></div>
                  ))}
                  {view === 'selection' && (selectedMembers.length > 0 ? (
                    <MemberRowsView members={selectedMembers} tasks={filteredTasks} currentUser={currentUser} initiallyExpanded onTaskClick={setSelectedTask} onAddTask={openFullForm} onQuickAdd={handleQuickAdd} onDelete={openDelete} />
                  ) : (
                    <div className="board-stack"><div className="app-card"><EmptyState tone="muted" icon={<Users size={22} />} title="No members selected" text="Pick one or more members above to see just their tasks." /></div></div>
                  ))}
                </div>
              )}
            </>
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
