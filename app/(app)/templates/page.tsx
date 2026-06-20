import { createClient } from '@/lib/supabase/server'
import { normalizeRole } from '@/lib/types'
import { ClipboardList } from 'lucide-react'

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

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--accent)' }}>Reusable task structure</p>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--text)' }}>Templates</h1>
          <p className="mt-1" style={{ color: 'var(--muted)' }}>Everyone can use templates. Admins can create, edit, and delete them.</p>
        </div>
        {role === 'admin' && (
          <div className="rounded-[8px] px-4 py-3 text-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
            Use the `task_templates` table for admin-managed template CRUD.
          </div>
        )}
      </div>

      {(templates || []).length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(templates || []).map((template: any) => (
            <article key={template.id} className="rounded-[8px] p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="mb-4 flex items-start gap-3">
                <div className="rounded-[8px] p-2" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                  <ClipboardList size={18} />
                </div>
                <div className="min-w-0">
                  <h2 className="font-bold" style={{ color: 'var(--text)' }}>{template.title}</h2>
                  <p className="text-sm mt-1 line-clamp-3" style={{ color: 'var(--muted)' }}>{template.description || 'No description.'}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded px-2 py-1" style={{ color: 'var(--accent)', border: '1px solid var(--border-strong)' }}>{template.section}</span>
                <span className="rounded px-2 py-1" style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}>{template.priority}</span>
                <span className="rounded px-2 py-1" style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}>{(template.checklist || []).length} checklist items</span>
              </div>
              <button className="mt-5 w-full rounded-[8px] px-3 py-2 text-sm font-semibold" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                Use Template
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-[8px] p-8 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <h2 className="font-bold mb-2" style={{ color: 'var(--text)' }}>No templates yet</h2>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Create SOP-style templates for repeated tasks after applying the V1 migration.</p>
        </div>
      )}
    </div>
  )
}
