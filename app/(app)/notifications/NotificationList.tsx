'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatRelative } from '@/lib/utils'
import { toastError } from '@/lib/toast'
import { AlertTriangle, AtSign, Bell, CheckCircle2, Clock3, Loader2, MessageSquare, Send, ShieldAlert, Trash2, UserPlus, XCircle } from 'lucide-react'

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
  // Optimistic delete state: the row disappears immediately and comes back
  // (with a toast) only if the DB delete fails.
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set())
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function open(n: NotificationItem) {
    if (!n.read && !readIds.has(n.id)) {
      setReadIds((prev) => new Set(prev).add(n.id))
      // Fire-and-forget; navigation shouldn't wait on the write.
      supabase.from('notifications').update({ read: true }).eq('id', n.id).then(() => {})
    }
    if (n.href) router.push(n.href)
  }

  async function remove(n: NotificationItem) {
    if (deletingId) return
    setDeletingId(n.id)
    setRemovedIds((prev) => new Set(prev).add(n.id))
    // .select() makes a policy-blocked delete detectable: RLS without a DELETE
    // policy deletes 0 rows WITHOUT an error, which would look like success.
    const { data, error } = await supabase.from('notifications').delete().eq('id', n.id).select('id')
    if (error || !data?.length) {
      setRemovedIds((prev) => {
        const next = new Set(prev)
        next.delete(n.id)
        return next
      })
      toastError(error && !error.message.includes('policy') && !error.message.includes('permission')
        ? error.message
        : 'Migration 040 is required for deleting notifications — run it in the Supabase SQL editor.')
    } else {
      router.refresh()
    }
    setDeletingId(null)
  }

  const visible = items.filter((n) => !removedIds.has(n.id))

  return (
    <div>
      {visible.map((n) => {
        const meta = TYPE_META[n.type] || { icon: <Bell size={15} />, color: 'var(--muted)' }
        const isRead = n.read || readIds.has(n.id)
        const clickable = !!n.href
        return (
          <div
            key={n.id}
            className="flex w-full items-start gap-3 border-b px-5 py-4 last:border-b-0 sm:px-6"
            style={{ borderColor: 'var(--border)', background: isRead ? 'transparent' : 'var(--surface2)' }}
          >
            <button
              type="button"
              onClick={() => open(n)}
              disabled={!clickable}
              className={`flex min-w-0 flex-1 items-start gap-4 text-left ${clickable ? 'cursor-pointer transition-[filter] hover:brightness-125' : 'cursor-default'}`}
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
            </button>
            {!isRead && <span className="mt-2 h-2 w-2 flex-none rounded-full" style={{ background: 'var(--accent)' }} />}
            <button
              type="button"
              onClick={() => remove(n)}
              disabled={deletingId === n.id}
              className="icon-button !h-8 !w-8 flex-none hover:!text-[var(--red)]"
              title="Delete notification"
              aria-label="Delete notification"
            >
              {deletingId === n.id ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />}
            </button>
          </div>
        )
      })}
      {visible.length === 0 && (
        <div className="px-6 py-10 text-center text-sm" style={{ color: 'var(--muted)' }}>All notifications cleared.</div>
      )}
    </div>
  )
}
