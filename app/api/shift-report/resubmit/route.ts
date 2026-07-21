import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import {
  MAX_BODY_BYTES,
  MAX_FILES,
  SHIFT_REPORT_BUCKET,
  parseReportFields,
  uploadReportFiles,
} from '@/lib/shiftReport'

// Public endpoint — a chatter corrects a REJECTED shift report from the "My
// reports" panel (no login, no secret edit link). Unlike /api/shift-report/edit,
// this path is NOT bound by the 2-edits / 8-hour window: a rejection often lands
// long after the shift, so the chatter must be able to fix it whenever it comes
// back. Hard guarantees enforced here (never client-side):
//   • only a report whose review_status is REJECTED can be resubmitted;
//   • the chatter identity is frozen to the original submitter — a resubmit can
//     never move the report to a different person;
//   • APPROVED / PENDING reports are untouchable through this route, so a paid-out
//     report can never be reopened by a chatter.
// On success the report is overwritten and reset to PENDING for re-review, and
// every active admin/manager is notified in-app.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  try {
    const contentLength = Number(req.headers.get('content-length') || 0)
    if (contentLength > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Upload too large. Max 6 files, 8 MB each.' }, { status: 413 })
    }

    const form = await req.formData()
    const reportId = String(form.get('report_id') || '')
    if (!UUID_RE.test(reportId)) {
      return NextResponse.json({ error: 'Invalid report.' }, { status: 400 })
    }

    const supabase = await createAdminClient()

    const { data: report } = await supabase
      .from('shift_reports')
      .select('*, files:shift_report_files(id, path)')
      .eq('id', reportId)
      .maybeSingle()

    if (!report) {
      return NextResponse.json({ error: 'This report no longer exists.' }, { status: 404 })
    }
    if ((report.review_status ?? 'PENDING') !== 'REJECTED') {
      return NextResponse.json(
        { error: 'Only rejected reports can be corrected here.' },
        { status: 403 }
      )
    }

    const fields = await parseReportFields(form, supabase)
    if (!fields) {
      return NextResponse.json({ error: 'Your name is required.' }, { status: 400 })
    }

    // Freeze the chatter to the original submitter. For a linked member the ids
    // must match; for an external chatter we simply keep the stored name.
    if (report.chatter_id) {
      if (fields.chatter_id !== report.chatter_id) {
        return NextResponse.json({ error: 'This report belongs to a different chatter.' }, { status: 403 })
      }
    }
    fields.chatter_id = report.chatter_id ?? null
    fields.chatter_name = report.chatter_name

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

    // ---- Overwrite the report and send it back for review ----
    const newEditCount = (report.edit_count ?? 0) + 1
    const { error: updateError } = await supabase
      .from('shift_reports')
      .update({
        ...fields,
        review_status: 'PENDING',
        reviewed_by: null,
        reviewed_at: null,
        edit_count: newEditCount,
        last_edited_at: new Date().toISOString(),
      })
      .eq('id', report.id)

    if (updateError) {
      console.error('[shift-report/resubmit] update failed:', updateError.code, updateError.message, updateError.details)
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
      const message = `Rejected shift report corrected & resubmitted — back to Pending: ${fields.chatter_name} · ${fields.creator_name || 'Unknown model'} · ${fields.shift_date}`
      await supabase.from('notifications').insert(
        reviewers.map((p) => ({ user_id: p.id, type: 'shift_report', message }))
      )
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Server error. Please try again.' }, { status: 500 })
  }
}
