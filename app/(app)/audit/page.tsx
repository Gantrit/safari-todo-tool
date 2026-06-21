import { createClient } from '@/lib/supabase/server'
import { normalizeRole } from '@/lib/types'
import { formatRelative } from '@/lib/utils'
import { redirect } from 'next/navigation'
import { Filter, History, Search } from 'lucide-react'

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ action?: string; entity?: string }> }) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
  if (normalizeRole(profile?.role) !== 'admin') redirect('/dashboard')

  let query = supabase.from('audit_logs').select('*, actor_profile:profiles(*)').order('created_at', { ascending: false }).limit(100)
  if (params.action) query = query.ilike('action', `%${params.action}%`)
  if (params.entity) query = query.eq('entity_type', params.entity)
  const { data: logs } = await query

  return <div className="page-shell">
    <header className="page-header"><div><p className="page-eyebrow">Administration</p><h1 className="page-title">Audit log</h1><p className="page-description">A chronological record of task, XP, user, template, and quest activity.</p></div><span className="meta-pill !min-h-10 px-4"><History size={14} /> Latest 100 events</span></header>

    <section className="app-card mb-6">
      <div className="card-header"><div><h2 className="flex items-center gap-2 font-bold"><Filter size={16} style={{ color: 'var(--accent)' }} /> Filter activity</h2><p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>Narrow the history by action text or exact entity type.</p></div></div>
      <form className="grid gap-4 p-5 sm:p-6 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <label><span className="form-label">Action contains</span><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2" size={14} style={{ color: 'var(--muted)' }} /><input name="action" defaultValue={params.action || ''} placeholder="e.g. status changed" className="form-control !pl-9" /></div></label>
        <label><span className="form-label">Entity type</span><input name="entity" defaultValue={params.entity || ''} placeholder="e.g. task" className="form-control" /></label>
        <button className="btn btn-primary">Apply filters</button>
      </form>
    </section>

    <section className="app-card">
      <div className="card-header"><div><h2 className="font-bold">Activity history</h2><p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>{logs?.length || 0} matching events</p></div></div>
      {(logs || []).length ? <div className="overflow-x-auto"><table className="app-table !rounded-none !border-0"><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Details</th></tr></thead><tbody>{(logs || []).map((log: any) => <tr key={log.id}><td className="whitespace-nowrap"><span style={{ color: 'var(--text-secondary)' }}>{formatRelative(log.created_at)}</span><span className="mt-1 block text-[10px]" style={{ color: 'var(--muted)' }}>{new Date(log.created_at).toLocaleString()}</span></td><td><strong className="block max-w-[180px] truncate text-xs">{log.actor_profile?.full_name || log.actor_profile?.email || 'System'}</strong></td><td><span className="inline-flex rounded-[6px] px-2 py-1 text-[11px] font-bold" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>{humanize(log.action)}</span></td><td><div className="min-w-[260px]"><span className="text-xs font-semibold capitalize">{humanize(log.entity_type)}</span>{log.entity_id && <code className="ml-2 rounded px-1.5 py-1 text-[10px]" style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>{shortId(log.entity_id)}</code>}<Metadata metadata={log.metadata} /></div></td></tr>)}</tbody></table></div> : <div className="card-empty min-h-[260px]"><div><History className="mx-auto mb-3" size={25} style={{ color: 'var(--muted)' }} /><h3 className="font-bold">No matching activity</h3><p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>Try clearing or broadening the filters.</p></div></div>}
    </section>
  </div>
}

function humanize(value: string) { return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) }
function shortId(value: string) { return value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value }
function Metadata({ metadata }: { metadata?: Record<string, unknown> }) {
  const entries = Object.entries(metadata || {}).slice(0, 3)
  if (!entries.length) return null
  return <div className="mt-2 flex flex-wrap gap-1.5">{entries.map(([key, value]) => <span key={key} className="text-[10px]" style={{ color: 'var(--muted)' }}><strong style={{ color: 'var(--text-secondary)' }}>{humanize(key)}:</strong> {typeof value === 'string' ? shortId(value) : String(value)}</span>)}</div>
}
