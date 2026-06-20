import { createClient } from '@/lib/supabase/server'
import { normalizeRole } from '@/lib/types'
import { deadlineLabel } from '@/lib/utils'
import { Trophy } from 'lucide-react'

export default async function QuestsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
  const role = normalizeRole(profile?.role)

  const { data: quests } = await supabase
    .from('quests')
    .select('*, departments(name)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  return (
    <div className="page-shell">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Optional bonus work</p>
          <h1 className="page-title">Quests</h1>
          <p className="page-description">Accept extra work, earn bonus XP and submit it through the same approval workflow.</p>
        </div>
        {role === 'admin' && (
          <div className="meta-pill max-w-sm !min-h-10 px-4">
            Admins manage quest availability and rewards.
          </div>
        )}
      </header>

      {(quests || []).length > 0 ? (
        <div className="grid gap-5 md:grid-cols-2">
          {(quests || []).map((quest: any) => (
            <article key={quest.id} className="app-card p-6">
              <div className="mb-4 flex items-start gap-3">
                <div className="rounded-[8px] p-2" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                  <Trophy size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-bold" style={{ color: 'var(--text)' }}>{quest.title}</h2>
                  <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>{quest.description || 'No description yet.'}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded px-2 py-1" style={{ color: 'var(--accent)', border: '1px solid var(--border-strong)' }}>{quest.bonus_xp || 0} bonus XP</span>
                <span className="rounded px-2 py-1" style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}>{quest.departments?.name || 'Any department'}</span>
                <span className="rounded px-2 py-1" style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}>{deadlineLabel(quest.deadline_at)}</span>
                <span className="rounded px-2 py-1" style={{ color: quest.allow_multiple_accepts ? 'var(--green)' : 'var(--amber)', border: '1px solid var(--border)' }}>{quest.allow_multiple_accepts ? 'Multiple accepts' : 'Single accept'}</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="app-card p-12 text-center">
          <h2 className="font-bold mb-2" style={{ color: 'var(--text)' }}>No quests yet</h2>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>New bonus opportunities will appear here when they are available.</p>
        </div>
      )}
    </div>
  )
}
