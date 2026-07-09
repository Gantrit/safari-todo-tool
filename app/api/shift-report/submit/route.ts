import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

// Public endpoint — the shift-report form posts here WITHOUT a session (internal
// and external/emergency chatters alike). All writes use the service role, so we
// validate strictly and never trust anything but the submitted fields.

const BUCKET = 'shift-report-files'
const MAX_FILES = 6
const MAX_FILE_BYTES = 8 * 1024 * 1024 // 8 MB per file
const MAX_BODY_BYTES = MAX_FILES * MAX_FILE_BYTES + 1024 * 1024 // files + form-field overhead
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'application/pdf']
const MAX_TEXT = 2000 // hard cap per free-text field (public endpoint)
const MAX_AMOUNT = 99_999_999.99 // NUMERIC(10,2) ceiling — clamp instead of 500ing
const MAX_COUNT = 10_000_000

function num(form: FormData, key: string, max: number): number {
  const raw = form.get(key)
  if (raw === null || raw === '') return 0
  const n = Number(String(raw).replace(',', '.'))
  if (!Number.isFinite(n)) return 0
  return Math.min(Math.max(n, 0), max)
}

function str(form: FormData, key: string, max = MAX_TEXT): string | null {
  const raw = form.get(key)
  if (raw === null || raw instanceof File) return null
  const s = String(raw).trim().slice(0, max)
  return s === '' ? null : s
}

export async function POST(req: NextRequest) {
  try {
    const contentLength = Number(req.headers.get('content-length') || 0)
    if (contentLength > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Upload too large. Max 6 files, 8 MB each.' }, { status: 413 })
    }

    const form = await req.formData()

    const chatterName = str(form, 'chatter_name', 120)
    if (!chatterName) {
      return NextResponse.json({ error: 'Your name is required.' }, { status: 400 })
    }

    const rawDate = str(form, 'shift_date', 10)
    const shiftDate = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && !Number.isNaN(Date.parse(rawDate))
      ? rawDate
      : new Date().toISOString().slice(0, 10)
    const creatorIdRaw = str(form, 'creator_id', 40)

    const supabase = await createAdminClient()

    // Validate the creator id (if given) against the table so we don't store junk,
    // and snapshot its name so a later deletion never blanks this report.
    let creatorId: string | null = null
    let creatorName: string | null = null
    if (creatorIdRaw) {
      const { data: creator } = await supabase
        .from('shift_report_creators')
        .select('id, name')
        .eq('id', creatorIdRaw)
        .maybeSingle()
      creatorId = creator?.id ?? null
      creatorName = creator?.name ?? null
    }

    const { data: report, error: insertError } = await supabase
      .from('shift_reports')
      .insert({
        creator_id: creatorId,
        creator_name: creatorName,
        chatter_name: chatterName,
        shift_date: shiftDate,
        shift_label: str(form, 'shift_label', 80),
        time_range: str(form, 'time_range', 80),
        gross_amount: num(form, 'gross_amount', MAX_AMOUNT),
        net_amount: num(form, 'net_amount', MAX_AMOUNT),
        currency: str(form, 'currency', 8) || 'USD',
        new_subs: Math.trunc(num(form, 'new_subs', MAX_COUNT)),
        renew_subs: Math.trunc(num(form, 'renew_subs', MAX_COUNT)),
        mass_message_replies: Math.trunc(num(form, 'mass_message_replies', MAX_COUNT)),
        chat_engagements: Math.trunc(num(form, 'chat_engagements', MAX_COUNT)),
        mass_message_note: str(form, 'mass_message_note'),
        went_well: str(form, 'went_well'),
        went_wrong: str(form, 'went_wrong'),
        sub_behavior: str(form, 'sub_behavior'),
      })
      .select('id')
      .single()

    if (insertError || !report) {
      return NextResponse.json({ error: 'Could not save the report. Please try again.' }, { status: 500 })
    }

    // Upload any attached screenshots/PDFs into the private bucket.
    const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0)
    const accepted = files.slice(0, MAX_FILES)
    const fileRows: { shift_report_id: string; path: string; file_name: string; file_type: string }[] = []

    for (const file of accepted) {
      if (file.size > MAX_FILE_BYTES) continue
      // Require a known-safe type — a missing MIME type must not bypass the allowlist.
      if (!ALLOWED_TYPES.includes(file.type)) continue
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80) || 'upload'
      const path = `${report.id}/${crypto.randomUUID()}-${safeName}`
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })
      if (uploadError) continue
      fileRows.push({ shift_report_id: report.id, path, file_name: file.name.slice(0, 200), file_type: file.type || '' })
    }

    if (fileRows.length > 0) {
      await supabase.from('shift_report_files').insert(fileRows)
    }

    return NextResponse.json({ success: true, uploaded: fileRows.length })
  } catch {
    return NextResponse.json({ error: 'Server error. Please try again.' }, { status: 500 })
  }
}
