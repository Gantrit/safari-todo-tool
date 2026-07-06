import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import GuildRoster from './GuildRoster'

export default async function GuildPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user!.id)
    .single()

  if (profile?.role !== 'admin') redirect('/dashboard')

  const [{ data: members }, { data: xpLog }, { data: acceptances }, { data: approvedTasks }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email, role, xp, level, rank, deactivated_at').order('xp', { ascending: false }),
    // Requires migration 012 (admin SELECT on xp_log) — degrades to own rows before that.
    supabase.from('xp_log').select('user_id, amount, reason, created_at').order('created_at', { ascending: false }).limit(300),
    supabase.from('quest_acceptances').select('user_id, status'),
    supabase.from('tasks').select('assignee_ids, assigned_to, completed_at, approved_at').eq('status', 'APPROVED').is('deleted_at', null),
  ])

  return (
    <div className="page-shell !max-w-[1180px]">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Administration</p>
          <h1 className="page-title">Guild Hall</h1>
          <p className="page-description">Manage every member&apos;s XP, level and quest record — award bonuses, apply corrections, keep the game fair.</p>
        </div>
      </header>
      <GuildRoster
        members={members || []}
        xpLog={xpLog || []}
        acceptances={acceptances || []}
        approvedTasks={approvedTasks || []}
        currentUserId={user!.id}
      />
    </div>
  )
}
