import { createAdminClient } from '@/lib/supabase/server'
import ShiftReportForm from './ShiftReportForm'

export const metadata = {
  title: 'Submit Shift Report · Safari To-Dos',
}

// Always render at request time: this page lists the current models and members
// from the DB. Since createAdminClient no longer reads cookies, the page has no
// implicit dynamic dependency and would otherwise be prerendered once at build
// time, freezing that list until the next deploy.
export const dynamic = 'force-dynamic'

// Public page (no login) — see middleware `isPublicRoute`. Internal and external
// chatters submit their end-of-shift report here. Creators are read with the
// service role so the table never needs anonymous access.
export default async function SubmitReportPage() {
  const supabase = await createAdminClient()
  const { data: creators } = await supabase
    .from('shift_report_creators')
    .select('id, name')
    .eq('active', true)
    .order('name', { ascending: true })

  // Active members feed the chatter picker so internal chatters are matched by a
  // stable id (no "Lloyd" vs "Loyd" filter splits). Read with the service role —
  // the page is public and has no session.
  const { data: members } = await supabase
    .from('profiles')
    .select('id, full_name')
    .is('deactivated_at', null)
    .order('full_name', { ascending: true })

  return (
    // h-dvh + overflow-y-auto: the global stylesheet locks the <body> with
    // overflow:hidden (the app shell scrolls its own panes), so this public page
    // must bring its own scroll container or everything below the fold —
    // including the submit button — is unreachable.
    <div className="h-dvh overflow-y-auto px-4 py-10" style={{ background: 'radial-gradient(90% 60% at 50% 0%, rgba(200,169,106,0.06), transparent 60%), var(--bg)' }}>
      <div className="mx-auto w-full max-w-[640px]">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-[13px] text-lg font-extrabold" style={{ background: 'var(--accent)', color: '#0b0d09' }}>S</span>
          <h1 className="text-[26px] font-extrabold tracking-[-.03em]" style={{ color: 'var(--text)' }}>Submit your shift report</h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
            Fill this in at the end of your shift and attach your sales screenshots.
          </p>
        </div>

        <ShiftReportForm
          creators={creators || []}
          members={(members || []).filter((m) => (m.full_name || '').trim()).map((m) => ({ id: m.id, name: m.full_name as string }))}
        />

        <p className="mt-6 text-center text-[11px]" style={{ color: 'var(--muted)' }}>
          Safari To-Dos · shift reporting
        </p>
      </div>
    </div>
  )
}
