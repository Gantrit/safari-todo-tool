import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SettingsForm from './SettingsForm'

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ newWorkspace?: string }> }) {
  const { newWorkspace } = await searchParams
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

  const workspace = workspaceMembers?.[0]?.workspaces as any

  const { data: members } = workspace
    ? await supabase
        .from('workspace_members')
        .select('*, profiles(*)')
        .eq('workspace_id', workspace.id)
    : { data: [] }

  const { data: boards } = workspace
    ? await supabase.from('boards').select('*').eq('workspace_id', workspace.id)
    : { data: [] }

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 lg:py-10">
      <div className="mb-8"><p className="mb-2 text-[11px] font-extrabold uppercase tracking-[.18em]" style={{ color: 'var(--accent)' }}>Administration</p><h1 className="text-3xl font-extrabold tracking-[-.03em]">{newWorkspace === '1' || !workspace ? 'Create workspace' : 'Workspace settings'}</h1><p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>Manage the team, boards, and workspace defaults.</p></div>
      <SettingsForm
        workspace={newWorkspace === '1' ? null : workspace}
        members={members || []}
        boards={newWorkspace === '1' ? [] : boards || []}
        currentUser={profile!}
      />
    </div>
  )
}
