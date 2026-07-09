'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ShiftReport, ShiftReportCreator } from '@/lib/types'
import { Copy, Check, Link2, FileText, ExternalLink, Settings } from 'lucide-react'

type RangeKey = 'all' | '7' | '30' | '90'

const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: '7', label: 'Last 7 days' },
  { key: '30', label: 'Last 30 days' },
  { key: '90', label: 'Last 90 days' },
]

export default function ReportsView({
  reports,
  creators,
  isAdmin,
}: {
  reports: ShiftReport[]
  creators: ShiftReportCreator[]
  isAdmin: boolean
}) {
  const [creatorFilter, setCreatorFilter] = useState<string>('all')
  const [chatterQuery, setChatterQuery] = useState('')
  const [range, setRange] = useState<RangeKey>('all')
  const [copied, setCopied] = useState(false)

  const submitUrl = typeof window !== 'undefined' ? `${window.location.origin}/submit-report` : '/submit-report'

  const filtered = useMemo(() => {
    let cutoff = 0
    if (range !== 'all') {
      const d = new Date()
      d.setDate(d.getDate() - Number(range))
      cutoff = d.getTime()
    }
    const q = chatterQuery.trim().toLowerCase()
    return reports.filter((r) => {
      if (creatorFilter !== 'all' && r.creator_id !== creatorFilter) return false
      if (q && !r.chatter_name.toLowerCase().includes(q)) return false
      if (cutoff && new Date(r.shift_date).getTime() < cutoff) return false
      return true
    })
  }, [reports, creatorFilter, chatterQuery, range])

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(submitUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {}
  }

  return (
    <div className="mx-auto max-w-[980px] px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-[-.02em]" style={{ color: 'var(--text)' }}>Shift Reports</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>Everything the chatters submit — sales, notes and screenshots, in one place.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <Link href="/settings" className="btn btn-secondary min-h-10">
              <Settings size={15} /> Manage models
            </Link>
          )}
          <a href={submitUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary min-h-10">
            <ExternalLink size={15} /> Open form
          </a>
          <button onClick={copyLink} className="btn btn-primary min-h-10">
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? 'Copied!' : 'Copy submission link'}
          </button>
        </div>
      </div>

      {/* Submission link hint */}
      <div className="mb-5 flex items-center gap-2 rounded-[10px] border px-3.5 py-2.5 text-[12.5px]" style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--muted)' }}>
        <Link2 size={14} className="flex-none" style={{ color: 'var(--accent)' }} />
        <span className="min-w-0 flex-1 truncate">Share this link with chatters (no login needed): <span style={{ color: 'var(--text-secondary)' }}>{submitUrl}</span></span>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={creatorFilter} onChange={(e) => setCreatorFilter(e.target.value)} className="form-control !h-9 !w-auto text-[12.5px]">
          <option value="all">All models</option>
          {creators.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input
          value={chatterQuery}
          onChange={(e) => setChatterQuery(e.target.value)}
          placeholder="Search chatter…"
          className="form-control !h-9 !w-[180px] text-[12.5px]"
        />
        <div className="flex items-center gap-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className="rounded-full px-3 py-1.5 text-[11.5px] font-bold"
              style={range === r.key
                ? { background: 'var(--accent)', color: '#0b0d09' }
                : { background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}
            >
              {r.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-[12px]" style={{ color: 'var(--muted)' }}>{filtered.length} report{filtered.length === 1 ? '' : 's'}</span>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="app-card p-10 text-center">
          <FileText className="mx-auto mb-3" size={26} style={{ color: 'var(--muted)' }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>No reports yet</p>
          <p className="mt-1 text-[12.5px]" style={{ color: 'var(--muted)' }}>Reports submitted through the form will show up here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => <ReportCard key={r.id} report={r} />)}
        </div>
      )}
    </div>
  )
}

function ReportCard({ report: r }: { report: ShiftReport }) {
  const [open, setOpen] = useState(false)
  const money = (n: number) => `${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${r.currency}`
  const dateLabel = new Date(r.shift_date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  const modelName = r.creator_name || r.creator?.name || 'Unknown model'
  const hasNotes = r.mass_message_note || r.went_well || r.went_wrong || r.sub_behavior

  return (
    <div className="app-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>{modelName}</span>
            <span className="text-[12.5px]" style={{ color: 'var(--muted)' }}>· {r.chatter_name}</span>
          </div>
          <p className="mt-0.5 text-[12px]" style={{ color: 'var(--muted)' }}>
            {dateLabel}{r.shift_label ? ` · ${r.shift_label}` : ''}{r.time_range ? ` · ${r.time_range}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-4 text-right">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Gross</p>
            <p className="text-[15px] font-extrabold" style={{ color: 'var(--text)' }}>{money(r.gross_amount)}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Net</p>
            <p className="text-[15px] font-extrabold" style={{ color: 'var(--accent)' }}>{money(r.net_amount)}</p>
          </div>
        </div>
      </div>

      {/* Counts */}
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
        <span>New subs: <strong>{r.new_subs}</strong></span>
        <span>Renew subs: <strong>{r.renew_subs}</strong></span>
        <span>Mass msg replies: <strong>{r.mass_message_replies}</strong></span>
        <span>Chat engagements: <strong>{r.chat_engagements}</strong></span>
      </div>

      {/* Screenshots */}
      {!!r.files?.length && (
        <div className="mt-3 flex flex-wrap gap-2">
          {r.files.map((f) => {
            const isPdf = (f.file_type || '').includes('pdf')
            return (
              <a
                key={f.id}
                href={f.signed_url || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-[8px] border"
                style={{ borderColor: 'var(--border-strong)', background: 'var(--surface)' }}
                title={f.file_name || 'attachment'}
              >
                {isPdf || !f.signed_url ? (
                  <FileText size={20} style={{ color: 'var(--muted)' }} />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.signed_url} alt={f.file_name || 'screenshot'} className="h-full w-full object-cover" />
                )}
              </a>
            )
          })}
        </div>
      )}

      {/* Notes (collapsible) */}
      {hasNotes && (
        <div className="mt-3">
          <button onClick={() => setOpen((o) => !o)} className="text-[12px] font-bold" style={{ color: 'var(--accent)' }}>
            {open ? 'Hide notes' : 'Show notes'}
          </button>
          {open && (
            <div className="mt-2 space-y-2 text-[12.5px] leading-6" style={{ color: 'var(--text-secondary)' }}>
              {r.mass_message_note && <NoteRow label="Mass message" value={r.mass_message_note} />}
              {r.went_well && <NoteRow label="Went well" value={r.went_well} />}
              {r.went_wrong && <NoteRow label="Went wrong" value={r.went_wrong} />}
              {r.sub_behavior && <NoteRow label="Sub behaviour" value={r.sub_behavior} />}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function NoteRow({ label, value }: { label: string; value: string }) {
  return (
    <p><span className="font-bold" style={{ color: 'var(--text)' }}>{label}:</span> {value}</p>
  )
}
