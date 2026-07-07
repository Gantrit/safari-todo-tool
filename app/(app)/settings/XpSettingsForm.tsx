'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export interface XpSettings {
  section_daily: number
  section_weekly: number
  section_monthly: number
  prio_low_bonus: number
  prio_medium_bonus: number
  prio_high_bonus: number
  near_deadline_bonus: number
  near_deadline_window_hours: number
  early_bonus_per_day: number
  early_bonus_max: number
  streak_bonus_per_day: number
  streak_bonus_max: number
}

const DEFAULTS: XpSettings = {
  section_daily: 5,
  section_weekly: 10,
  section_monthly: 20,
  prio_low_bonus: 0,
  prio_medium_bonus: 5,
  prio_high_bonus: 10,
  near_deadline_bonus: 10,
  near_deadline_window_hours: 24,
  early_bonus_per_day: 1,
  early_bonus_max: 10,
  streak_bonus_per_day: 1,
  streak_bonus_max: 10,
}

const FIELD_GROUPS: { title: string; hint: string; fields: { key: keyof XpSettings; label: string }[] }[] = [
  {
    title: 'Base XP by category',
    hint: 'What a task is worth depending on its section.',
    fields: [
      { key: 'section_daily', label: 'Daily' },
      { key: 'section_weekly', label: 'Weekly' },
      { key: 'section_monthly', label: 'Monthly' },
    ],
  },
  {
    title: 'Priority surcharge',
    hint: 'Added on top of the category base.',
    fields: [
      { key: 'prio_low_bonus', label: 'Low' },
      { key: 'prio_medium_bonus', label: 'Medium' },
      { key: 'prio_high_bonus', label: 'High' },
    ],
  },
  {
    title: 'Deadline bonus',
    hint: 'Extra XP for finishing close to (but before) the deadline.',
    fields: [
      { key: 'near_deadline_bonus', label: 'Bonus XP' },
      { key: 'near_deadline_window_hours', label: 'Window (hours)' },
    ],
  },
  {
    title: 'Early & streak bonuses',
    hint: 'Rewards for finishing days early and for approval streaks.',
    fields: [
      { key: 'early_bonus_per_day', label: 'Early: XP per day' },
      { key: 'early_bonus_max', label: 'Early: max' },
      { key: 'streak_bonus_per_day', label: 'Streak: XP per day' },
      { key: 'streak_bonus_max', label: 'Streak: max' },
    ],
  },
]

export default function XpSettingsForm({ initial, currentUserId }: { initial: Partial<XpSettings> | null; currentUserId: string }) {
  const [values, setValues] = useState<XpSettings>({ ...DEFAULTS, ...(initial || {}) })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const supabase = createClient()
  const router = useRouter()

  const setField = (key: keyof XpSettings, raw: string) => {
    const n = parseInt(raw, 10)
    setValues((prev) => ({ ...prev, [key]: Number.isNaN(n) ? 0 : Math.max(0, n) }))
  }

  const save = async () => {
    setBusy(true)
    setMessage(null)
    const { error } = await supabase
      .from('xp_settings')
      .update({ ...values, updated_at: new Date().toISOString(), updated_by: currentUserId })
      .eq('id', true)
    setBusy(false)
    setMessage(error
      ? { text: error.message, type: 'error' }
      : { text: 'XP settings saved. New approvals use these values immediately.', type: 'success' })
    if (!error) router.refresh()
  }

  const exampleBase = values.section_daily + values.prio_medium_bonus

  return (
    <section className="app-card">
      <div className="card-header">
        <div>
          <h2 className="font-bold">XP Management</h2>
          <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
            How much XP each approved task pays out. Changes apply to future approvals only — already-awarded XP is untouched.
          </p>
        </div>
        <span style={{ color: 'var(--accent)' }}><Sparkles size={18} /></span>
      </div>

      <div className="grid gap-6 p-5 sm:grid-cols-2 sm:p-6">
        {FIELD_GROUPS.map((group) => (
          <div key={group.title} className="rounded-[12px] border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface2)' }}>
            <p className="text-[13px] font-bold">{group.title}</p>
            <p className="mb-4 mt-0.5 text-[11.5px]" style={{ color: 'var(--muted)' }}>{group.hint}</p>
            <div className="grid grid-cols-2 gap-3">
              {group.fields.map((field) => (
                <label key={field.key} className="min-w-0">
                  <span className="form-label !mb-1.5 !text-[9.5px]">{field.label}</span>
                  <input
                    type="number"
                    min={0}
                    value={values[field.key]}
                    onChange={(e) => setField(field.key, e.target.value)}
                    className="form-control !min-h-10 !px-3 !text-[13px]"
                    aria-label={`${group.title}: ${field.label}`}
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4 sm:px-6" style={{ borderColor: 'var(--border)', background: 'var(--surface2)' }}>
        <p className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
          Example: a <strong>Daily</strong> task with <strong>Medium</strong> priority pays <strong style={{ color: 'var(--accent)' }}>{exampleBase} XP</strong> base
          (+{values.near_deadline_bonus} near-deadline, up to +{values.early_bonus_max} early, up to +{values.streak_bonus_max} streak).
          Overdue tasks lose the full base as penalty.
        </p>
        <button onClick={save} disabled={busy} className="btn btn-primary flex-none">
          {busy && <Loader2 className="animate-spin" size={15} />}Save XP settings
        </button>
      </div>

      {message && (
        <div className="px-5 pb-5 sm:px-6">
          <div className="rounded-[10px] border px-4 py-3 text-sm" style={{ background: message.type === 'success' ? 'var(--green-dim)' : 'var(--red-dim)', borderColor: message.type === 'success' ? 'rgba(34,197,94,.3)' : 'rgba(239,68,68,.3)', color: message.type === 'success' ? 'var(--green)' : 'var(--red)' }}>{message.text}</div>
        </div>
      )}
    </section>
  )
}
