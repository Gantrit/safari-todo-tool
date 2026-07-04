import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils'
import { Archive as ArchiveIcon, CheckCircle2 } from 'lucide-react'
import PriorityBadge from '@/components/ui/PriorityBadge'

export default async function ArchivePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: archive } = await supabase
    .from('archive')
    .select('*, task:tasks(*, assigned_profile:profiles!tasks_assigned_to_fkey(*))')
    .eq('user_id', user!.id)
    .order('archived_at', { ascending: false })

  const items = archive || []

  return (
    <div className="page-shell !max-w-[860px]">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Completed work</p>
          <h1 className="page-title">Archive</h1>
          <p className="page-description">Every approved task lands here — your track record at Safari Studios.</p>
        </div>
        <span className="meta-pill !min-h-10 px-4"><CheckCircle2 size={14} /> {items.length} approved</span>
      </header>

      <section className="app-card">
        {items.length === 0 ? (
          <div className="card-empty min-h-[280px]">
            <div>
              <ArchiveIcon className="mx-auto mb-4" size={28} style={{ color: 'var(--muted)' }} />
              <h2 className="font-bold">Nothing archived yet</h2>
              <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>Tasks appear here once an admin approves them.</p>
            </div>
          </div>
        ) : (
          <div>
            {items.map((item: any) => (
              <div key={item.id} className="flex items-center gap-4 border-b px-5 py-4 last:border-b-0 sm:px-6" style={{ borderColor: 'var(--border)' }}>
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[9px]" style={{ background: 'var(--green-dim)', color: 'var(--green)' }}><CheckCircle2 size={16} /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold" style={{ color: 'var(--text)', textDecoration: 'line-through', opacity: 0.65 }}>{item.task?.title || 'Deleted task'}</p>
                  <p className="mt-1 text-[11px]" style={{ color: 'var(--muted)' }}>Approved {formatDate(item.archived_at)}</p>
                </div>
                {item.task?.priority && <PriorityBadge priority={item.task.priority} />}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
