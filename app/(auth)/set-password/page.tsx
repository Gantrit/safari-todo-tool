'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2, ShieldCheck, KeyRound } from 'lucide-react'

type Phase = 'checking' | 'ready' | 'invalid'

export default function SetPasswordPage() {
  const [phase, setPhase] = useState<Phase>('checking')
  const [email, setEmail] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invalidReason, setInvalidReason] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  // The invite / reset link lands here with the session token in the URL hash.
  // createBrowserClient parses it automatically (detectSessionInUrl); we just
  // wait for the resulting session before showing the form.
  useEffect(() => {
    let active = true

    // Supabase redirects failed invite/reset links back with the reason encoded
    // in the URL hash (#error=…&error_code=…&error_description=…). Surface it so a
    // broken link is diagnosable instead of a generic "expired or invalid".
    const hash = typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : ''
    const hp = new URLSearchParams(hash)
    const errCode = hp.get('error_code') || hp.get('error')
    const errDesc = hp.get('error_description')
    if (errCode || errDesc) {
      const readable = errDesc ? decodeURIComponent(errDesc.replace(/\+/g, ' ')) : errCode
      setInvalidReason(
        errCode === 'otp_expired'
          ? 'This link was already used or has expired. Invite/reset links are single-use — email security scanners can open them first. Ask an admin for a fresh invite and open it immediately.'
          : readable
      )
      setPhase('invalid')
      return
    }

    const resolve = async () => {
      const { data } = await supabase.auth.getSession()
      if (!active) return
      if (data.session) {
        setEmail(data.session.user.email ?? null)
        setPhase('ready')
      }
    }

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      if (session) {
        setEmail(session.user.email ?? null)
        setPhase('ready')
      }
    })

    resolve()
    // Give the client a moment to parse the URL hash; if still no session, the link is bad.
    const timer = setTimeout(() => {
      if (active) setPhase((p) => (p === 'checking' ? 'invalid' : p))
    }, 2500)

    return () => {
      active = false
      clearTimeout(timer)
      sub.subscription.unsubscribe()
    }
  }, [supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ background: 'radial-gradient(90% 70% at 50% 0%, rgba(200,169,106,0.06), transparent 60%), var(--bg)' }}>
      <div className="w-full max-w-[400px]">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-[13px] text-lg font-extrabold" style={{ background: 'var(--accent)', color: '#0b0d09' }}>S</span>
          <h1 className="text-[26px] font-extrabold tracking-[-.03em]" style={{ color: 'var(--text)' }}>Set your password</h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
            {email ? <>Choose a password for <strong style={{ color: 'var(--text-secondary)' }}>{email}</strong></> : 'Choose a password to access your workspace'}
          </p>
        </div>

        <div className="app-card p-7 sm:p-8">
          {phase === 'checking' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="animate-spin" size={26} style={{ color: 'var(--accent)' }} />
              <p className="text-sm" style={{ color: 'var(--muted)' }}>Verifying your invite link…</p>
            </div>
          )}

          {phase === 'invalid' && (
            <div className="py-4 text-center">
              <KeyRound className="mx-auto mb-4" size={28} style={{ color: 'var(--red)' }} />
              <h2 className="font-bold" style={{ color: 'var(--text)' }}>Link expired or invalid</h2>
              <p className="mt-2 text-sm leading-6" style={{ color: 'var(--muted)' }}>
                {invalidReason ?? 'This invite or reset link is no longer valid. Ask an admin to send a fresh invite, or request a new reset email from the login page.'}
              </p>
              <button onClick={() => router.push('/login')} className="btn btn-secondary mt-5 min-h-11 w-full">Back to login</button>
            </div>
          )}

          {phase === 'ready' && (
            <form onSubmit={handleSubmit} className="space-y-5">
              <label className="block">
                <span className="form-label">New password</span>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus className="form-control" placeholder="At least 8 characters" />
              </label>
              <label className="block">
                <span className="form-label">Confirm password</span>
                <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required className="form-control" placeholder="Re-enter password" />
              </label>

              {error && <p className="rounded-[9px] border px-3.5 py-2.5 text-sm" style={{ background: 'var(--red-dim)', borderColor: 'rgba(239,68,68,.3)', color: 'var(--red)' }}>{error}</p>}

              <button type="submit" disabled={loading} className="btn btn-primary min-h-12 w-full">
                {loading ? <Loader2 className="animate-spin" size={15} /> : null}
                {loading ? 'Saving…' : 'Save password & continue'}
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-[11px]" style={{ color: 'var(--muted)' }}>
          <ShieldCheck size={12} /> Safari To-Dos · invite-only workspace
        </p>
      </div>
    </div>
  )
}
