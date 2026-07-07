import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

// Called by the Postgres AFTER INSERT trigger on `notifications` (migration 021)
// via pg_net. Verifies a shared secret, respects the user's email_enabled
// preference, and sends the email through the Resend HTTP API. No SDK needed.

const SUBJECTS: Record<string, string> = {
  assignment: 'You have a new task',
  mention: 'You were mentioned',
  reminder: 'Task reminder',
  result_submitted: 'A result is awaiting your review',
  approved: 'Your task was approved',
  overdue: 'A task is overdue',
  comment: 'New comment on a task',
  rejected: 'A task needs changes',
  need_clarification: 'A task needs clarification',
  notice_sla_missed: 'A task went unnoticed',
}

function renderHtml(name: string | null, message: string, link: string) {
  const greeting = name ? `Hi ${name.split(' ')[0]},` : 'Hi,'
  return `<!doctype html><html><body style="margin:0;background:#0e0e0f;padding:32px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#161617;border:1px solid #262629;border-radius:14px;overflow:hidden">
      <tr><td style="padding:28px 32px 8px;color:#c8a96a;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Safari To-Dos</td></tr>
      <tr><td style="padding:0 32px;color:#f3f3f3;font-size:15px;line-height:1.5">${greeting}</td></tr>
      <tr><td style="padding:12px 32px 4px;color:#f3f3f3;font-size:16px;font-weight:600;line-height:1.45">${escapeHtml(message)}</td></tr>
      <tr><td style="padding:24px 32px 32px">
        <a href="${link}" style="display:inline-block;background:#c8a96a;color:#1a1206;text-decoration:none;font-size:14px;font-weight:700;padding:11px 22px;border-radius:9px">Open Safari To-Dos</a>
      </td></tr>
      <tr><td style="padding:0 32px 28px;color:#7a7a80;font-size:11px;line-height:1.5">You get this because email notifications are on. Turn them off any time under Account settings.</td></tr>
    </table>
  </td></tr></table>
</body></html>`
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-webhook-secret')
  if (!process.env.EMAIL_WEBHOOK_SECRET || secret !== process.env.EMAIL_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return NextResponse.json({ skipped: 'RESEND_API_KEY not set' })

  let notificationId: string | undefined
  try {
    notificationId = (await req.json())?.notification_id
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }
  if (!notificationId) return NextResponse.json({ error: 'notification_id required' }, { status: 400 })

  const supabase = await createAdminClient()

  const { data: notification } = await supabase
    .from('notifications')
    .select('id, user_id, type, message, task_id')
    .eq('id', notificationId)
    .single()
  if (!notification) return NextResponse.json({ error: 'Notification not found' }, { status: 404 })

  const { data: prefs } = await supabase
    .from('notification_preferences')
    .select('email_enabled')
    .eq('user_id', notification.user_id)
    .maybeSingle()
  if (prefs && prefs.email_enabled === false) return NextResponse.json({ skipped: 'email disabled' })

  const { data: profile } = await supabase
    .from('profiles')
    .select('email, full_name')
    .eq('id', notification.user_id)
    .single()
  if (!profile?.email) return NextResponse.json({ skipped: 'no email on profile' })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
  const link = `${appUrl}${notification.task_id ? '/dashboard' : '/notifications'}`
  const from = process.env.EMAIL_FROM || 'Safari To-Dos <onboarding@resend.dev>'

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: profile.email,
      subject: SUBJECTS[notification.type] || 'Safari To-Dos update',
      html: renderHtml(profile.full_name, notification.message, link),
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    return NextResponse.json({ error: 'Resend rejected the request', detail }, { status: 502 })
  }
  return NextResponse.json({ sent: true })
}
