import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import SettingsForm from './SettingsForm'
import XpSettingsForm from './XpSettingsForm'

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ newWorkspace?: string; workspace?: string }> }) {
  const { newWorkspace, workspace: requestedWorkspaceId } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user!.id)
    .single()

  if (profile?.role !== 'admin') redirect('/dashboard')

  const { data: workspaceMembers } = await supabase
    .from('workspace_members')
    .select('*, profiles(*), workspaces(*)')
    .eq('user_id', user!.id)

  const allWorkspaces = (workspaceMembers || [])
    .map((member) => member.workspaces as any)
    .filter(Boolean)
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
  const workspace = allWorkspaces.find((candidate) => candidate.id === requestedWorkspaceId) || allWorkspaces[0]

  const { data: members } = workspace
    ? await supabase
        .from('workspace_members')
        .select('*, profiles(*)')
        .eq('workspace_id', workspace.id)
    : { data: [] }

  const { data: boards } = workspace
    ? await supabase.from('boards').select('*').eq('workspace_id', workspace.id)
    : { data: [] }

  const boardIds = (boards || []).map((b) => b.id)
  const { data: boardAccess } = boardIds.length
    ? await supabase.from('board_access').select('board_id, user_id').in('board_id', boardIds)
    : { data: [] }

  const { data: xpSettings } = await supabase.from('xp_settings').select('*').eq('id', true).maybeSingle()

  return (
    <div className="page-shell !max-w-[1180px]">
      <header className="page-header"><div><p className="page-eyebrow">Administration</p><h1 className="page-title">{newWorkspace === '1' || !workspace ? 'Create workspace' : 'Settings'}</h1><p className="page-description">Your team, its boards, access and XP rules — all in one place.</p></div></header>
      {newWorkspace !== '1' && allWorkspaces.length > 1 && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[.08em]" style={{ color: 'var(--muted)' }}>Workspace:</span>
          {allWorkspaces.map((candidate) => (
            <Link
              key={candidate.id}
              href={`/settings?workspace=${candidate.id}`}
              className="rounded-[9px] border px-3.5 py-2 text-[12.5px] font-bold transition-colors"
              style={{
                borderColor: candidate.id === workspace?.id ? 'var(--accent)' : 'var(--border)',
                color: candidate.id === workspace?.id ? 'var(--accent)' : 'var(--text-secondary)',
                background: candidate.id === workspace?.id ? 'var(--accent-dim)' : 'transparent',
              }}
            >
              {candidate.name}
            </Link>
          ))}
        </div>
      )}
      <SettingsForm
        workspace={newWorkspace === '1' ? null : workspace}
        members={members || []}
        boards={newWorkspace === '1' ? [] : boards || []}
        boardAccess={newWorkspace === '1' ? [] : boardAccess || []}
        currentUser={profile!}
      />
      {newWorkspace !== '1' && workspace && (
        <div className="mt-6">
          <XpSettingsForm initial={xpSettings} currentUserId={user!.id} />
        </div>
      )}
    </div>
  )
}
