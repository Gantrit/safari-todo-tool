import { createClient } from '@/lib/supabase/server'
import ArchiveView from './ArchiveView'

export default async function ArchivePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: archive }, { data: questAcceptances }] = await Promise.all([
    supabase
      .from('archive')
      .select('*, task:tasks(*, assigned_profile:profiles!tasks_assigned_to_fkey(*))')
      .eq('user_id', user!.id)
      .order('archived_at', { ascending: false }),
    supabase
      .from('quest_acceptances')
      .select('id, status, reviewed_at, accepted_at, quest:quests(id, title, bonus_xp, departments(name))')
      .eq('user_id', user!.id)
      .eq('status', 'APPROVED')
      .order('reviewed_at', { ascending: false }),
  ])

  const tasks = (archive || []).map((item: any) => ({
    id: item.id,
    title: item.task?.title || 'Deleted task',
    priority: item.task?.priority || null,
    date: item.archived_at as string,
  }))

  const quests = (questAcceptances || []).map((a: any) => ({
    id: a.id,
    title: a.quest?.title || 'Deleted quest',
    bonusXp: a.quest?.bonus_xp ?? 0,
    category: a.quest?.departments?.name || null,
    date: (a.reviewed_at || a.accepted_at) as string,
  }))

  return (
    <div className="h-full overflow-auto">
      <ArchiveView tasks={tasks} quests={quests} />
    </div>
  )
}
