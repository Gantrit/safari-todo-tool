import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import BoardView from '@/components/board/BoardView'
import Link from 'next/link'
import { ArrowLeft, LayoutGrid } from 'lucide-react'
import { sortBoards } from '@/lib/utils'

interface Props {
  params: Promise<{ boardId: string }>
}

export default async function BoardPage({ params }: Props) {
  const { boardId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Materialize any recurring occurrences that are due but haven't been reviewed
  // yet, so today's recurring tasks appear on schedule regardless of whether the
  // previous one was approved/rejected. Idempotent SECURITY DEFINER catch-up
  // (migration 044); must run before the tasks read below so new rows show up in
  // this same render. Ignored silently if 044 hasn't been applied yet.
  await supabase.rpc('ensure_recurring_occurrences')

  const { data: board } = await supabase
    .from('boards')
    .select('*, workspaces(id, name)')
    .eq('id', boardId)
    .single()

  if (!board) notFound()

  // One parallel batch for every independent read this page needs — including the
  // current user's quest acceptances — so the board renders after a single round of
  // DB round-trips instead of chaining them one after another.
  const [{ data: profile }, boardMembersRes, { data: boards }, { data: richTasks, error: richTasksError }, { data: questRows }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user!.id).single(),
    // Columns are the members with access to THIS board (SECURITY DEFINER fn, migration 030).
    supabase.rpc('board_members', { p_board_id: boardId }),
    supabase.from('boards').select('*').eq('workspace_id', board.workspace_id).eq('type', 'kanban').order('created_at', { ascending: true }),
    supabase.from('tasks').select(`
      *,
      checklist_items(*),
      assigned_profile:profiles!tasks_assigned_to_fkey(*),
      creator_profile:profiles!tasks_created_by_fkey(*),
      subtasks(*),
      comments(*, profile:profiles(*), reactions(*)),
      attachments(*)
    `).eq('board_id', boardId).is('deleted_at', null).order('position', { ascending: true }),
    // RLS only exposes a user's own acceptances, so this is exactly the "my accepted
    // quest shows up in my to-dos" case — quests keep their accept/submit/approve flow on /quests.
    supabase.from('quest_acceptances').select('id, status, quest:quests(id, title, deadline_at, status, deleted_at)').eq('user_id', user!.id).in('status', ['ACCEPTED', 'DONE']),
  ])

  // Fallback keeps the board working if migration 030 hasn't run yet (RPC missing):
  // fall back to every workspace member (the old, pre-030 behaviour).
  let memberProfiles: any[]
  if (boardMembersRes.error) {
    const { data: legacyMembers } = await supabase
      .from('workspace_members')
      .select('profiles(*)')
      .eq('workspace_id', board.workspace_id)
    memberProfiles = (legacyMembers || []).map((m: any) => m.profiles).filter(Boolean)
  } else {
    memberProfiles = (boardMembersRes.data as any[]) || []
  }
  const orderedBoards = sortBoards(boards || [])

  // The current user's still-open quests, surfaced as read-only to-dos in their
  // own board column (fetched in the parallel batch above).
  const questTodos = (questRows || [])
    .map((row: any) => {
      const quest = Array.isArray(row.quest) ? row.quest[0] : row.quest
      if (!quest || quest.deleted_at) return null
      return {
        acceptance_id: row.id,
        quest_id: quest.id,
        user_id: user!.id,
        title: quest.title,
        deadline_at: quest.deadline_at || null,
        status: row.status,
      }
    })
    .filter(Boolean)

  const { data: legacyTasks } = richTasksError
    ? await supabase
        .from('tasks')
        .select(`
          *,
          assigned_profile:profiles!tasks_assigned_to_fkey(*),
          creator_profile:profiles!tasks_created_by_fkey(*),
          subtasks(*),
          comments(*, profile:profiles(*), reactions(*)),
          attachments(*)
        `)
        .eq('board_id', boardId)
        .order('position', { ascending: true })
    : { data: null }

  // Safety net against "orphan" tasks: a task can be assigned to someone who is
  // NOT a board_access member of THIS board (e.g. a template assigned to the wrong
  // board before the per-board scoping fix). Such a task is counted but renders in
  // no column — invisible and impossible to find or delete. Add a column for any
  // assignee that actually has a task here, so every task always has a visible home.
  // New assignments are access-guarded server-side (migration 036), so in normal
  // operation this only ever surfaces pre-existing orphans for cleanup.
  const rawTaskRows = (richTasks || legacyTasks || []) as any[]
  const memberIdSet = new Set(memberProfiles.map((m: any) => m.id))
  const orphanIds = [...new Set(
    rawTaskRows
      .flatMap((t: any) => (t.assignee_ids?.length ? t.assignee_ids : [t.assigned_to]))
      .filter((id: string) => id && !memberIdSet.has(id))
  )]
  if (orphanIds.length > 0) {
    const { data: orphanProfiles } = await supabase.from('profiles').select('*').in('id', orphanIds)
    memberProfiles = [...memberProfiles, ...((orphanProfiles as any[]) || [])]
  }

  const tasks = rawTaskRows.map((task: any) => {
    const assigneeIds = task.assignee_ids || [task.assigned_to].filter(Boolean)
    return {
      ...task,
      deadline_at: task.deadline_at || task.due_date || null,
      assignee_ids: assigneeIds,
      assignee_profiles: memberProfiles.filter((member: any) => assigneeIds.includes(member.id)),
    }
  })
  const workspace = Array.isArray((board as any).workspaces) ? (board as any).workspaces[0] : (board as any).workspaces

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Compact single-row header — the vertical space belongs to the to-dos below. */}
      <div className="flex-shrink-0 border-b px-5 py-3.5 sm:px-8" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[8px]" style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--border-strong)' }}><LayoutGrid size={15} /></span>
            <h1 className="truncate text-[19px] font-extrabold leading-tight tracking-[-.02em]">{board.name === 'Team Board' && workspace?.name ? `${workspace.name} Board` : board.name}</h1>
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto" aria-label="Department boards">
            {(orderedBoards.length > 0 ? orderedBoards : [board]).map((dept: any) => (
              <Link
                key={dept.id}
                href={`/board/${dept.id}`}
                className="inline-flex min-h-8 items-center whitespace-nowrap rounded-[var(--radius-sm)] border px-3.5 text-[12.5px] font-semibold transition-colors"
                style={{
                  background: dept.id === board.id ? 'var(--accent-dim)' : 'transparent',
                  borderColor: dept.id === board.id ? 'var(--border-strong)' : 'var(--border)',
                  color: dept.id === board.id ? 'var(--accent)' : 'var(--muted)',
                }}
              >
                {dept.name === 'Team Board' && workspace?.name ? 'Workspace Board' : dept.name}
              </Link>
            ))}
          </div>
          <Link href="/dashboard" className="btn btn-secondary !min-h-9 flex-none !px-4 !text-[12.5px]"><ArrowLeft size={15} /> Dashboard</Link>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <BoardView
          key={board.id}
          board={board}
          departments={orderedBoards}
          members={memberProfiles}
          tasks={tasks}
          questTodos={questTodos as any}
          currentUser={profile!}
        />
      </div>
    </div>
  )
}
