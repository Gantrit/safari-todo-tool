'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShiftReportCreator } from '@/lib/types'
import { Plus, Trash2, Loader2, Clapperboard } from 'lucide-react'

// Admin management of the models/creators shown in the public shift-report form.
export default function CreatorsSettings({ creators }: { creators: ShiftReportCreator[] }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState<string | null>(null) // holds the action in flight
  const [error, setError] = useState<string | null>(null)

  async function call(method: string, body: object, key: string) {
    setBusy(key); setError(null)
    try {
      const res = await fetch('/api/shift-report/creators', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error || 'Something went wrong.')
        return false
      }
      router.refresh()
      return true
    } catch {
      setError('Network error.')
      return false
    } finally {
      setBusy(null)
    }
  }

  async function add() {
    const clean = name.trim()
    if (!clean) return
    if (await call('POST', { name: clean }, 'add')) setName('')
  }

  return (
    <section className="app-card p-5 sm:p-6">
      <div className="mb-1 flex items-center gap-2">
        <Clapperboard size={18} style={{ color: 'var(--accent)' }} />
        <h2 className="text-[16px] font-extrabold tracking-[-.01em]" style={{ color: 'var(--text)' }}>Creators / Models</h2>
      </div>
      <p className="mb-4 text-[12.5px]" style={{ color: 'var(--muted)' }}>
        These appear in the shift-report form dropdown. Deactivate to hide from the form while keeping past reports; delete to remove entirely (past reports keep the model name).
      </p>

      <div className="mb-4 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          placeholder="Add a model name…"
          className="form-control !h-10 flex-1"
        />
        <button onClick={add} disabled={busy === 'add' || !name.trim()} className="btn btn-primary min-h-10">
          {busy === 'add' ? <Loader2 className="animate-spin" size={15} /> : <Plus size={15} />} Add
        </button>
      </div>

      {error && <p className="mb-3 text-[12px]" style={{ color: 'var(--red)' }}>{error}</p>}

      {creators.length === 0 ? (
        <p className="text-[12.5px]" style={{ color: 'var(--muted)' }}>No models yet — add one above.</p>
      ) : (
        <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
          {creators.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
              <span className="text-[13.5px] font-semibold" style={{ color: c.active ? 'var(--text)' : 'var(--muted)' }}>
                {c.name}{!c.active && <span className="ml-2 text-[11px] font-bold uppercase" style={{ color: 'var(--muted)' }}>· inactive</span>}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => call('PATCH', { id: c.id, active: !c.active }, `toggle-${c.id}`)}
                  disabled={busy === `toggle-${c.id}`}
                  className="rounded-[7px] border px-2.5 py-1 text-[11.5px] font-bold"
                  style={{ borderColor: 'var(--border)', color: c.active ? 'var(--muted)' : 'var(--green)' }}
                >
                  {c.active ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  onClick={() => { if (confirm(`Delete "${c.name}"? Past reports keep the name; it just won't be selectable anymore.`)) call('DELETE', { id: c.id }, `del-${c.id}`) }}
                  disabled={busy === `del-${c.id}`}
                  className="icon-button !h-8 !w-8"
                  aria-label={`Delete ${c.name}`}
                  title="Delete"
                >
                  {busy === `del-${c.id}` ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} style={{ color: 'var(--red)' }} />}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
