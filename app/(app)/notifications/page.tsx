import { createClient } from '@/lib/supabase/server'
import { formatRelative } from '@/lib/utils'
import { AlertTriangle, AtSign, Bell, CheckCircle2, Clock3, MessageSquare, Send, ShieldAlert, UserPlus, XCircle } from 'lucide-react'
import MarkAllRead from './MarkAllRead'

const TYPE_META: Record<string, { icon: React.ReactNode; color: string }> = {
  assignment: { icon: <UserPlus size={15} />, color: 'var(--blue)' },
  mention: { icon: <AtSign size={15} />, color: 'var(--blue)' },
  reminder: { icon: <Clock3 size={15} />, color: 'var(--amber)' },
  result_submitted: { icon: <Send size={15} />, color: 'var(--accent)' },
  approved: { icon: <CheckCircle2 size={15} />, color: 'var(--green)' },
  overdue: { icon: <AlertTriangle size={15} />, color: 'var(--red)' },
  comment: { icon: <MessageSquare size={15} />, color: 'var(--text-secondary)' },
  rejected: { icon: <XCircle size={15} />, color: 'var(--red)' },
  need_clarification: { icon: <ShieldAlert size={15} />, color: 'var(--amber)' },
  notice_sla_missed: { icon: <ShieldAlert size={15} />, color: 'var(--red)' },
}

export default async function NotificationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: notifications } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })
    .limit(50)

  const items = notifications || []
  const unread = items.filter((n) => !n.read).length

  return (
    <div className="page-shell !max-w-[860px]">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Activity</p>
          <h1 className="page-title">Notifications</h1>
          <p className="page-description">{unread ? `${unread} unread update${unread === 1 ? '' : 's'} waiting for you.` : 'You are all caught up.'}</p>
        </div>
        {unread > 0 && <MarkAllRead userId={user!.id} />}
      </header>

      <section className="app-card">
        {items.length === 0 ? (
          <div className="card-empty min-h-[280px]">
            <div>
              <Bell className="mx-auto mb-4" size={28} style={{ color: 'var(--muted)' }} />
              <h2 className="font-bold">No notifications yet</h2>
              <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>Team activity that concerns you will appear here.</p>
            </div>
          </div>
        ) : (
          <div>
            {items.map((n) => {
              const meta = TYPE_META[n.type] || { icon: <Bell size={15} />, color: 'var(--muted)' }
              return (
                <div key={n.id} className="flex items-start gap-4 border-b px-5 py-4 last:border-b-0 sm:px-6" style={{ borderColor: 'var(--border)', background: n.read ? 'transparent' : 'var(--surface2)' }}>
                  <span className="mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-[9px]" style={{ background: 'var(--surface3)', color: meta.color }}>{meta.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-6" style={{ color: 'var(--text)' }}>{n.message}</p>
                    <p className="mt-1 flex items-center gap-2 text-[11px]" style={{ color: 'var(--muted)' }}>
                      <span className="font-bold uppercase tracking-[.08em]">{n.type.replaceAll('_', ' ')}</span>
                      <span>·</span>
                      <span>{formatRelative(n.created_at)}</span>
                    </p>
                  </div>
                  {!n.read && <span className="mt-2 h-2 w-2 flex-none rounded-full" style={{ background: 'var(--accent)' }} />}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
