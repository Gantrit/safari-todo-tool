'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'

// Landing route for magic links. createBrowserClient parses the session token
// from the URL hash automatically; once a session exists we forward to the app.
export default function CallbackPage() {
  const [failed, setFailed] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    let active = true

    const go = async () => {
      const { data } = await supabase.auth.getSession()
      if (active && data.session) {
        router.replace('/dashboard')
        router.refresh()
      }
    }

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active && session) {
        router.replace('/dashboard')
        router.refresh()
      }
    })

    go()
    const timer = setTimeout(() => active && setFailed(true), 3000)

    return () => {
      active = false
      clearTimeout(timer)
      sub.subscription.unsubscribe()
    }
  }, [supabase, router])

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
      <div className="flex flex-col items-center gap-4 text-center">
        {failed ? (
          <>
            <p className="text-sm font-semibold" style={{ color: 'var(--red)' }}>This link is invalid or has expired.</p>
            <button onClick={() => router.push('/login')} className="btn btn-secondary min-h-11">Back to login</button>
          </>
        ) : (
          <>
            <Loader2 className="animate-spin" size={28} style={{ color: 'var(--accent)' }} />
            <p className="text-sm" style={{ color: 'var(--muted)' }}>Signing you in…</p>
          </>
        )}
      </div>
    </div>
  )
}
