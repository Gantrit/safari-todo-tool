import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { MAX_BODY_BYTES, parseReportFields, uploadReportFiles } from '@/lib/shiftReport'

// Public endpoint — the shift-report form posts here WITHOUT a session (internal
// and external/emergency chatters alike). All writes use the service role, so we
// validate strictly and never trust anything but the submitted fields.
// Validation/upload helpers live in lib/shiftReport.ts (shared with the edit route).

export async function POST(req: NextRequest) {
  try {
    const contentLength = Number(req.headers.get('content-length') || 0)
    if (contentLength > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Upload too large. Max 6 files, 8 MB each.' }, { status: 413 })
    }

    const form = await req.formData()
    const supabase = await createAdminClient()

    const fields = await parseReportFields(form, supabase)
    if (!fields) {
      return NextResponse.json({ error: 'Your name is required.' }, { status: 400 })
    }

    const { data: report, error: insertError } = await supabase
      .from('shift_reports')
      .insert(fields)
      .select('id')
      .single()

    if (insertError || !report) {
      return NextResponse.json({ error: 'Could not save the report. Please try again.' }, { status: 500 })
    }

    const fileRows = await uploadReportFiles(form, supabase, report.id)
    if (fileRows.length > 0) {
      await supabase.from('shift_report_files').insert(fileRows)
    }

    // The edit token is the submitter's only credential to revise this report
    // (max 2 edits within 8h — enforced in /api/shift-report/edit). Fetched
    // separately and best-effort so submissions keep working even if the app
    // deploys before migration 024 added the column.
    const { data: tokenRow } = await supabase
      .from('shift_reports')
      .select('edit_token')
      .eq('id', report.id)
      .maybeSingle()

    return NextResponse.json({ success: true, uploaded: fileRows.length, edit_token: tokenRow?.edit_token ?? null })
  } catch {
    return NextResponse.json({ error: 'Server error. Please try again.' }, { status: 500 })
  }
}
