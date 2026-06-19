import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import BoardView from '@/components/board/BoardView'
import Link from 'next/link'

interface Props {
  params: Promise<{ boardId: string }>
}

export default async function BoardPage({ params }: Props) {
  const { boardId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: board } = await supabase
    .from('boards')
    .select('*')
    .eq('id', boardId)
    .single()

  if (!board) notFound()

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user!.id)
    .single()

  const { data: members } = await supabase
    .from('workspace_members')
    .select('profiles(*)')
    .eq('workspace_id', board.workspace_id)

  const memberProfiles = (members || [])
    .map((m: any) => m.profiles)
    .filter(Boolean)

  const { data: boards } = await supabase
    .from('boards')
    .select('*')
    .eq('workspace_id', board.workspace_id)
    .eq('type', 'kanban')
    .order('created_at', { ascending: true })

  const { data: richTasks, error: richTasksError } = await supabase
    .from('tasks')
    .select(`
      *,
      checklist_items(*),
      assigned_profile:profiles!tasks_assigned_to_fkey(*),
      creator_profile:profiles!tasks_created_by_fkey(*),
      subtasks(*),
      comments(*, profile:profiles(*), reactions(*)),
      attachments(*)
    `)
    .eq('board_id', boardId)
    .is('deleted_at', null)
    .order('position', { ascending: true })

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

  const tasks = (richTasks || legacyTasks || []).map((task: any) => ({
    ...task,
    deadline_at: task.deadline_at || task.due_date || null,
    assignee_ids: task.assignee_ids || [task.assigned_to].filter(Boolean),
    assignee_profiles: task.assignee_profiles || (task.assigned_profile ? [task.assigned_profile] : []),
  }))

  return (
    <div className="h-full overflow-hidden flex flex-col">
      <div className="px-6 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--border)', background: 'rgba(16,20,15,0.78)' }}>
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>
              Team Board
            </h1>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>Department tabs, employee columns, deadline-first execution.</p>
          </div>
          <Link href="/dashboard" className="rounded-[8px] px-3 py-2 text-sm font-semibold" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
            Dashboard
          </Link>
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {(boards && boards.length > 0 ? boards : [board]).map((dept: any) => (
            <Link
              key={dept.id}
              href={`/board/${dept.id}`}
              className="whitespace-nowrap rounded-[8px] px-3 py-2 text-sm font-semibold"
              style={{
                background: dept.id === board.id ? 'rgba(216,195,106,0.14)' : 'var(--surface2)',
                border: dept.id === board.id ? '1px solid rgba(216,195,106,0.45)' : '1px solid var(--border)',
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
