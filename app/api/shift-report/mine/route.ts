import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

// Public endpoint — a chatter looks up their OWN past shift reports from the
// submit page (no login). Identity is self-asserted: a member id chosen from the
// picker, or, for external chatters, their exact name. This is the same trust
// model as the public submit form (small internal team). The secret edit_token
// is NEVER included — the only actionable link stays private to the submitter.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Everything the "My reports" list + resubmit prefill needs — explicitly WITHOUT
// edit_token, reviewed_by or file storage paths.
const SELECT_COLUMNS =
  'id, creator_id, creator_name, chatter_id, chatter_name, shift_date, shift_label, time_range, ' +
  'gross_amount, net_amount, currency, new_subs, renew_subs, mass_message_replies, chat_engagements, ' +
  'mass_message_note, went_well, went_wrong, sub_behavior, review_status, edit_count, last_edited_at, ' +
  'created_at, creator:shift_report_creators(id, name), files:shift_report_files(id, file_name, file_type)'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const chatterId =
      typeof body?.chatter_id === 'string' && UUID_RE.test(body.chatter_id) ? body.chatter_id : null
    const chatterName =
      typeof body?.chatter_name === 'string' ? body.chatter_name.trim().slice(0, 120) : ''

    if (!chatterId && !chatterName) {
      return NextResponse.json({ error: 'Please choose your name first.' }, { status: 400 })
    }

    const supabase = await createAdminClient()
    let query = supabase
      .from('shift_reports')
      .select(SELECT_COLUMNS)
      .order('shift_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100)

    // Members are matched by their stable id; external chatters (no account) by
    // their exact name, scoped to rows with no member link so a member's reports
    // never leak through a name collision.
    query = chatterId
      ? query.eq('chatter_id', chatterId)
      : query.is('chatter_id', null).eq('chatter_name', chatterName)

    const { data, error } = await query
    if (error) {
      console.error('[shift-report/mine] query failed:', error.code, error.message)
      return NextResponse.json({ error: 'Could not load your reports. Please try again.' }, { status: 500 })
    }

    return NextResponse.json({ reports: data ?? [] })
  } catch {
    return NextResponse.json({ error: 'Server error. Please try again.' }, { status: 500 })
  }
}
