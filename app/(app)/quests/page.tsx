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

  const { data: acceptances } = await supabase.from('quest_acceptances').select('quest_id').eq('user_id', user!.id)

  return <div className="page-shell"><QuestBoard quests={(quests || []) as any} isAdmin={role === 'admin'} userId={user!.id} acceptedQuestIds={(acceptances || []).map((item) => item.quest_id)} /></div>
}
