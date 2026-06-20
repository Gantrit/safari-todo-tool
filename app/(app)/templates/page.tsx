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
    <div className="page-shell">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Reusable task structure</p>
          <h1 className="page-title">Templates</h1>
          <p className="page-description">Start recurring work from a consistent checklist and priority structure.</p>
        </div>
        {role === 'admin' && (
          <div className="meta-pill max-w-sm !min-h-10 px-4">
            Admins manage the team template library.
          </div>
        )}
      </header>

      {(templates || []).length > 0 ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {(templates || []).map((template: any) => (
            <article key={template.id} className="app-card flex min-h-[250px] flex-col p-6">
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
              <button className="btn btn-secondary mt-auto w-full">
                Use Template
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="app-card p-12 text-center">
          <h2 className="font-bold mb-2" style={{ color: 'var(--text)' }}>No templates yet</h2>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Reusable task structures will appear here when they are added.</p>
        </div>
      )}
    </div>
  )
}
