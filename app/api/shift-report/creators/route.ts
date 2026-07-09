import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

// Admin-only management of the model/creator list shown in the shift-report form.
// POST { name }            → add a model
// PATCH { id, active }     → activate / deactivate a model
// DELETE { id }            → remove a model (past reports keep their name snapshot)

async function requireAdmin() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { ok: false as const, status: 401 }
  const { data: profile } = await authClient.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { ok: false as const, status: 403 }
  return { ok: true as const }
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: gate.status })

  const { name } = await req.json().catch(() => ({ name: '' }))
  const clean = String(name || '').trim()
  if (!clean) return NextResponse.json({ error: 'Name required' }, { status: 400 })

  const supabase = await createAdminClient()
  const { error } = await supabase.from('shift_report_creators').insert({ name: clean })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}

export async function PATCH(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: gate.status })

  const { id, active } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const supabase = await createAdminClient()
  const { error } = await supabase.from('shift_report_creators').update({ active: !!active }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: gate.status })

  const { id } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Past reports snapshot creator_name and the FK is ON DELETE SET NULL, so their
  // history stays intact — they just stop being filterable by this model.
  const supabase = await createAdminClient()
  const { error } = await supabase.from('shift_report_creators').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
