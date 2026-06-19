import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils'
import PriorityBadge from '@/components/ui/PriorityBadge'

export default async function ArchivePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: archive } = await supabase
    .from('archive')
    .select('*, task:tasks(*, assigned_profile:profiles!tasks_assigned_to_fkey(*))')
    .eq('user_id', user!.id)
    .order('archived_at', { ascending: false })

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>
        Archive
      </h1>

      <div className="space-y-2">
        {(archive || []).length === 0 && (
          <p style={{ color: 'var(--muted)' }}>No archived tasks yet.</p>
        )}
        {(archive || []).map((item: any) => (
          <div
            key={item.id}
            className="flex items-center gap-4 p-4 rounded-[10px]"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <span className="text-base">✅</span>
            <div className="flex-1">
              <p
                className="text-sm font-medium"
                style={{ color: 'var(--text)', textDecoration: 'line-through', opacity: 0.6 }}
              >
                {item.task?.title}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                Archived {formatDate(item.archived_at)}
              </p>
            </div>
            {item.task?.priority && <PriorityBadge priority={item.task.priority} />}
          </div>
        ))}
      </div>
    </div>
  )
}
