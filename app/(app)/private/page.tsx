import { createClient } from '@/lib/supabase/server'
import PrivateTodos from './PrivateTodos'

export default async function PrivatePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user!.id).single()

  // Private tasks: tasks created by and assigned to the same user, no board
  const { data: tasks } = await supabase
    .from('tasks')
    .select('*, subtasks(*), comments(*)')
    .eq('assigned_to', user!.id)
    .eq('created_by', user!.id)
    .is('board_id', null)
    .neq('status', 'APPROVED')
    .order('created_at', { ascending: false })

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>
        🔒 My Private Space
      </h1>
      <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>
        Only you can see these tasks
      </p>
      <PrivateTodos tasks={tasks || []} profile={profile!} />
    </div>
  )
}
