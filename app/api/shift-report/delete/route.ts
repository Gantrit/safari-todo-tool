import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { SHIFT_REPORT_BUCKET } from '@/lib/shiftReport'

// Admin-only: permanently delete a shift report incl. its stored screenshots.
// Auth is checked against the caller's session; the actual delete runs with the
// service role because the storage bucket has no client policies by design.

export async function POST(req: NextRequest) {
  try {
    const auth = await createClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

    const { data: profile } = await auth.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can delete shift reports.' }, { status: 403 })
    }

    const body = await req.json().catch(() => null)
    const id = typeof body?.id === 'string' ? body.id : null
    if (!id) return NextResponse.json({ error: 'Missing report id.' }, { status: 400 })

    const supabase = await createAdminClient()
    const { data: files } = await supabase.from('shift_report_files').select('path').eq('shift_report_id', id)
    if (files && files.length > 0) {
      await supabase.storage.from(SHIFT_REPORT_BUCKET).remove(files.map((f) => f.path))
    }

    // FK on shift_report_files is ON DELETE CASCADE — deleting the report clears the rows.
    const { error } = await supabase.from('shift_reports').delete().eq('id', id)
    if (error) return NextResponse.json({ error: 'Could not delete the report.' }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Server error. Please try again.' }, { status: 500 })
  }
}
