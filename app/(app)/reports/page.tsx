import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { canManageTeam, ShiftReport } from '@/lib/types'
import ReportsView from './ReportsView'

const BUCKET = 'shift-report-files'

export const metadata = { title: 'Shift Reports · Safari To-Dos' }

export default async function ReportsPage() {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  const { data: profile } = await auth.from('profiles').select('role').eq('id', user!.id).single()
  if (!canManageTeam(profile?.role)) redirect('/dashboard')

  // Service role: read every report + its files, and mint signed URLs for display.
  const supabase = await createAdminClient()
  const [{ data: reports }, { data: creators }] = await Promise.all([
    supabase
      .from('shift_reports')
      .select('*, creator:shift_report_creators(id, name, active, created_at), files:shift_report_files(*)')
      .order('shift_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500),
    supabase.from('shift_report_creators').select('*').order('name', { ascending: true }),
  ])

  const withSigned: ShiftReport[] = await Promise.all(
    (reports || []).map(async (r: ShiftReport & { edit_token?: string }) => {
      const files = await Promise.all(
        (r.files || []).map(async (f) => {
          const { data } = await supabase.storage.from(BUCKET).createSignedUrl(f.path, 60 * 60)
          return { ...f, signed_url: data?.signedUrl ?? null }
        })
      )
      // Never ship the edit token to the browser — it is the submitter's
      // credential for the public edit link, not something reviewers need.
      const { edit_token: _omit, ...rest } = r
      void _omit
      return { ...rest, files }
    })
  )

  return (
    <div className="h-full overflow-auto">
      <ReportsView reports={withSigned} creators={creators || []} isAdmin={profile?.role === 'admin'} />
    </div>
  )
}
