import { createClient } from '@/lib/supabase/server'
import { normalizeRole } from '@/lib/types'
import QuestBoard from './QuestBoard'

export default async function QuestsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
  const role = normalizeRole(profile?.role)

  const { data: quests } = await supabase
    .from('quests')
    .select('*, departments(name)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  // Admins see every acceptance (for review); employees see their own (RLS enforces this)
  const { data: acceptances } = await supabase
    .from('quest_acceptances')
    .select('*, profile:profiles(id, full_name, email)')
    .order('accepted_at', { ascending: true })

  const { data: categories } = await supabase
    .from('departments')
    .select('id, name')
    .order('position', { ascending: true })

  return (
    <div className="page-shell">
      <QuestBoard
        quests={(quests || []) as any}
        acceptances={(acceptances || []) as any}
        categories={(categories || []) as any}
        isAdmin={role === 'admin'}
        userId={user!.id}
      />
    </div>
  )
}
