'use client'

import { useMemo, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ShiftReport, ShiftReportReviewStatus } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { blobToJpegDataUrl, downloadShiftReportsPdf, type PdfReportData } from '@/lib/shiftReportPdf'
import { Copy, Check, Link2, FileText, ExternalLink, Settings, FileDown, Trash2, Loader2, X } from 'lucide-react'

type RangeKey = 'all' | '7' | '30' | '90'
type ReviewFilter = 'all' | ShiftReportReviewStatus

// Pending first and as the default — reviewed reports are the ones you no
// longer care about, so "All" moved to the end (Tan, 2026-07-19).
const REVIEW_FILTERS: { key: ReviewFilter; label: string }[] = [
  { key: 'PENDING', label: 'Pending' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'all', label: 'All' },
]

// window.location.origin never changes during a page's life — nothing to subscribe to.
const subscribeNoop = () => () => {}

const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: '7', label: 'Last 7 days' },
  { key: '30', label: 'Last 30 days' },
  { key: '90', label: 'Last 90 days' },
]

/** Build the PDF payload for one report: pull each image through a signed URL
 *  and normalize to JPEG. PDFs and failed downloads are counted, not embedded. */
async function toPdfData(r: ShiftReport): Promise<PdfReportData> {
  const images: { name: string; dataUrl: string }[] = []
  let skipped = 0
  for (const f of r.files || []) {
    const isPdf = (f.file_type || '').includes('pdf')
    if (isPdf || !f.signed_url) { skipped += 1; continue }
    try {
      const res = await fetch(f.signed_url)
      if (!res.ok) { skipped += 1; continue }
      const dataUrl = await blobToJpegDataUrl(await res.blob())
      if (dataUrl) images.push({ name: f.file_name || 'screenshot', dataUrl })
      else skipped += 1
    } catch {
      skipped += 1
    }
  }
  return {
    modelName: r.creator_name || r.creator?.name || 'Unknown model',
    chatterName: r.chatter_name,
    shiftDate: r.shift_date,
    shiftLabel: r.shift_label,
    timeRange: r.time_range,
    gross: r.gross_amount,
    net: r.net_amount,
    currency: r.currency,
    newSubs: r.new_subs,
    renewSubs: r.renew_subs,
    massMessageReplies: r.mass_message_replies,
    chatEngagements: r.chat_engagements,
    massMessageNote: r.mass_message_note,
    wentWell: r.went_well,
    wentWrong: r.went_wrong,
    subBehavior: r.sub_behavior,
    images,
    skippedAttachments: skipped,
  }
}

export default function ReportsView({
  reports,
  isAdmin,
  userId,
}: {
  reports: ShiftReport[]
  isAdmin: boolean
  userId: string
}) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  // Filters swapped 2026-07-19 (Tan): the dropdown now holds the chatters
  // (member names) and the free-text search matches the creator/model instead.
  const [chatterFilter, setChatterFilter] = useState<string>('all')
  const [creatorQuery, setCreatorQuery] = useState('')
  const [range, setRange] = useState<RangeKey>('all')
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('PENDING')
  // Optimistic review states, so approving doesn't need a full page refresh.
  const [reviewOverrides, setReviewOverrides] = useState<Record<string, ShiftReportReviewStatus>>({})
  const [reviewBusy, setReviewBusy] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pdfBusy, setPdfBusy] = useState<string | null>(null) // report id or 'bulk'
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reviewOf = (r: ShiftReport): ShiftReportReviewStatus => reviewOverrides[r.id] ?? r.review_status ?? 'PENDING'

  // Clicking the already-active decision resets the report back to Pending.
  async function setReview(r: ShiftReport, decision: 'APPROVED' | 'REJECTED') {
    const target: ShiftReportReviewStatus = reviewOf(r) === decision ? 'PENDING' : decision
    setReviewBusy(r.id)
    setError(null)
    const { error: updErr } = await supabase
      .from('shift_reports')
      .update({
        review_status: target,
        reviewed_by: target === 'PENDING' ? null : userId,
        reviewed_at: target === 'PENDING' ? null : new Date().toISOString(),
      })
      .eq('id', r.id)
    if (updErr) {
      setError(updErr.message.includes('review_status') ? 'Migration 033 is required for report reviews — run it in the Supabase SQL editor.' : updErr.message)
    } else {
      setReviewOverrides((prev) => ({ ...prev, [r.id]: target }))
    }
    setReviewBusy(null)
  }

  // Hydration-safe origin: server snapshot renders '', the client value fills in
  // after hydration. Reading window.location directly during render makes the
  // server and client HTML disagree and React throws a hydration mismatch.
  const origin = useSyncExternalStore(subscribeNoop, () => window.location.origin, () => '')
  const submitUrl = `${origin}/submit-report`

  // Chatter dropdown options: the distinct chatter names that actually
  // submitted reports (chatter_name is free text — there is no member FK).
  const chatterNames = useMemo(
    () => Array.from(new Set(reports.map((r) => r.chatter_name.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [reports]
  )

  const filtered = useMemo(() => {
    let cutoff = 0
    if (range !== 'all') {
      const d = new Date()
      d.setDate(d.getDate() - Number(range))
      cutoff = d.getTime()
    }
    const q = creatorQuery.trim().toLowerCase()
    return reports.filter((r) => {
      if (chatterFilter !== 'all' && r.chatter_name.trim() !== chatterFilter) return false
      if (q && !(r.creator_name || r.creator?.name || '').toLowerCase().includes(q)) return false
      if (cutoff && new Date(r.shift_date).getTime() < cutoff) return false
      if (reviewFilter !== 'all' && (reviewOverrides[r.id] ?? r.review_status ?? 'PENDING') !== reviewFilter) return false
      return true
    })
  }, [reports, chatterFilter, creatorQuery, range, reviewFilter, reviewOverrides])

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(submitUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {}
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function downloadPdf(items: ShiftReport[], busyKey: string) {
    if (items.length === 0) return
    setPdfBusy(busyKey)
    setError(null)
    try {
      const data: PdfReportData[] = []
      for (const r of items) data.push(await toPdfData(r))
      const filename = items.length === 1
        ? `shift-report-${items[0].shift_date}-${items[0].chatter_name.replace(/[^a-zA-Z0-9-]/g, '_') || 'chatter'}.pdf`
        : `shift-reports-${new Date().toISOString().slice(0, 10)}-${items.length}.pdf`
      await downloadShiftReportsPdf(data, filename)
    } catch {
      setError('PDF could not be generated. Please try again.')
    } finally {
      setPdfBusy(null)
    }
  }

  async function deleteReport(r: ShiftReport) {
    const label = `${r.creator_name || r.creator?.name || 'Unknown model'} · ${r.chatter_name} · ${r.shift_date}`
    if (!confirm(`Delete this shift report permanently?\n\n${label}\n\nScreenshots are deleted too. This cannot be undone.`)) return
    setDeleting(r.id)
    setError(null)
    const res = await fetch('/api/shift-report/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: r.id }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      setError(body?.error || 'Could not delete the report.')
    } else {
      setSelected((prev) => {
        const next = new Set(prev)
        next.delete(r.id)
        return next
      })
      router.refresh()
    }
    setDeleting(null)
  }

  const selectedReports = filtered.filter((r) => selected.has(r.id))

  return (
    <div className="page-shell !max-w-[1080px]">
      {/* Header — same page-header pattern as every other in-app page */}
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Tools</p>
          <h1 className="page-title">Shift Reports</h1>
          <p className="page-description">Everything the chatters submit — sales, notes and screenshots, in one place.</p>
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
      </header>

      {/* Submission link hint */}
      <div className="mb-5 flex items-center gap-2 rounded-[10px] border px-3.5 py-2.5 text-[12.5px]" style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--muted)' }}>
        <Link2 size={14} className="flex-none" style={{ color: 'var(--accent)' }} />
        <span className="min-w-0 flex-1 truncate">Share this link with chatters (no login needed): <span style={{ color: 'var(--text-secondary)' }}>{submitUrl}</span></span>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={chatterFilter} onChange={(e) => setChatterFilter(e.target.value)} className="form-control !h-9 !w-auto text-[12.5px]">
          <option value="all">All members</option>
          {chatterNames.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <input
          value={creatorQuery}
          onChange={(e) => setCreatorQuery(e.target.value)}
          placeholder="Search creator…"
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
        <div className="flex items-center gap-1">
          {REVIEW_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setReviewFilter(f.key)}
              className="rounded-full px-3 py-1.5 text-[11.5px] font-bold"
              style={reviewFilter === f.key
                ? f.key === 'APPROVED'
                  ? { background: 'var(--green)', color: '#071007' }
                  : f.key === 'REJECTED'
                    ? { background: 'var(--red)', color: '#fff' }
                    : { background: 'var(--accent)', color: '#0b0d09' }
                : { background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-[12px]" style={{ color: 'var(--muted)' }}>{filtered.length} report{filtered.length === 1 ? '' : 's'}</span>
      </div>

      {/* Bulk actions — appears once reports are ticked */}
      {selected.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[10px] border px-3.5 py-2.5" style={{ borderColor: 'var(--border-strong)', background: 'var(--surface)' }}>
          <span className="text-[12.5px] font-bold" style={{ color: 'var(--text-secondary)' }}>{selected.size} selected</span>
          <button
            onClick={() => downloadPdf(selectedReports, 'bulk')}
            disabled={pdfBusy !== null}
            className="btn btn-primary !min-h-9 !px-3 !text-[12.5px]"
          >
            {pdfBusy === 'bulk' ? <Loader2 className="animate-spin" size={14} /> : <FileDown size={14} />}
            Download PDF ({selected.size})
          </button>
          <button onClick={() => setSelected(new Set())} className="btn btn-secondary !min-h-9 !px-3 !text-[12.5px]">Clear selection</button>
        </div>
      )}

      {error && (
        <p className="mb-4 rounded-[9px] border px-3.5 py-2.5 text-sm" style={{ background: 'var(--red-dim)', borderColor: 'rgba(239,68,68,.3)', color: 'var(--red)' }}>{error}</p>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <div className="app-card p-10 text-center">
          <FileText className="mx-auto mb-3" size={26} style={{ color: 'var(--muted)' }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>{reports.length === 0 ? 'No reports yet' : 'Nothing matches these filters'}</p>
          <p className="mt-1 text-[12.5px]" style={{ color: 'var(--muted)' }}>{reports.length === 0 ? 'Reports submitted through the form will show up here.' : reviewFilter === 'PENDING' ? 'No pending reports — everything is reviewed. Switch to “All” to see the rest.' : 'Try different filters or switch to “All”.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <ReportCard
              key={r.id}
              report={r}
              isAdmin={isAdmin}
              checked={selected.has(r.id)}
              onToggle={() => toggleSelected(r.id)}
              onPdf={() => downloadPdf([r], r.id)}
              pdfBusy={pdfBusy === r.id}
              onDelete={() => deleteReport(r)}
              deleting={deleting === r.id}
              review={reviewOf(r)}
              onReview={(decision) => setReview(r, decision)}
              reviewBusy={reviewBusy === r.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ReportCard({
  report: r,
  isAdmin,
  checked,
  onToggle,
  onPdf,
  pdfBusy,
  onDelete,
  deleting,
  review,
  onReview,
  reviewBusy,
}: {
  report: ShiftReport
  isAdmin: boolean
  checked: boolean
  onToggle: () => void
  onPdf: () => void
  pdfBusy: boolean
  onDelete: () => void
  deleting: boolean
  review: ShiftReportReviewStatus
  onReview: (decision: 'APPROVED' | 'REJECTED') => void
  reviewBusy: boolean
}) {
  const [open, setOpen] = useState(false)
  const money = (n: number) => `${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${r.currency}`
  const dateLabel = new Date(r.shift_date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  const modelName = r.creator_name || r.creator?.name || 'Unknown model'
  const hasNotes = r.mass_message_note || r.went_well || r.went_wrong || r.sub_behavior
  const edited = (r.edit_count ?? 0) > 0

  return (
    <div className="app-card p-4 sm:p-5" style={checked ? { borderColor: 'var(--accent)' } : undefined}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggle}
            className="h-4 w-4 flex-none accent-[var(--accent)]"
            aria-label={`Select report from ${r.chatter_name} on ${dateLabel}`}
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>{modelName}</span>
              <span className="text-[12.5px]" style={{ color: 'var(--muted)' }}>· {r.chatter_name}</span>
              {edited && (
                <span
                  className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                  style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}
                  title={r.last_edited_at ? `Last edited ${new Date(r.last_edited_at).toLocaleString()}` : undefined}
                >
                  edited ×{r.edit_count}
                </span>
              )}
              {review !== 'PENDING' && (
                <span
                  className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                  style={review === 'APPROVED'
                    ? { background: 'rgba(74,222,128,.14)', color: 'var(--green)' }
                    : { background: 'var(--red-dim)', color: 'var(--red)' }}
                >
                  {review === 'APPROVED' ? 'Approved' : 'Rejected'}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[12px]" style={{ color: 'var(--muted)' }}>
              {dateLabel}{r.shift_label ? ` · ${r.shift_label}` : ''}{r.time_range ? ` · ${r.time_range}` : ''}
            </p>
          </div>
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
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-1">
              <button onClick={onPdf} disabled={pdfBusy} className="icon-button !h-8 !w-8" title="Download as PDF" aria-label="Download as PDF">
                {pdfBusy ? <Loader2 className="animate-spin" size={14} /> : <FileDown size={14} />}
              </button>
              {isAdmin && (
                <button onClick={onDelete} disabled={deleting} className="icon-button !h-8 !w-8 hover:!text-[var(--red)]" title="Delete report" aria-label="Delete report">
                  {deleting ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />}
                </button>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onReview('APPROVED')}
                disabled={reviewBusy}
                className="flex h-8 w-8 items-center justify-center rounded-[8px] border transition-colors disabled:opacity-50"
                style={review === 'APPROVED'
                  ? { background: 'var(--green)', borderColor: 'var(--green)', color: '#071007' }
                  : { background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--green)' }}
                title={review === 'APPROVED' ? 'Approved — click to undo' : 'Approve report'}
                aria-label={review === 'APPROVED' ? 'Approved — click to undo' : 'Approve report'}
              >
                {reviewBusy ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}
              </button>
              <button
                onClick={() => onReview('REJECTED')}
                disabled={reviewBusy}
                className="flex h-8 w-8 items-center justify-center rounded-[8px] border transition-colors disabled:opacity-50"
                style={review === 'REJECTED'
                  ? { background: 'var(--red)', borderColor: 'var(--red)', color: '#fff' }
                  : { background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--red)' }}
                title={review === 'REJECTED' ? 'Rejected — click to undo' : 'Reject report'}
                aria-label={review === 'REJECTED' ? 'Rejected — click to undo' : 'Reject report'}
              >
                <X size={14} />
              </button>
            </div>
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
