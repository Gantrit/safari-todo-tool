import { createClient } from '@/lib/supabase/server'
import { normalizeRole } from '@/lib/types'
import TemplateLibrary from './TemplateLibrary'

export default async function TemplatesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
  const role = normalizeRole(profile?.role)

  // Prefer the bundle shape (with template_items). If migration 019 hasn't run yet the join errors,
  // so fall back to the legacy single-task columns synthesised into a one-item bundle.
  const { data: richTemplates, error: templatesError } = await supabase
    .from('task_templates')
    .select('*, items:template_items(*)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  let templates = richTemplates
  if (templatesError) {
    const { data: legacy } = await supabase
      .from('task_templates')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    templates = (legacy || []).map((t: any) => ({
      ...t,
      items: [{ id: t.id, template_id: t.id, title: t.title, description: t.description, section: ['DAILY', 'WEEKLY', 'MONTHLY'].includes(t.section) ? t.section : 'DAILY', priority: t.priority, checklist: t.checklist || [], reference_url: t.reference_url, due_time: null, position: 0 }],
    })) as any
  }

  const [{ data: boards }, { data: workspaceMembers }] = await Promise.all([
    supabase.from('boards').select('id, name, workspace_id, workspaces(name)').eq('type', 'kanban').order('created_at'),
    supabase.from('workspace_members').select('workspace_id, profiles(id, full_name, email)').order('workspace_id'),
  ])

  return <div className="page-shell"><TemplateLibrary templates={(templates || []) as any} boards={(boards || []) as any} members={(workspaceMembers || []) as any} isAdmin={role === 'admin'} userId={user!.id} /></div>
}
