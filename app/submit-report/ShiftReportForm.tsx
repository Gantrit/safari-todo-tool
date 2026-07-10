'use client'

import { useState } from 'react'
import { Loader2, CheckCircle2, Upload, X, FileDown, Pencil, Copy, Check } from 'lucide-react'
import DateField from '@/components/ui/DateField'
import { blobToJpegDataUrl, downloadShiftReportsPdf, type PdfReportData } from '@/lib/shiftReportPdf'

interface CreatorOption {
  id: string
  name: string
}

interface MemberOption {
  id: string
  name: string
}

export interface ReportPrefill {
  creator_id: string | null
  chatter_id?: string | null
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
}

export interface ExistingFile {
  id: string
  file_name: string | null
  file_type: string | null
}

interface ShiftReportFormProps {
  creators: CreatorOption[]
  members?: MemberOption[]
  mode?: 'create' | 'edit'
  prefill?: ReportPrefill
  existingFiles?: ExistingFile[]
  editToken?: string
  editsLeft?: number
}

const EXTERNAL = '__external__'

const MAX_FILES = 6
const MAX_FILE_MB = 8
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'application/pdf']

/** Snapshot of what was submitted, kept client-side for the PDF download. */
interface Submitted {
  data: Omit<PdfReportData, 'images' | 'skippedAttachments'>
  files: File[]
  editToken: string | null
  editsLeft: number
}

export default function ShiftReportForm({
  creators,
  members = [],
  mode = 'create',
  prefill,
  existingFiles = [],
  editToken,
  editsLeft = 2,
}: ShiftReportFormProps) {
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<Submitted | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [removedIds, setRemovedIds] = useState<string[]>([])
  const [pdfBusy, setPdfBusy] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  // Chatter picker: a member id, EXTERNAL (type a name), or '' (not chosen yet).
  const initialChatter =
    prefill?.chatter_id && members.some((m) => m.id === prefill.chatter_id)
      ? prefill.chatter_id
      : prefill?.chatter_name
        ? EXTERNAL
        : members.length === 0
          ? EXTERNAL
          : ''
  const [chatterChoice, setChatterChoice] = useState<string>(initialChatter)
  const isExternalChatter = chatterChoice === EXTERNAL

  const isEdit = mode === 'edit'
  const keptExisting = existingFiles.filter((f) => !removedIds.includes(f.id))
  const maxNewFiles = MAX_FILES - (isEdit ? keptExisting.length : 0)

  function addFiles(list: FileList | null) {
    if (!list) return
    const incoming = Array.from(list)
    const rejected: string[] = []
    const ok = incoming.filter((f) => {
      if (!ALLOWED_TYPES.includes(f.type)) {
        rejected.push(`${f.name} — only PNG, JPG, WebP, GIF or PDF`)
        return false
      }
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        rejected.push(`${f.name} — larger than ${MAX_FILE_MB} MB`)
        return false
      }
      return true
    })
    setFiles((prev) => {
      const next = [...prev, ...ok]
      if (next.length > maxNewFiles) rejected.push(`Only ${maxNewFiles} file${maxNewFiles === 1 ? '' : 's'} can be attached.`)
      return next.slice(0, Math.max(0, maxNewFiles))
    })
    setFileError(rejected.length > 0 ? rejected.join(' · ') : null)
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
    setFileError(null)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const form = new FormData(e.currentTarget)
    // Replace the native file input's entries with our managed list.
    form.delete('files')
    files.forEach((f) => form.append('files', f))

    const s = (key: string) => String(form.get(key) || '')
    const n = (key: string) => Number(String(form.get(key) || '0').replace(',', '.')) || 0
    const snapshot: Submitted['data'] = {
      modelName: creators.find((c) => c.id === s('creator_id'))?.name || 'Unknown model',
      chatterName: s('chatter_name'),
      shiftDate: s('shift_date') || new Date().toISOString().slice(0, 10),
      shiftLabel: s('shift_label') || null,
      timeRange: s('time_range') || null,
      gross: n('gross_amount'),
      net: n('net_amount'),
      currency: s('currency') || 'USD',
      newSubs: n('new_subs'),
      renewSubs: n('renew_subs'),
      massMessageReplies: n('mass_message_replies'),
      chatEngagements: n('chat_engagements'),
      massMessageNote: s('mass_message_note') || null,
      wentWell: s('went_well') || null,
      wentWrong: s('went_wrong') || null,
      subBehavior: s('sub_behavior') || null,
    }

    if (isEdit && editToken) {
      form.append('edit_token', editToken)
      form.append('removed_file_ids', JSON.stringify(removedIds))
    }

    try {
      const endpoint = isEdit ? '/api/shift-report/edit' : '/api/shift-report/submit'
      const res = await fetch(endpoint, { method: 'POST', body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.')
        setSubmitting(false)
        return
      }
      setDone({
        data: snapshot,
        files,
        editToken: isEdit ? editToken ?? null : data.edit_token ?? null,
        editsLeft: isEdit ? data.edits_left ?? 0 : 2,
      })
    } catch {
      setError('Network error. Please check your connection and try again.')
      setSubmitting(false)
    }
  }

  async function downloadPdf(sub: Submitted) {
    setPdfBusy(true)
    try {
      const images: { name: string; dataUrl: string }[] = []
      let skipped = isEdit ? keptExisting.length : 0 // existing uploads aren't re-downloadable here
      for (const f of sub.files) {
        const dataUrl = await blobToJpegDataUrl(f)
        if (dataUrl) images.push({ name: f.name, dataUrl })
        else skipped += 1
      }
      await downloadShiftReportsPdf(
        [{ ...sub.data, images, skippedAttachments: skipped }],
        `shift-report-${sub.data.shiftDate}-${sub.data.chatterName.replace(/[^a-zA-Z0-9-]/g, '_') || 'chatter'}.pdf`
      )
    } finally {
      setPdfBusy(false)
    }
  }

  async function copyEditLink(token: string) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/submit-report/edit/${token}`)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 1800)
    } catch {}
  }

  if (done) {
    return (
      <div className="app-card p-8 text-center">
        <CheckCircle2 className="mx-auto mb-4" size={34} style={{ color: 'var(--green)' }} />
        <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>
          {isEdit ? 'Changes saved — thank you!' : 'Report submitted — thank you!'}
        </h2>
        <p className="mt-2 text-sm leading-6" style={{ color: 'var(--muted)' }}>
          {isEdit
            ? done.editsLeft > 0
              ? `You can edit this report ${done.editsLeft} more time${done.editsLeft === 1 ? '' : 's'} within 8 hours of submission.`
              : 'This report can no longer be edited.'
            : 'Your shift report was received. You can download a PDF copy for yourself below.'}
        </p>

        <div className="mt-5 flex flex-col items-center justify-center gap-2 sm:flex-row">
          <button onClick={() => downloadPdf(done)} disabled={pdfBusy} className="btn btn-primary min-h-11 w-full sm:w-auto">
            {pdfBusy ? <Loader2 className="animate-spin" size={15} /> : <FileDown size={15} />}
            Download as PDF
          </button>
          {!isEdit && done.editToken && (
            <a href={`/submit-report/edit/${done.editToken}`} className="btn btn-secondary min-h-11 w-full sm:w-auto">
              <Pencil size={14} /> Edit report
            </a>
          )}
          {!isEdit && (
            <button
              onClick={() => { setDone(null); setFiles([]); setError(null); setSubmitting(false) }}
              className="btn btn-secondary min-h-11 w-full sm:w-auto"
            >
              Submit another report
            </button>
          )}
        </div>

        {!isEdit && done.editToken && (
          <div className="mt-5 rounded-[10px] border p-3 text-left" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
            <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Your private edit link</p>
            <p className="mt-1 text-[12px] leading-5" style={{ color: 'var(--text-secondary)' }}>
              Save this link if you might need to correct something — it works up to 2 times within 8 hours.
            </p>
            <button onClick={() => copyEditLink(done.editToken!)} className="btn btn-secondary mt-2 !min-h-9 !px-3 !text-[12px]">
              {linkCopied ? <Check size={13} /> : <Copy size={13} />}
              {linkCopied ? 'Copied!' : 'Copy edit link'}
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="app-card space-y-6 p-6 sm:p-7">
      {isEdit && (
        <p className="rounded-[9px] border px-3.5 py-2.5 text-[12.5px]" style={{ borderColor: 'var(--border-strong)', background: 'var(--surface)', color: 'var(--text-secondary)' }}>
          You are editing your submitted report. {editsLeft} edit{editsLeft === 1 ? '' : 's'} left · possible up to 8 hours after submission.
        </p>
      )}

      {/* Who / when */}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="form-label">Model *</span>
          {creators.length > 0 ? (
            <select name="creator_id" required className="form-control" defaultValue={prefill?.creator_id || ''}>
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
          {members.length > 0 ? (
            <>
              <select
                className="form-control"
                value={chatterChoice}
                onChange={(e) => setChatterChoice(e.target.value)}
                required
                aria-label="Select who you are"
              >
                <option value="" disabled>Select your name…</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                <option value={EXTERNAL}>External / other…</option>
              </select>
              {/* Submitted fields: id for members, free text for external. */}
              <input type="hidden" name="chatter_id" value={isExternalChatter ? '' : chatterChoice} />
              {isExternalChatter ? (
                <input
                  name="chatter_name"
                  required
                  className="form-control mt-2"
                  placeholder="Type your name"
                  defaultValue={prefill?.chatter_name || ''}
                />
              ) : (
                <input type="hidden" name="chatter_name" value={members.find((m) => m.id === chatterChoice)?.name || ''} />
              )}
            </>
          ) : (
            <input name="chatter_name" required className="form-control" placeholder="e.g. JC" defaultValue={prefill?.chatter_name || ''} />
          )}
        </label>
        <div className="block">
          <span className="form-label">Shift date *</span>
          <DateField name="shift_date" defaultValue={prefill?.shift_date} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="form-label">Shift</span>
            <select name="shift_label" className="form-control" defaultValue={prefill?.shift_label || ''}>
              <option value="">Select…</option>
              <option value="1st shift">1st shift</option>
              <option value="2nd shift">2nd shift</option>
              <option value="3rd shift">3rd shift</option>
            </select>
          </label>
          <label className="block">
            <span className="form-label">Time</span>
            <select name="time_range" className="form-control" defaultValue={prefill?.time_range || ''}>
              <option value="">Select…</option>
              <option value="6am-2pm">6am-2pm</option>
              <option value="2pm-10pm">2pm-10pm</option>
              <option value="10pm-6am">10pm-6am</option>
            </select>
          </label>
        </div>
      </div>

      {/* Sales */}
      <div>
        <p className="mb-3 text-[12px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Sales & tips</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="form-label">Gross texting & tips</span>
            <input type="number" step="0.01" min="0" name="gross_amount" className="form-control" placeholder="0.00" defaultValue={prefill ? prefill.gross_amount : undefined} />
          </label>
          <label className="block">
            <span className="form-label">Net texting & tips</span>
            <input type="number" step="0.01" min="0" name="net_amount" className="form-control" placeholder="0.00" defaultValue={prefill ? prefill.net_amount : undefined} />
          </label>
          <label className="block">
            <span className="form-label">Currency</span>
            <select name="currency" className="form-control" defaultValue={prefill?.currency || 'USD'}>
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
          <input type="number" min="0" name="new_subs" className="form-control" placeholder="0" defaultValue={prefill ? prefill.new_subs : undefined} />
        </label>
        <label className="block">
          <span className="form-label">Renew subs</span>
          <input type="number" min="0" name="renew_subs" className="form-control" placeholder="0" defaultValue={prefill ? prefill.renew_subs : undefined} />
        </label>
        <label className="block">
          <span className="form-label">Mass msg replies</span>
          <input type="number" min="0" name="mass_message_replies" className="form-control" placeholder="0" defaultValue={prefill ? prefill.mass_message_replies : undefined} />
        </label>
        <label className="block">
          <span className="form-label">Chat engagements</span>
          <input type="number" min="0" name="chat_engagements" className="form-control" placeholder="0" defaultValue={prefill ? prefill.chat_engagements : undefined} />
        </label>
      </div>

      {/* Notes */}
      <div className="space-y-4">
        <label className="block">
          <span className="form-label">Did the mass message boost engagement? Could you lead into the script with it?</span>
          <textarea name="mass_message_note" rows={2} className="form-control" placeholder="e.g. no — traffic was low" defaultValue={prefill?.mass_message_note || ''} />
        </label>
        <label className="block">
          <span className="form-label">What went well today</span>
          <textarea name="went_well" rows={3} className="form-control" placeholder="Wins, tips landed, good conversations…" defaultValue={prefill?.went_well || ''} />
        </label>
        <label className="block">
          <span className="form-label">What went wrong today</span>
          <textarea name="went_wrong" rows={3} className="form-control" placeholder="Blockers, issues, anything unclear…" defaultValue={prefill?.went_wrong || ''} />
        </label>
        <label className="block">
          <span className="form-label">Behaviour of the subs / traffic notes</span>
          <textarea name="sub_behavior" rows={3} className="form-control" placeholder="How were the subs today?" defaultValue={prefill?.sub_behavior || ''} />
        </label>
      </div>

      {/* Screenshots */}
      <div>
        <p className="form-label">Sales screenshots (PNG/JPG/PDF, up to {MAX_FILES})</p>

        {/* Already-uploaded files (edit mode) — untick to remove them */}
        {isEdit && existingFiles.length > 0 && (
          <ul className="mb-3 space-y-2">
            {existingFiles.map((f) => {
              const removed = removedIds.includes(f.id)
              return (
                <li key={f.id} className="flex items-center justify-between gap-3 rounded-[9px] border px-3 py-2 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface)', opacity: removed ? 0.5 : 1 }}>
                  <span className="min-w-0 flex-1 truncate" style={{ color: 'var(--text-secondary)', textDecoration: removed ? 'line-through' : 'none' }}>{f.file_name || 'attachment'}</span>
                  <span className="flex-none text-[11px]" style={{ color: 'var(--muted)' }}>uploaded</span>
                  <button
                    type="button"
                    onClick={() => setRemovedIds((prev) => removed ? prev.filter((id) => id !== f.id) : [...prev, f.id])}
                    className="icon-button !h-7 !w-7 flex-none"
                    aria-label={removed ? 'Keep file' : 'Remove file'}
                    title={removed ? 'Keep file' : 'Remove file'}
                  >
                    <X size={14} />
                  </button>
                </li>
              )
            })}
          </ul>
        )}

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

        {fileError && (
          <p className="mt-2 text-[12px]" style={{ color: 'var(--red)' }}>{fileError}</p>
        )}

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
        {submitting ? (isEdit ? 'Saving…' : 'Submitting…') : (isEdit ? 'Save changes' : 'Submit shift report')}
      </button>
    </form>
  )
}
