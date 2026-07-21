'use client'

import { useState } from 'react'
import { Loader2, Search, Pencil, ArrowLeft, FileText } from 'lucide-react'
import ShiftReportForm, { type ReportPrefill, type ExistingFile } from './ShiftReportForm'

interface CreatorOption {
  id: string
  name: string
}
interface MemberOption {
  id: string
  name: string
}

type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

// Shape returned by /api/shift-report/mine (no edit_token, no storage paths).
interface MyReport {
  id: string
  creator_id: string | null
  creator_name: string | null
  chatter_id: string | null
  chatter_name: string
  shift_date: string
  shift_label: string | null
  time_range: string | null
  gross_amount: number
  net_amount: number
  currency: string
  new_subs: number
  renew_subs: number
  mass_message_replies: number
  chat_engagements: number
  mass_message_note: string | null
  went_well: string | null
  went_wrong: string | null
  sub_behavior: string | null
  review_status: ReviewStatus | null
  edit_count: number | null
  last_edited_at: string | null
  created_at: string
  creator?: { id: string; name: string } | null
  files?: ExistingFile[]
}

const EXTERNAL = '__external__'

const STATUS_STYLE: Record<ReviewStatus, { label: string; bg: string; color: string }> = {
  PENDING: { label: 'In review', bg: 'var(--accent-dim)', color: 'var(--accent)' },
  APPROVED: { label: 'Approved', bg: 'rgba(74,222,128,.14)', color: 'var(--green)' },
  REJECTED: { label: 'Rejected', bg: 'var(--red-dim)', color: 'var(--red)' },
}

function toPrefill(r: MyReport): ReportPrefill {
  return {
    creator_id: r.creator_id,
    chatter_id: r.chatter_id,
    chatter_name: r.chatter_name,
    shift_date: r.shift_date,
    shift_label: r.shift_label,
    time_range: r.time_range,
    gross_amount: r.gross_amount,
    net_amount: r.net_amount,
    currency: r.currency,
    new_subs: r.new_subs,
    renew_subs: r.renew_subs,
    mass_message_replies: r.mass_message_replies,
    chat_engagements: r.chat_engagements,
    mass_message_note: r.mass_message_note,
    went_well: r.went_well,
    went_wrong: r.went_wrong,
    sub_behavior: r.sub_behavior,
  }
}

export default function MyReportsPanel({
  creators,
  members = [],
}: {
  creators: CreatorOption[]
  members?: MemberOption[]
}) {
  const [chatterChoice, setChatterChoice] = useState<string>(members.length === 0 ? EXTERNAL : '')
  const [externalName, setExternalName] = useState('')
  const isExternal = chatterChoice === EXTERNAL

  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [reports, setReports] = useState<MyReport[]>([])
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<MyReport | null>(null)

  const canLoad = isExternal ? externalName.trim().length > 0 : chatterChoice !== ''

  async function load() {
    setLoading(true)
    setError(null)
    const body = isExternal
      ? { chatter_name: externalName.trim() }
      : { chatter_id: chatterChoice }
    try {
      const res = await fetch('/api/shift-report/mine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Could not load your reports. Please try again.')
      } else {
        setReports(data.reports || [])
        setLoaded(true)
      }
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  // ---- Editing a rejected report ----
  if (editing) {
    return (
      <div>
        <button
          onClick={() => setEditing(null)}
          className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-bold"
          style={{ color: 'var(--accent)' }}
        >
          <ArrowLeft size={15} /> Back to my reports
        </button>
        <ShiftReportForm
          creators={creators}
          members={members}
          mode="resubmit"
          reportId={editing.id}
          prefill={toPrefill(editing)}
          existingFiles={editing.files || []}
          onSuccess={() => {
            setEditing(null)
            load()
          }}
        />
      </div>
    )
  }

  return (
    <div className="app-card space-y-5 p-6 sm:p-7">
      <div>
        <h2 className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>Find my shift reports</h2>
        <p className="mt-1 text-[12.5px] leading-5" style={{ color: 'var(--muted)' }}>
          Pick your name to see the reports you submitted. You can correct a <strong>rejected</strong> report
          and send it back for review — no need for the original link.
        </p>
      </div>

      {/* Name picker */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="block flex-1">
          <span className="form-label">Your name (chatter)</span>
          {members.length > 0 ? (
            <select
              className="form-control"
              value={chatterChoice}
              onChange={(e) => { setChatterChoice(e.target.value); setLoaded(false) }}
              aria-label="Select who you are"
            >
              <option value="" disabled>Select your name…</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              <option value={EXTERNAL}>External / other…</option>
            </select>
          ) : (
            <input
              className="form-control"
              placeholder="Type your name"
              value={externalName}
              onChange={(e) => { setExternalName(e.target.value); setLoaded(false) }}
            />
          )}
          {members.length > 0 && isExternal && (
            <input
              className="form-control mt-2"
              placeholder="Type your name"
              value={externalName}
              onChange={(e) => { setExternalName(e.target.value); setLoaded(false) }}
            />
          )}
        </label>
        <button onClick={load} disabled={!canLoad || loading} className="btn btn-primary min-h-11 sm:w-auto">
          {loading ? <Loader2 className="animate-spin" size={15} /> : <Search size={15} />}
          Show my reports
        </button>
      </div>

      {error && (
        <p className="rounded-[9px] border px-3.5 py-2.5 text-sm" style={{ background: 'var(--red-dim)', borderColor: 'rgba(239,68,68,.3)', color: 'var(--red)' }}>{error}</p>
      )}

      {/* Results */}
      {loaded && (
        reports.length === 0 ? (
          <div className="rounded-[10px] border p-8 text-center" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
            <FileText className="mx-auto mb-2" size={22} style={{ color: 'var(--muted)' }} />
            <p className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>No reports found for this name yet</p>
            <p className="mt-1 text-[12px]" style={{ color: 'var(--muted)' }}>Make sure you picked the same name you submitted under.</p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {reports.map((r) => <ReportRow key={r.id} report={r} onEdit={() => setEditing(r)} />)}
          </ul>
        )
      )}
    </div>
  )
}

function ReportRow({ report: r, onEdit }: { report: MyReport; onEdit: () => void }) {
  const status = (r.review_status || 'PENDING') as ReviewStatus
  const s = STATUS_STYLE[status]
  const modelName = r.creator_name || r.creator?.name || 'Unknown model'
  const money = (n: number) => `${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${r.currency}`
  const dateLabel = new Date(r.shift_date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  const canEdit = status === 'REJECTED'

  return (
    <li className="rounded-[10px] border p-3.5" style={{ borderColor: canEdit ? 'rgba(239,68,68,.3)' : 'var(--border)', background: 'var(--surface)' }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-bold" style={{ color: 'var(--text)' }}>{modelName}</span>
            <span className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider" style={{ background: s.bg, color: s.color }}>{s.label}</span>
          </div>
          <p className="mt-0.5 text-[12px]" style={{ color: 'var(--muted)' }}>
            {dateLabel}{r.shift_label ? ` · ${r.shift_label}` : ''}{r.time_range ? ` · ${r.time_range}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-[9px] font-bold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Net</p>
            <p className="text-[14px] font-extrabold" style={{ color: 'var(--accent)' }}>{money(r.net_amount)}</p>
          </div>
          {canEdit ? (
            <button onClick={onEdit} className="btn btn-primary !min-h-9 !px-3 !text-[12.5px]">
              <Pencil size={13} /> Fix & resubmit
            </button>
          ) : (
            <span className="text-[11px]" style={{ color: 'var(--muted)' }}>
              {status === 'APPROVED' ? 'Locked' : 'Awaiting review'}
            </span>
          )}
        </div>
      </div>
    </li>
  )
}
