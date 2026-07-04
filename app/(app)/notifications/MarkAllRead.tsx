'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function MarkAllRead({ userId }: { userId: string }) {
  const router = useRouter()
  const supabase = createClient()

  async function markAll() {
    await supabase.from('notifications').update({ read: true }).eq('user_id', userId)
    router.refresh()
  }

  return (
    <button onClick={markAll} className="btn btn-secondary">
      Mark all read
    </button>
  )
}
