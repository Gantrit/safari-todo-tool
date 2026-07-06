'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Profile, NotificationPreferences } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { Bell, Check, Loader2 } from 'lucide-react'

interface AccountFormProps {
  profile: Profile
  preferences: NotificationPreferences | null
}

export default function AccountForm({ profile, preferences }: AccountFormProps) {
  const router = useRouter()
  const [fullName, setFullName] = useState(profile.full_name || '')
  const [inAppEnabled, setInAppEnabled] = useState(preferences?.in_app_enabled ?? true)
  const [emailEnabled, setEmailEnabled] = useState(preferences?.email_enabled ?? true)
  const [savingName, setSavingName] = useState(false)
  const [savingPrefs, setSavingPrefs] = useState(false)
  const [nameSaved, setNameSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [supabase] = useState(() => createClient())

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
