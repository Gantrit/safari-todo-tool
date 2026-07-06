'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Loader2, Mail, ShieldCheck } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'login' | 'magic'>('login')
  const [sent, setSent] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
    } else {
      router.push('/dashboard')
      router.refresh()
    }
    setLoading(false)
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/callback` },
    })
    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  async function handlePasswordReset() {
    if (!email.trim()) {
      setError('Enter your email first.')
      return
    }
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/set-password`,
    })
    if (error) setError(error.message)
    else setResetSent(true)
    setLoading(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ background: 'radial-gradient(90% 70% at 50% 0%, rgba(200,169,106,0.06), transparent 60%), var(--bg)' }}>
      <div className="w-full max-w-[400px]">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-[13px] text-lg font-extrabold" style={{ background: 'var(--accent)', color: '#0b0d09' }}>S</span>
          <h1 className="text-[26px] font-extrabold tracking-[-.03em]" style={{ color: 'var(--text)' }}>Safari To-Dos</h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>Sign in to your workspace</p>
        </div>

        <div className="app-card p-7 sm:p-8">
          {sent ? (
            <div className="py-6 text-center">
              <Mail className="mx-auto mb-4" size={30} style={{ color: 'var(--accent)' }} />
              <h2 className="font-bold" style={{ color: 'var(--text)' }}>Check your inbox</h2>
              <p className="mt-2 text-sm leading-6" style={{ color: 'var(--muted)' }}>We sent a magic link to <strong style={{ color: 'var(--text-secondary)' }}>{email}</strong>.</p>
            </div>
          ) : (
            <>
              <div className="mb-6 grid grid-cols-2 gap-1 rounded-[9px] border p-1" style={{ borderColor: 'var(--border)', background: 'var(--surface2)' }}>
                {(['login', 'magic'] as const).map((value) => (
                  <button
                    key={value}
                    onClick={() => { setMode(value); setError(null) }}
                    className="min-h-9 rounded-[7px] text-[12.5px] font-bold transition-colors"
                    style={{
                      background: mode === value ? 'var(--surface3)' : 'transparent',
                      color: mode === value ? 'var(--text)' : 'var(--muted)',
                      border: mode === value ? '1px solid var(--border-strong)' : '1px solid transparent',
                    }}
                  >
                    {value === 'login' ? 'Password' : 'Magic Link'}
                  </button>
                ))}
              </div>

              <form onSubmit={mode === 'login' ? handleLogin : handleMagicLink} className="space-y-5">
                <label className="block">
                  <span className="form-label">Email</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="form-control"
                    placeholder="you@safarixstudios.com"
                    autoFocus
                  />
                </label>

                {mode === 'login' && (
                  <label className="block">
                    <span className="form-label">Password</span>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="form-control"
                      placeholder="••••••••"
                    />
                  </label>
                )}

                {error && <p className="rounded-[9px] border px-3.5 py-2.5 text-sm" style={{ background: 'var(--red-dim)', borderColor: 'rgba(239,68,68,.3)', color: 'var(--red)' }}>{error}</p>}
                {resetSent && <p className="rounded-[9px] border px-3.5 py-2.5 text-sm" style={{ background: 'var(--green-dim)', borderColor: 'rgba(34,197,94,.3)', color: 'var(--green)' }}>Password reset email sent.</p>}

                <button type="submit" disabled={loading} className="btn btn-primary min-h-12 w-full">
                  {loading ? <Loader2 className="animate-spin" size={15} /> : null}
                  {loading ? 'Signing in…' : mode === 'login' ? 'Sign in' : 'Send magic link'}
                </button>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={handlePasswordReset}
                    disabled={loading}
                    className="w-full py-1 text-center text-xs font-semibold transition-opacity hover:opacity-70 disabled:opacity-50"
                    style={{ color: 'var(--muted)' }}
                  >
                    Forgot password? Send reset email
                  </button>
                )}
              </form>
            </>
          )}
        </div>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-[11px]" style={{ color: 'var(--muted)' }}>
          <ShieldCheck size={12} /> Invite-only workspace · ask an admin for access
        </p>
      </div>
    </div>
  )
}
