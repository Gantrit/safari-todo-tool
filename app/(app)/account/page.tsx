import { createClient } from '@/lib/supabase/server'
import { UserCog } from 'lucide-react'
import AccountForm from './AccountForm'

export default async function AccountPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
  const { data: preferences } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('user_id', user!.id)
    .maybeSingle()

  return (
    <div className="page-shell !max-w-[720px]">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Personal</p>
          <h1 className="page-title">Account settings</h1>
          <p className="page-description">Your display name and how you get notified — visible to you only.</p>
        </div>
        <span className="meta-pill !min-h-10 px-4"><UserCog size={13} /> Account</span>
      </header>
      <section className="app-card p-5 sm:p-6">
        <AccountForm profile={profile!} preferences={preferences} currentEmail={user!.email || profile?.email || ''} />
      </section>
    </div>
  )
}
