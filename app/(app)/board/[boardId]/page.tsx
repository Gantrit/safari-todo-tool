import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import BoardView from '@/components/board/BoardView'
import Link from 'next/link'
import { ArrowLeft, LayoutGrid } from 'lucide-react'

interface Props {
  params: Promise<{ boardId: string }>
}

export default async function BoardPage({ params }: Props) {
  const { boardId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: board } = await supabase
    .from('boards')
    .select('*, workspaces(id, name)')
    .eq('id', boardId)
    .single()

  if (!board) notFound()

  const [{ data: profile }, { data: members }, { data: boards }, { data: richTasks, error: richTasksError }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user!.id).single(),
    supabase.from('workspace_members').select('profiles(*)').eq('workspace_id', board.workspace_id),
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
  ])

  const memberProfiles = (members || []).map((m: any) => m.profiles).filter(Boolean)

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

  const tasks = (richTasks || legacyTasks || []).map((task: any) => {
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
      <div className="flex-shrink-0 border-b px-5 py-5 sm:px-8" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.09em]" style={{ color: 'var(--text-secondary)' }}><LayoutGrid size={13} /> {workspace?.name || 'Workspace'} <span style={{ color: 'var(--muted)' }}>→</span> Boards</div>
            <h1 className="text-2xl font-extrabold tracking-[-.02em]">{board.name}</h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>{workspace?.name ? `${workspace.name} workspace` : 'Team workspace'} · Deadline-first execution across every member.</p>
          </div>
          <Link href="/dashboard" className="btn btn-secondary self-start sm:self-auto"><ArrowLeft size={16} /> Dashboard</Link>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Department boards">
          {(boards && boards.length > 0 ? boards : [board]).map((dept: any) => (
            <Link
              key={dept.id}
              href={`/board/${dept.id}`}
              className="inline-flex min-h-9 items-center whitespace-nowrap rounded-[var(--radius-sm)] border px-4 text-[13px] font-semibold transition-colors"
              style={{
                background: dept.id === board.id ? 'var(--accent-dim)' : 'transparent',
                borderColor: dept.id === board.id ? 'var(--border-strong)' : 'var(--border)',
                color: dept.id === board.id ? 'var(--accent)' : 'var(--muted)',
              }}
            >
              {dept.name}
            </Link>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <BoardView
          key={board.id}
          board={board}
          departments={boards || []}
          members={memberProfiles}
          tasks={tasks}
          currentUser={profile!}
        />
      </div>
    </div>
  )
}
