import { createClient } from '@/lib/supabase/server'
import { normalizeRole } from '@/lib/types'
import TemplateLibrary from './TemplateLibrary'

export default async function TemplatesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
  const role = normalizeRole(profile?.role)

  const { data: templates } = await supabase
    .from('task_templates')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  const [{ data: boards }, { data: workspaceMembers }] = await Promise.all([
    supabase.from('boards').select('id, name, workspace_id, workspaces(name)').eq('type', 'kanban').order('created_at'),
    supabase.from('workspace_members').select('workspace_id, profiles(id, full_name, email)').order('workspace_id'),
  ])

  return <div className="page-shell"><TemplateLibrary templates={(templates || []) as any} boards={(boards || []) as any} members={(workspaceMembers || []) as any} isAdmin={role === 'admin'} userId={user!.id} /></div>
}
