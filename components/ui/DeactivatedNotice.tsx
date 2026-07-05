'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ShieldOff, Loader2 } from 'lucide-react'

export default function DeactivatedNotice() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const signOut = async () => {
    setBusy(true)
    await createClient().auth.signOut()
    router.push('/login')
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-6" style={{ background: 'var(--bg)' }}>
      <div className="app-card w-full max-w-md p-8 text-center">
        <div className="empty-state-icon is-danger mx-auto"><ShieldOff size={22} /></div>
        <h1 className="mt-4 text-lg font-bold">Access deactivated</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6" style={{ color: 'var(--muted)' }}>
          Your access to this workspace has been turned off by an admin. Your data is kept — reach out to an admin if you think this is a mistake.
        </p>
        <button onClick={signOut} disabled={busy} className="btn btn-secondary mx-auto mt-6">
          {busy ? <Loader2 className="animate-spin" size={15} /> : null} Return to login
        </button>
      </div>
    </div>
  )
}
