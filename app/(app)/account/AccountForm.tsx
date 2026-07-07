'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Profile, NotificationPreferences } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { Bell, Check, KeyRound, Loader2, Mail } from 'lucide-react'

interface AccountFormProps {
  profile: Profile
  preferences: NotificationPreferences | null
  currentEmail: string
}

export default function AccountForm({ profile, preferences, currentEmail }: AccountFormProps) {
  const router = useRouter()
  const [fullName, setFullName] = useState(profile.full_name || '')
  const [inAppEnabled, setInAppEnabled] = useState(preferences?.in_app_enabled ?? true)
  const [emailEnabled, setEmailEnabled] = useState(preferences?.email_enabled ?? true)
  const [savingName, setSavingName] = useState(false)
  const [savingPrefs, setSavingPrefs] = useState(false)
  const [nameSaved, setNameSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [supabase] = useState(() => createClient())

  const [newEmail, setNewEmail] = useState('')
  const [savingEmail, setSavingEmail] = useState(false)
  const [emailNotice, setEmailNotice] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null)

  async function changeEmail(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = newEmail.trim().toLowerCase()
    if (!trimmed || savingEmail) return
    if (trimmed === currentEmail.toLowerCase()) { setError('That is already your email.'); return }
    setSavingEmail(true); setError(null); setEmailNotice(null)
    const { error: updateError } = await supabase.auth.updateUser({ email: trimmed })
    setSavingEmail(false)
    if (updateError) { setError(updateError.message); return }
    setEmailNotice(`Confirmation link sent to ${trimmed}. Your email changes once you click it.`)
    setNewEmail('')
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    if (savingPassword) return
    if (newPassword.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return }
    setSavingPassword(true); setError(null); setPasswordNotice(null)
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
    setSavingPassword(false)
    if (updateError) { setError(updateError.message); return }
    setPasswordNotice('Password updated.')
    setNewPassword(''); setConfirmPassword('')
  }

  async function saveName(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = fullName.trim()
    if (!trimmed || savingName) return
    setSavingName(true)
    setError(null)
    const { error: updateError } = await supabase.from('profiles').update({ full_name: trimmed }).eq('id', profile.id)
    setSavingName(false)
    if (updateError) { setError(updateError.message); return }
    setNameSaved(true)
    setTimeout(() => setNameSaved(false), 2000)
    router.refresh()
  }

  async function toggleAndSave(next: { inApp?: boolean; email?: boolean }) {
    const nextInApp = next.inApp ?? inAppEnabled
    const nextEmail = next.email ?? emailEnabled
    setInAppEnabled(nextInApp)
    setEmailEnabled(nextEmail)
    setSavingPrefs(true)
    setError(null)
    const { error: upsertError } = await supabase
      .from('notification_preferences')
      .upsert({ user_id: profile.id, in_app_enabled: nextInApp, email_enabled: nextEmail }, { onConflict: 'user_id' })
    setSavingPrefs(false)
    if (upsertError) setError(upsertError.message)
  }

  const fieldStyle = { background: 'var(--surface2)', borderColor: 'var(--border)', color: 'var(--text)' }
  const labelClass = 'block text-[10.5px] font-bold uppercase tracking-[.1em]'

  return (
    <div className="space-y-8">
      <form onSubmit={saveName}>
        <label className={labelClass} style={{ color: 'var(--text-secondary)' }}>Display name</label>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            className="create-task-control max-w-xs flex-1 text-[14px] font-semibold"
            style={fieldStyle}
            placeholder="Your name"
          />
          <button type="submit" disabled={savingName || !fullName.trim()} className="btn btn-primary !min-h-10 !px-4">
            {savingName ? <><Loader2 className="animate-spin" size={14} /> Saving…</> : nameSaved ? <><Check size={14} /> Saved</> : 'Save name'}
          </button>
        </div>
        <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>This is what teammates see on boards, in comments, and on the leaderboard.</p>
      </form>

      <form onSubmit={changeEmail} className="border-t pt-6" style={{ borderColor: 'var(--border)' }}>
        <div className="mb-4 flex items-center gap-2 text-xs font-bold"><Mail size={14} style={{ color: 'var(--accent)' }} /> Email address</div>
        <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>Current: <span style={{ color: 'var(--text-secondary)' }}>{currentEmail}</span></p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className="create-task-control max-w-xs flex-1 text-[14px] font-semibold"
            style={fieldStyle}
            placeholder="new@safarixstudios.com"
          />
          <button type="submit" disabled={savingEmail || !newEmail.trim()} className="btn btn-secondary !min-h-10 !px-4">
            {savingEmail ? <><Loader2 className="animate-spin" size={14} /> Sending…</> : 'Change email'}
          </button>
        </div>
        {emailNotice && <p className="mt-2 text-xs" style={{ color: 'var(--green)' }}>{emailNotice}</p>}
      </form>

      <form onSubmit={changePassword} className="border-t pt-6" style={{ borderColor: 'var(--border)' }}>
        <div className="mb-4 flex items-center gap-2 text-xs font-bold"><KeyRound size={14} style={{ color: 'var(--accent)' }} /> Password</div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            className="create-task-control max-w-[200px] flex-1 text-[14px] font-semibold"
            style={fieldStyle}
            placeholder="New password"
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            className="create-task-control max-w-[200px] flex-1 text-[14px] font-semibold"
            style={fieldStyle}
            placeholder="Repeat password"
          />
          <button type="submit" disabled={savingPassword || !newPassword || !confirmPassword} className="btn btn-secondary !min-h-10 !px-4">
            {savingPassword ? <><Loader2 className="animate-spin" size={14} /> Saving…</> : 'Update password'}
          </button>
        </div>
        <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>At least 8 characters. You stay signed in on this device.</p>
        {passwordNotice && <p className="mt-2 text-xs" style={{ color: 'var(--green)' }}>{passwordNotice}</p>}
      </form>

      <div className="border-t pt-6" style={{ borderColor: 'var(--border)' }}>
        <div className="mb-4 flex items-center gap-2 text-xs font-bold"><Bell size={14} style={{ color: 'var(--accent)' }} /> Notifications</div>
        <div className="space-y-2.5">
          <label className="flex items-center gap-2.5 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={inAppEnabled} onChange={(e) => toggleAndSave({ inApp: e.target.checked })} className="h-3.5 w-3.5 accent-[var(--accent)]" />
            In-app notifications (assignments, approvals, comments)
          </label>
          <label className="flex items-center gap-2.5 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={emailEnabled} onChange={(e) => toggleAndSave({ email: e.target.checked })} className="h-3.5 w-3.5 accent-[var(--accent)]" />
            Email notifications
          </label>
        </div>
        {savingPrefs && <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>Saving…</p>}
      </div>

      {error && <div className="rounded-[10px] border px-4 py-3.5 text-sm" style={{ background: 'var(--red-dim)', borderColor: 'rgba(255,98,98,.3)', color: 'var(--red)' }}>{error}</div>}
    </div>
  )
}
