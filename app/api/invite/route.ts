import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const { email, workspaceId } = await req.json()
    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })

    const supabase = await createAdminClient()

    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    if (data.user && workspaceId) {
      await supabase.from('workspace_members').upsert({
        workspace_id: workspaceId,
        user_id: data.user.id,
        role: 'user',
      })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
