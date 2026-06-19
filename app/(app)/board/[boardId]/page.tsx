import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import BoardView from '@/components/board/BoardView'

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

  const { data: tasks } = await supabase
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

  return (
    <div className="h-full overflow-hidden flex flex-col">
      <div className="px-6 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
        <h1 className="text-xl font-bold" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>
          {board.name}
        </h1>
      </div>
      <div className="flex-1 overflow-hidden">
        <BoardView
          board={board}
          members={memberProfiles}
          tasks={tasks || []}
          currentUser={profile!}
        />
      </div>
    </div>
  )
}
