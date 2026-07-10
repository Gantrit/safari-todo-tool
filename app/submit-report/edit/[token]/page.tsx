import { createAdminClient } from '@/lib/supabase/server'
import { EDIT_WINDOW_MS, MAX_EDITS } from '@/lib/shiftReport'
import ShiftReportForm, { type ReportPrefill } from '../../ShiftReportForm'

export const metadata = {
  title: 'Edit Shift Report · Safari To-Dos',
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Public page (no login) — reached via the secret edit link shown after
// submission. Covered by the middleware's `/submit-report` public-route prefix.
// The 2-edits / 8-hour policy is re-enforced server-side in /api/shift-report/edit;
// this page only decides what to render.
export default async function EditReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  let report = null
  if (UUID_RE.test(token)) {
    const supabase = await createAdminClient()
    const { data } = await supabase
      .from('shift_reports')
      .select('*, files:shift_report_files(id, file_name, file_type)')
      .eq('edit_token', token)
      .maybeSingle()
    report = data
  }

  const editsUsed = report?.edit_count ?? 0
  const windowOpen = report ? Date.now() - new Date(report.created_at).getTime() <= EDIT_WINDOW_MS : false
  const canEdit = !!report && editsUsed < MAX_EDITS && windowOpen

  let creators: { id: string; name: string }[] = []
  if (canEdit) {
    const supabase = await createAdminClient()
    const { data } = await supabase
      .from('shift_report_creators')
      .select('id, name')
      .eq('active', true)
      .order('name', { ascending: true })
    creators = data || []
  }

  return (
    <div className="h-dvh overflow-y-auto px-4 py-10" style={{ background: 'radial-gradient(90% 60% at 50% 0%, rgba(200,169,106,0.06), transparent 60%), var(--bg)' }}>
      <div className="mx-auto w-full max-w-[640px]">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-[13px] text-lg font-extrabold" style={{ background: 'var(--accent)', color: '#0b0d09' }}>S</span>
          <h1 className="text-[26px] font-extrabold tracking-[-.03em]" style={{ color: 'var(--text)' }}>Edit your shift report</h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
            Corrections are possible up to {MAX_EDITS} times within 8 hours of submission.
          </p>
        </div>

        {canEdit ? (
          <ShiftReportForm
            creators={creators}
            mode="edit"
            editToken={token}
            editsLeft={MAX_EDITS - editsUsed}
            prefill={report as ReportPrefill}
            existingFiles={report.files || []}
          />
        ) : (
          <div className="app-card p-8 text-center">
            <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>
              {!report
                ? 'This edit link is invalid'
                : editsUsed >= MAX_EDITS
                  ? 'Edit limit reached'
                  : 'The edit window has expired'}
            </h2>
            <p className="mt-2 text-sm leading-6" style={{ color: 'var(--muted)' }}>
              {!report
                ? 'The link may be incomplete or the report was deleted. Please check the link or submit a new report.'
                : editsUsed >= MAX_EDITS
                  ? 'This report was already edited twice. If something is still wrong, please contact your manager.'
                  : 'Reports can only be edited within 8 hours of submission. If something is wrong, please contact your manager.'}
            </p>
            <a href="/submit-report" className="btn btn-secondary mt-5 min-h-11">Go to the submission form</a>
          </div>
        )}

        <p className="mt-6 text-center text-[11px]" style={{ color: 'var(--muted)' }}>
          Safari To-Dos · shift reporting
        </p>
      </div>
    </div>
  )
}
