'use client'

import { useState } from 'react'
import { Loader2, CheckCircle2, Upload, X } from 'lucide-react'

interface CreatorOption {
  id: string
  name: string
}

const MAX_FILES = 6

export default function ShiftReportForm({ creators }: { creators: CreatorOption[] }) {
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [files, setFiles] = useState<File[]>([])

  const today = new Date().toISOString().slice(0, 10)

  function addFiles(list: FileList | null) {
    if (!list) return
    setFiles((prev) => [...prev, ...Array.from(list)].slice(0, MAX_FILES))
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const form = new FormData(e.currentTarget)
    // Replace the native file input's entries with our managed list.
    form.delete('files')
    files.forEach((f) => form.append('files', f))

    try {
      const res = await fetch('/api/shift-report/submit', { method: 'POST', body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.')
        setSubmitting(false)
        return
      }
      setDone(true)
    } catch {
      setError('Network error. Please check your connection and try again.')
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="app-card p-8 text-center">
        <CheckCircle2 className="mx-auto mb-4" size={34} style={{ color: 'var(--green)' }} />
        <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Report submitted — thank you!</h2>
        <p className="mt-2 text-sm leading-6" style={{ color: 'var(--muted)' }}>
          Your shift report was received. You can close this page, or submit another one.
        </p>
        <button
          onClick={() => { setDone(false); setFiles([]); setError(null) }}
          className="btn btn-secondary mt-5 min-h-11"
        >
          Submit another report
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="app-card space-y-6 p-6 sm:p-7">
      {/* Who / when */}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="form-label">Model *</span>
          {creators.length > 0 ? (
            <select name="creator_id" required className="form-control" defaultValue="">
              <option value="" disabled>Select a model…</option>
              {creators.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          ) : (
            <p className="rounded-[9px] border px-3 py-2 text-[12px]" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
              No models set up yet — please ask an admin to add one.
            </p>
          )}
        </label>
        <label className="block">
          <span className="form-label">Your name (chatter) *</span>
          <input name="chatter_name" required className="form-control" placeholder="e.g. JC" />
        </label>
        <label className="block">
          <span className="form-label">Shift date *</span>
          <input type="date" name="shift_date" required defaultValue={today} className="form-control" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="form-label">Shift</span>
            <input name="shift_label" className="form-control" placeholder="1st shift" />
          </label>
          <label className="block">
            <span className="form-label">Time</span>
            <input name="time_range" className="form-control" placeholder="6am–2pm" />
          </label>
        </div>
      </div>

      {/* Sales */}
      <div>
        <p className="mb-3 text-[12px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Sales & tips</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="form-label">Gross texting & tips</span>
            <input type="number" step="0.01" min="0" name="gross_amount" className="form-control" placeholder="0.00" />
          </label>
          <label className="block">
            <span className="form-label">Net texting & tips</span>
            <input type="number" step="0.01" min="0" name="net_amount" className="form-control" placeholder="0.00" />
          </label>
          <label className="block">
            <span className="form-label">Currency</span>
            <select name="currency" className="form-control" defaultValue="USD">
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
            </select>
          </label>
        </div>
      </div>

      {/* Counts */}
      <div className="grid gap-4 sm:grid-cols-4">
        <label className="block">
          <span className="form-label">New subs</span>
          <input type="number" min="0" name="new_subs" className="form-control" placeholder="0" />
        </label>
        <label className="block">
          <span className="form-label">Renew subs</span>
          <input type="number" min="0" name="renew_subs" className="form-control" placeholder="0" />
        </label>
        <label className="block">
          <span className="form-label">Mass msg replies</span>
          <input type="number" min="0" name="mass_message_replies" className="form-control" placeholder="0" />
        </label>
        <label className="block">
          <span className="form-label">Chat engagements</span>
          <input type="number" min="0" name="chat_engagements" className="form-control" placeholder="0" />
        </label>
      </div>

      {/* Notes */}
      <div className="space-y-4">
        <label className="block">
          <span className="form-label">Did the mass message boost engagement? Could you lead into the script with it?</span>
          <textarea name="mass_message_note" rows={2} className="form-control" placeholder="e.g. no — traffic was low" />
        </label>
        <label className="block">
          <span className="form-label">What went well today</span>
          <textarea name="went_well" rows={3} className="form-control" placeholder="Wins, tips landed, good conversations…" />
        </label>
        <label className="block">
          <span className="form-label">What went wrong today</span>
          <textarea name="went_wrong" rows={3} className="form-control" placeholder="Blockers, issues, anything unclear…" />
        </label>
        <label className="block">
          <span className="form-label">Behaviour of the subs / traffic notes</span>
          <textarea name="sub_behavior" rows={3} className="form-control" placeholder="How were the subs today?" />
        </label>
      </div>

      {/* Screenshots */}
      <div>
        <p className="form-label">Sales screenshots (PNG/JPG/PDF, up to {MAX_FILES})</p>
        <label
          className="mt-1 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[11px] border border-dashed px-4 py-6 text-center"
          style={{ borderColor: 'var(--border-strong)', background: 'var(--surface)' }}
        >
          <Upload size={20} style={{ color: 'var(--accent)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Tap to add screenshots</span>
          <span className="text-[11px]" style={{ color: 'var(--muted)' }}>Please upload the full, clear screenshot of your sales — not a crop.</span>
          <input
            type="file"
            name="files"
            accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => addFiles(e.target.files)}
          />
        </label>

        {files.length > 0 && (
          <ul className="mt-3 space-y-2">
            {files.map((f, i) => (
              <li key={i} className="flex items-center justify-between gap-3 rounded-[9px] border px-3 py-2 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                <span className="min-w-0 flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>{f.name}</span>
                <span className="flex-none text-[11px]" style={{ color: 'var(--muted)' }}>{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                <button type="button" onClick={() => removeFile(i)} className="icon-button !h-7 !w-7 flex-none" aria-label="Remove file"><X size={14} /></button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <p className="rounded-[9px] border px-3.5 py-2.5 text-sm" style={{ background: 'var(--red-dim)', borderColor: 'rgba(239,68,68,.3)', color: 'var(--red)' }}>{error}</p>
      )}

      <button type="submit" disabled={submitting} className="btn btn-primary min-h-12 w-full">
        {submitting ? <Loader2 className="animate-spin" size={16} /> : null}
        {submitting ? 'Submitting…' : 'Submit shift report'}
      </button>
    </form>
  )
}
