import { createClient } from '@/lib/supabase/server'
import { Lock } from 'lucide-react'
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
    .is('deleted_at', null)
    .neq('status', 'APPROVED')
    .order('created_at', { ascending: false })

  return (
    <div className="page-shell !max-w-[860px]">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Personal space</p>
          <h1 className="page-title">My private tasks</h1>
          <p className="page-description">Only you can see this list — no XP, no approvals, no audience.</p>
        </div>
        <span className="meta-pill !min-h-10 px-4"><Lock size={13} /> Private</span>
      </header>
      <section className="app-card p-5 sm:p-6">
        <PrivateTodos tasks={tasks || []} profile={profile!} />
      </section>
    </div>
  )
}
