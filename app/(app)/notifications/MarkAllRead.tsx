'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { toastError, toastSuccess } from '@/lib/toast'
import { Loader2, Trash2 } from 'lucide-react'

export default function MarkAllRead({ userId, unread, total }: { userId: string; unread: number; total: number }) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [busy, setBusy] = useState<'read' | 'clear' | null>(null)

  async function markAll() {
    setBusy('read')
    const { error } = await supabase.from('notifications').update({ read: true }).eq('user_id', userId)
    if (error) toastError(error.message)
    else router.refresh()
    setBusy(null)
  }

  async function clearAll() {
    if (!confirm(`Delete all ${total} notifications? This cannot be undone.`)) return
    setBusy('clear')
    // .select() makes a policy-blocked delete detectable: RLS without a DELETE
    // policy deletes 0 rows WITHOUT an error, which would look like success.
    const { data, error } = await supabase.from('notifications').delete().eq('user_id', userId).select('id')
    if (error || !data?.length) {
      toastError(error && !error.message.includes('policy') && !error.message.includes('permission')
        ? error.message
        : 'Migration 040 is required for deleting notifications — run it in the Supabase SQL editor.')
    } else {
      toastSuccess('All notifications cleared')
      router.refresh()
    }
    setBusy(null)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {unread > 0 && (
        <button onClick={markAll} disabled={busy !== null} className="btn btn-secondary">
          {busy === 'read' && <Loader2 className="animate-spin" size={14} />} Mark all read
        </button>
      )}
      {total > 0 && (
        <button onClick={clearAll} disabled={busy !== null} className="btn btn-secondary hover:!text-[var(--red)]">
          {busy === 'clear' ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />} Clear all
        </button>
      )}
    </div>
  )
}
