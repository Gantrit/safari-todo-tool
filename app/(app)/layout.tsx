import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/sidebar/Sidebar'
import LevelUpWatcher from '@/components/ui/LevelUpWatcher'
import DeactivatedNotice from '@/components/ui/DeactivatedNotice'
import { getLevelInfo } from '@/lib/types'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [{ data: profile }, { data: workspaces }, { data: boards }, { data: notifications }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('workspaces').select('id, name, created_at').order('created_at', { ascending: true }),
    supabase.from('boards').select('*').order('created_at', { ascending: true }),
    supabase.from('notifications').select('*').eq('user_id', user.id).eq('read', false).order('created_at', { ascending: false }).limit(20),
  ])

  // Deactivated members keep their data but lose access.
  if (profile?.deactivated_at) return <DeactivatedNotice />

  return (
    <div className="flex h-full overflow-hidden" style={{ background: 'var(--bg)' }}>
      <Sidebar
        profile={profile}
        workspaces={workspaces || []}
        boards={boards || []}
        notifications={notifications || []}
      />
      <main className="min-w-0 flex-1 overflow-auto pt-16 lg:pt-0">
        {children}
      </main>
      {profile && (
        <LevelUpWatcher
          userId={profile.id}
          xp={profile.xp || 0}
          level={getLevelInfo(profile.xp || 0).current.level}
          rank={getLevelInfo(profile.xp || 0).current.title}
        />
      )}
    </div>
  )
}
