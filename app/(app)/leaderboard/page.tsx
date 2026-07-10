import { createClient } from '@/lib/supabase/server'
import LeaderboardTabs from './LeaderboardTabs'

export default async function LeaderboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, email, xp, avatar_url, deactivated_at')
    .is('deactivated_at', null)
    .order('xp', { ascending: false })

  return (
    <div className="page-shell !max-w-[980px]">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Team standings</p>
          <h1 className="page-title">Leaderboard</h1>
          <p className="page-description">Who&apos;s carrying the guild — all-time legends and this period&apos;s hottest streaks.</p>
        </div>
      </header>
      <LeaderboardTabs profiles={profiles || []} currentUserId={user!.id} />
    </div>
  )
}
