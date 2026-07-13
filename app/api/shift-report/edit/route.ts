import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import {
  EDIT_WINDOW_MS,
  MAX_BODY_BYTES,
  MAX_EDITS,
  MAX_FILES,
  SHIFT_REPORT_BUCKET,
  parseReportFields,
  uploadReportFiles,
  type ShiftReportFields,
} from '@/lib/shiftReport'

// Public endpoint — a chatter revises their own report using the secret edit
// token they received on submission. No session involved; the token is the only
// credential, and the 2-edits / 8-hour policy is enforced HERE (never client-side).
// Every edit notifies all active admins/managers in-app with an old → new summary.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Field labels for the change summary in the notification.
const DIFF_LABELS: Partial<Record<keyof ShiftReportFields, string>> = {
  creator_name: 'Model',
  chatter_name: 'Chatter',
  shift_date: 'Shift date',
  shift_label: 'Shift',
  time_range: 'Time',
  gross_amount: 'Gross',
  net_amount: 'Net',
  currency: 'Currency',
  new_subs: 'New subs',
  renew_subs: 'Renew subs',
  mass_message_replies: 'Mass msg replies',
  chat_engagements: 'Chat engagements',
  mass_message_note: 'Mass message note',
  went_well: 'Went well',
  went_wrong: 'Went wrong',
  sub_behavior: 'Sub behaviour',
}

function short(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  const s = String(v)
  return s.length > 40 ? `${s.slice(0, 40)}…` : s
}

export async function POST(req: NextRequest) {
  try {
    const contentLength = Number(req.headers.get('content-length') || 0)
    if (contentLength > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Upload too large. Max 6 files, 8 MB each.' }, { status: 413 })
    }

    const form = await req.formData()
    const token = String(form.get('edit_token') || '')
    if (!UUID_RE.test(token)) {
      return NextResponse.json({ error: 'Invalid edit link.' }, { status: 403 })
    }

    const supabase = await createAdminClient()

    const { data: report } = await supabase
      .from('shift_reports')
      .select('*, files:shift_report_files(id, path)')
      .eq('edit_token', token)
      .maybeSingle()

    if (!report) {
      return NextResponse.json({ error: 'Invalid edit link.' }, { status: 403 })
    }
    if ((report.edit_count ?? 0) >= MAX_EDITS) {
      return NextResponse.json({ error: 'Edit limit reached — this report was already edited twice.' }, { status: 403 })
    }
    if (Date.now() - new Date(report.created_at).getTime() > EDIT_WINDOW_MS) {
      return NextResponse.json({ error: 'The edit window (8 hours after submission) has expired.' }, { status: 403 })
    }

    const fields = await parseReportFields(form, supabase)
    if (!fields) {
      return NextResponse.json({ error: 'Your name is required.' }, { status: 400 })
    }

    // ---- Files: remove the ones the chatter deselected, then add new ones ----
    const existingFiles: { id: string; path: string }[] = report.files || []
    let removedIds: string[] = []
    try {
      const parsed = JSON.parse(String(form.get('removed_file_ids') || '[]'))
      if (Array.isArray(parsed)) removedIds = parsed.map(String).filter((id) => UUID_RE.test(id))
    } catch { /* treat as none removed */ }

    const toRemove = existingFiles.filter((f) => removedIds.includes(f.id))
    if (toRemove.length > 0) {
      await supabase.storage.from(SHIFT_REPORT_BUCKET).remove(toRemove.map((f) => f.path))
      await supabase.from('shift_report_files').delete().in('id', toRemove.map((f) => f.id))
    }

    const remainingCount = existingFiles.length - toRemove.length
    const fileRows = await uploadReportFiles(form, supabase, report.id, MAX_FILES - remainingCount)
    if (fileRows.length > 0) {
      await supabase.from('shift_report_files').insert(fileRows)
    }

    // ---- Build the old → new change summary before overwriting ----
    const changes: string[] = []
    for (const key of Object.keys(DIFF_LABELS) as (keyof ShiftReportFields)[]) {
      const before = report[key]
      const after = fields[key]
      if (String(before ?? '') !== String(after ?? '')) {
        changes.push(`${DIFF_LABELS[key]}: ${short(before)} → ${short(after)}`)
      }
    }
    if (toRemove.length > 0) changes.push(`removed ${toRemove.length} screenshot${toRemove.length === 1 ? '' : 's'}`)
    if (fileRows.length > 0) changes.push(`added ${fileRows.length} screenshot${fileRows.length === 1 ? '' : 's'}`)

    const newEditCount = (report.edit_count ?? 0) + 1
    const { error: updateError } = await supabase
      .from('shift_reports')
      .update({ ...fields, edit_count: newEditCount, last_edited_at: new Date().toISOString() })
      .eq('id', report.id)

    if (updateError) {
      console.error('[shift-report/edit] update failed:', updateError.code, updateError.message, updateError.details)
      const schemaGap = updateError.code === '42703' || updateError.code === 'PGRST204' || /column/i.test(updateError.message || '')
      return NextResponse.json({
        error: schemaGap
          ? 'The changes could not be saved because the database is missing a column. An admin needs to apply the latest migrations.'
          : 'Could not save the changes. Please try again.',
      }, { status: 500 })
    }

    // ---- Notify every active admin/manager in-app ----
    const { data: reviewers } = await supabase
      .from('profiles')
      .select('id')
      .in('role', ['admin', 'manager'])
      .is('deactivated_at', null)

    if (reviewers && reviewers.length > 0) {
      const summary = changes.length > 0 ? changes.join(' · ').slice(0, 600) : 'no field changes'
      const message = `Shift report edited (${newEditCount}/${MAX_EDITS}): ${fields.chatter_name} · ${fields.creator_name || 'Unknown model'} · ${fields.shift_date} — ${summary}`
      await supabase.from('notifications').insert(
        reviewers.map((p) => ({ user_id: p.id, type: 'shift_report', message }))
      )
    }

    return NextResponse.json({ success: true, edits_used: newEditCount, edits_left: MAX_EDITS - newEditCount })
  } catch {
    return NextResponse.json({ error: 'Server error. Please try again.' }, { status: 500 })
  }
}
