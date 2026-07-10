// Server-side helpers shared by the public shift-report submit and edit routes.
// Both endpoints run with the service role, so every field must be validated here.

import type { SupabaseClient } from '@supabase/supabase-js'

export const SHIFT_REPORT_BUCKET = 'shift-report-files'
export const MAX_FILES = 6
export const MAX_FILE_BYTES = 8 * 1024 * 1024 // 8 MB per file
export const MAX_BODY_BYTES = MAX_FILES * MAX_FILE_BYTES + 1024 * 1024 // files + form-field overhead
export const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'application/pdf']
export const MAX_TEXT = 2000 // hard cap per free-text field (public endpoint)
export const MAX_AMOUNT = 99_999_999.99 // NUMERIC(10,2) ceiling — clamp instead of 500ing
export const MAX_COUNT = 10_000_000

// Edit policy (Tan, 2026-07-10): a chatter may revise a submitted report at most
// twice, and only within 8 hours of the original submission.
export const MAX_EDITS = 2
export const EDIT_WINDOW_MS = 8 * 60 * 60 * 1000

export function num(form: FormData, key: string, max: number): number {
  const raw = form.get(key)
  if (raw === null || raw === '') return 0
  const n = Number(String(raw).replace(',', '.'))
  if (!Number.isFinite(n)) return 0
  return Math.min(Math.max(n, 0), max)
}

export function str(form: FormData, key: string, max = MAX_TEXT): string | null {
  const raw = form.get(key)
  if (raw === null || raw instanceof File) return null
  const s = String(raw).trim().slice(0, max)
  return s === '' ? null : s
}

export interface ShiftReportFields {
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
}

/** Validate + normalize every submitted field. Returns null when the required
 *  chatter name is missing. Looks the creator up so we never store junk ids and
 *  always snapshot the name. */
export async function parseReportFields(form: FormData, supabase: SupabaseClient): Promise<ShiftReportFields | null> {
  // A chatter is EITHER a known member (chatter_id → name snapshotted from the
  // profile, so filtering never breaks on a typo) OR an external person with no
  // account (chatter_id null, free-text chatter_name). The member name is always
  // taken from the DB, never trusted from the client.
  const chatterIdRaw = str(form, 'chatter_id', 40)
  let chatterId: string | null = null
  let chatterName = str(form, 'chatter_name', 120)
  if (chatterIdRaw) {
    const { data: member } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('id', chatterIdRaw)
      .maybeSingle()
    if (member?.id) {
      chatterId = member.id
      chatterName = (member.full_name || '').trim().slice(0, 120) || chatterName
    }
  }
  if (!chatterName) return null

  const rawDate = str(form, 'shift_date', 10)
  const shiftDate = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && !Number.isNaN(Date.parse(rawDate))
    ? rawDate
    : new Date().toISOString().slice(0, 10)

  const creatorIdRaw = str(form, 'creator_id', 40)
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

  return {
    creator_id: creatorId,
    creator_name: creatorName,
    chatter_id: chatterId,
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
  }
}

/** Upload the form's attached files into the private bucket and return the rows
 *  to insert into shift_report_files. Silently skips oversized/unknown files —
 *  the client pre-validates, this is the hard backstop. */
export async function uploadReportFiles(
  form: FormData,
  supabase: SupabaseClient,
  reportId: string,
  maxNewFiles = MAX_FILES,
): Promise<{ shift_report_id: string; path: string; file_name: string; file_type: string }[]> {
  const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0)
  const accepted = files.slice(0, Math.max(0, maxNewFiles))
  const fileRows: { shift_report_id: string; path: string; file_name: string; file_type: string }[] = []

  for (const file of accepted) {
    if (file.size > MAX_FILE_BYTES) continue
    // Require a known-safe type — a missing MIME type must not bypass the allowlist.
    if (!ALLOWED_TYPES.includes(file.type)) continue
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80) || 'upload'
    const path = `${reportId}/${crypto.randomUUID()}-${safeName}`
    const { error: uploadError } = await supabase.storage
      .from(SHIFT_REPORT_BUCKET)
      .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })
    if (uploadError) continue
    fileRows.push({ shift_report_id: reportId, path, file_name: file.name.slice(0, 200), file_type: file.type || '' })
  }

  return fileRows
}
