'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatRelative } from '@/lib/utils'
import { AlertTriangle, AtSign, Bell, CheckCircle2, Clock3, MessageSquare, Send, ShieldAlert, UserPlus, XCircle } from 'lucide-react'

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

export interface NotificationItem {
  id: string
  type: string
  message: string
  created_at: string
  read: boolean
  /** Resolved destination inside the app, or null when there is nothing to open. */
  href: string | null
}

export default function NotificationList({ items }: { items: NotificationItem[] }) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  // Optimistic read state so the unread dot clears the instant you click.
  const [readIds, setReadIds] = useState<Set<string>>(new Set())

  async function open(n: NotificationItem) {
    if (!n.read && !readIds.has(n.id)) {
      setReadIds((prev) => new Set(prev).add(n.id))
      // Fire-and-forget; navigation shouldn't wait on the write.
      supabase.from('notifications').update({ read: true }).eq('id', n.id).then(() => {})
    }
    if (n.href) router.push(n.href)
  }

  return (
    <div>
      {items.map((n) => {
        const meta = TYPE_META[n.type] || { icon: <Bell size={15} />, color: 'var(--muted)' }
        const isRead = n.read || readIds.has(n.id)
        const clickable = !!n.href
        return (
          <button
            key={n.id}
            type="button"
            onClick={() => open(n)}
            disabled={!clickable}
            className={`flex w-full items-start gap-4 border-b px-5 py-4 text-left last:border-b-0 sm:px-6 ${clickable ? 'cursor-pointer transition-colors hover:brightness-125' : 'cursor-default'}`}
            style={{ borderColor: 'var(--border)', background: isRead ? 'transparent' : 'var(--surface2)' }}
          >
            <span className="mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-[9px]" style={{ background: 'var(--surface3)', color: meta.color }}>{meta.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-6" style={{ color: 'var(--text)' }}>{n.message}</p>
              <p className="mt-1 flex items-center gap-2 text-[11px]" style={{ color: 'var(--muted)' }}>
                <span className="font-bold uppercase tracking-[.08em]">{n.type.replaceAll('_', ' ')}</span>
                <span>·</span>
                <span>{formatRelative(n.created_at)}</span>
              </p>
            </div>
            {!isRead && <span className="mt-2 h-2 w-2 flex-none rounded-full" style={{ background: 'var(--accent)' }} />}
          </button>
        )
      })}
    </div>
  )
}
