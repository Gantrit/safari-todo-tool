import { createClient } from '@/lib/supabase/server'
import { canManageTeam, normalizeRole } from '@/lib/types'
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

  const { data: boards } = await supabase.from('boards').select('id, name, workspace_id, workspaces(name)').eq('type', 'kanban').order('created_at')

  // Assignee choices must be scoped to who actually has board_access to EACH board
  // (board_members RPC, migration 030) — not every workspace member. Templates used
  // to offer every workspace member regardless of the selected board, so it was easy
  // to assign a task to someone who has no access to that board: the task would be
  // created there but never show up as a column for them anywhere.
  const boardMemberLists = await Promise.all(
    (boards || []).map((board: any) => supabase.rpc('board_members', { p_board_id: board.id }))
  )
  const boardMembers: Record<string, { id: string; full_name: string; email: string }[]> = {}
  ;(boards || []).forEach((board: any, i: number) => {
    boardMembers[board.id] = (boardMemberLists[i].data as any[]) || []
  })

  return <div className="page-shell"><TemplateLibrary templates={(templates || []) as any} boards={(boards || []) as any} boardMembers={boardMembers} isAdmin={role === 'admin'} canManage={canManageTeam(role)} userId={user!.id} /></div>
}
