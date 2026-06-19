import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SettingsForm from './SettingsForm'

export default async function SettingsPage() {
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
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>
        Settings
      </h1>
      <SettingsForm
        workspace={workspace}
        members={members || []}
        boards={boards || []}
        currentUser={profile!}
      />
    </div>
  )
}
