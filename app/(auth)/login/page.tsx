'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

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
      options: { emailRedirectTo: `${window.location.origin}/dashboard` },
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
      redirectTo: `${window.location.origin}/login`,
    })
    if (error) setError(error.message)
    else setResetSent(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm p-8 rounded-[10px]" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--accent)' }}>
            Safari To-Dos
          </h1>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Sign in to your workspace</p>
        </div>

        {sent ? (
          <div className="text-center">
            <div className="text-4xl mb-4">📬</div>
            <p style={{ color: 'var(--text)' }}>Check your email for the magic link.</p>
          </div>
        ) : (
          <>
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setMode('login')}
                className="flex-1 py-2 text-sm rounded-md transition-all"
                style={{
                  background: mode === 'login' ? 'var(--surface2)' : 'transparent',
                  color: mode === 'login' ? 'var(--text)' : 'var(--muted)',
                  border: '1px solid var(--border)',
                }}
              >
                Password
              </button>
              <button
                onClick={() => setMode('magic')}
                className="flex-1 py-2 text-sm rounded-md transition-all"
                style={{
                  background: mode === 'magic' ? 'var(--surface2)' : 'transparent',
                  color: mode === 'magic' ? 'var(--text)' : 'var(--muted)',
                  border: '1px solid var(--border)',
                }}
              >
                Magic Link
              </button>
            </div>

            <form onSubmit={mode === 'login' ? handleLogin : handleMagicLink} className="space-y-4">
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--muted)' }}>EMAIL</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-md text-sm outline-none"
                  style={{
                    background: 'var(--surface2)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                  }}
                  placeholder="you@example.com"
                />
              </div>

              {mode === 'login' && (
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--muted)' }}>PASSWORD</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-md text-sm outline-none"
                    style={{
                      background: 'var(--surface2)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                    }}
                    placeholder="••••••••"
                  />
                </div>
              )}

              {error && (
                <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>
              )}
              {resetSent && (
                <p className="text-sm" style={{ color: 'var(--green)' }}>Password reset email sent.</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 text-sm font-semibold rounded-md transition-opacity disabled:opacity-50"
                style={{ background: 'var(--accent)', color: '#0e0e0e' }}
              >
                {loading ? 'Loading...' : mode === 'login' ? 'Sign In' : 'Send Magic Link'}
              </button>
              {mode === 'login' && (
                <button
                  type="button"
                  onClick={handlePasswordReset}
                  disabled={loading}
                  className="w-full py-2 text-sm transition-opacity disabled:opacity-50"
                  style={{ color: 'var(--muted)' }}
                >
                  Reset password
                </button>
              )}
            </form>
          </>
        )}
      </div>
    </div>
  )
}
