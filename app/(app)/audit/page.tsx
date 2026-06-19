import { createClient } from '@/lib/supabase/server'
import { normalizeRole } from '@/lib/types'
import { formatRelative } from '@/lib/utils'
import { redirect } from 'next/navigation'

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ action?: string; entity?: string }> }) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user!.id).single()

  if (normalizeRole(profile?.role) !== 'admin') redirect('/dashboard')

  let query = supabase
    .from('audit_logs')
    .select('*, actor_profile:profiles(*)')
    .order('created_at', { ascending: false })
    .limit(100)

  if (params.action) query = query.ilike('action', `%${params.action}%`)
  if (params.entity) query = query.eq('entity_type', params.entity)

  const { data: logs } = await query

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--accent)' }}>Admin only</p>
        <h1 className="text-3xl font-bold" style={{ color: 'var(--text)' }}>Audit Log</h1>
        <p className="mt-1" style={{ color: 'var(--muted)' }}>Filterable history for task, XP, user, template, and quest actions.</p>
      </div>

      <form className="mb-5 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <input name="action" defaultValue={params.action || ''} placeholder="Filter action" className="rounded-[8px] px-3 py-2 text-sm outline-none" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
        <input name="entity" defaultValue={params.entity || ''} placeholder="Entity type, e.g. task" className="rounded-[8px] px-3 py-2 text-sm outline-none" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
        <button className="rounded-[8px] px-4 py-2 text-sm font-semibold" style={{ background: 'var(--accent)', color: '#070907' }}>Apply</button>
      </form>

      <div className="overflow-hidden rounded-[8px]" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="grid grid-cols-[1fr_1fr_1fr_1.4fr] gap-4 border-b px-4 py-3 text-xs uppercase tracking-wider" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
          <span>When</span>
          <span>Actor</span>
          <span>Action</span>
          <span>Details</span>
        </div>
        {(logs || []).length > 0 ? (
          (logs || []).map((log: any) => (
            <div key={log.id} className="grid grid-cols-[1fr_1fr_1fr_1.4fr] gap-4 border-b px-4 py-3 text-sm last:border-b-0" style={{ borderColor: 'var(--border)' }}>
              <span style={{ color: 'var(--muted)' }}>{formatRelative(log.created_at)}</span>
              <span className="truncate" style={{ color: 'var(--text)' }}>{log.actor_profile?.full_name || log.actor_profile?.email || 'System'}</span>
              <span style={{ color: 'var(--accent)' }}>{log.action}</span>
              <span className="truncate" style={{ color: 'var(--muted)' }}>{log.entity_type} {log.entity_id ? `- ${log.entity_id}` : ''}</span>
            </div>
          ))
        ) : (
          <div className="p-8 text-center text-sm" style={{ color: 'var(--muted)' }}>No audit entries yet, or the V1 migration has not been applied.</div>
        )}
      </div>
    </div>
  )
}
