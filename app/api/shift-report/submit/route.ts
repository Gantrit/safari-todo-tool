import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

// Public endpoint — the shift-report form posts here WITHOUT a session (internal
// and external/emergency chatters alike). All writes use the service role, so we
// validate strictly and never trust anything but the submitted fields.

const BUCKET = 'shift-report-files'
const MAX_FILES = 6
const MAX_FILE_BYTES = 8 * 1024 * 1024 // 8 MB per file
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'application/pdf']

function num(form: FormData, key: string): number {
  const raw = form.get(key)
  if (raw === null || raw === '') return 0
  const n = Number(String(raw).replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function str(form: FormData, key: string): string | null {
  const raw = form.get(key)
  const s = raw === null ? '' : String(raw).trim()
  return s === '' ? null : s
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()

    const chatterName = str(form, 'chatter_name')
    if (!chatterName) {
      return NextResponse.json({ error: 'Your name is required.' }, { status: 400 })
    }

    const shiftDate = str(form, 'shift_date') || new Date().toISOString().slice(0, 10)
    const creatorIdRaw = str(form, 'creator_id')

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
        shift_label: str(form, 'shift_label'),
        time_range: str(form, 'time_range'),
        gross_amount: num(form, 'gross_amount'),
        net_amount: num(form, 'net_amount'),
        currency: str(form, 'currency') || 'USD',
        new_subs: Math.trunc(num(form, 'new_subs')),
        renew_subs: Math.trunc(num(form, 'renew_subs')),
        mass_message_replies: Math.trunc(num(form, 'mass_message_replies')),
        chat_engagements: Math.trunc(num(form, 'chat_engagements')),
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
      if (file.type && !ALLOWED_TYPES.includes(file.type)) continue
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
