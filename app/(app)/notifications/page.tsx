import { createClient } from '@/lib/supabase/server'
import { formatRelative } from '@/lib/utils'
import MarkAllRead from './MarkAllRead'

export default async function NotificationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: notifications } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })
    .limit(50)

  const TYPE_ICONS: Record<string, string> = {
    assignment: '📋',
    mention: '@',
    reminder: '⏰',
    result_submitted: '📤',
    approved: '✅',
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>
          Notifications
        </h1>
        <MarkAllRead userId={user!.id} />
      </div>

      <div className="space-y-2">
        {(notifications || []).length === 0 && (
          <p style={{ color: 'var(--muted)' }}>No notifications yet.</p>
        )}
        {(notifications || []).map((n) => (
          <div
            key={n.id}
            className="flex items-start gap-3 p-4 rounded-[10px] transition-all"
            style={{
              background: n.read ? 'var(--surface)' : 'var(--surface2)',
              border: `1px solid ${n.read ? 'var(--border)' : 'rgba(200,240,96,0.2)'}`,
            }}
          >
            <span className="text-base flex-shrink-0">{TYPE_ICONS[n.type] || '🔔'}</span>
            <div className="flex-1">
              <p className="text-sm" style={{ color: 'var(--text)' }}>{n.message}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{formatRelative(n.created_at)}</p>
            </div>
            {!n.read && (
              <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1" style={{ background: 'var(--accent)' }} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
