'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, CheckCircle2, Clock3, Loader2, Plus, Send, ThumbsDown, ThumbsUp, Trophy, Users, XCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { deadlineLabel, getInitials } from '@/lib/utils'
import { celebrateQuestAccepted, celebrateQuestApproved, celebrateTaskDone, feedbackReject } from '@/lib/gamification'
import Modal from '@/components/ui/Modal'

type Quest = {
  id: string
  title: string
  description: string | null
  bonus_xp: number
  deadline_at: string | null
  allow_multiple_accepts: boolean
  status: string
  departments?: { name: string } | null
}

type Acceptance = {
  id: string
  quest_id: string
  user_id: string
  status: 'ACCEPTED' | 'DONE' | 'APPROVED' | 'REJECTED'
  profile?: { id: string; full_name: string | null; email: string } | null
}

export default function QuestBoard({ quests, acceptances, isAdmin, userId }: { quests: Quest[]; acceptances: Acceptance[]; isAdmin: boolean; userId: string }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', bonusXp: '10', deadline: '', multiple: false })
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  async function createQuest(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    const { error: insertError } = await supabase.from('quests').insert({
      title: form.title.trim(),
      description: form.description.trim() || null,
      bonus_xp: Math.max(0, Number(form.bonusXp) || 0),
      deadline_at: form.deadline ? new Date(form.deadline).toISOString() : null,
      allow_multiple_accepts: form.multiple,
      created_by: userId,
    })
    if (insertError) {
      setError(insertError.message)
      setSaving(false)
      return
    }
    setOpen(false)
    setSaving(false)
    setForm({ title: '', description: '', bonusXp: '10', deadline: '', multiple: false })
    router.refresh()
  }

  async function run(key: string, action: () => PromiseLike<{ error: { message: string } | null }>, onSuccess?: () => void) {
    setBusy(key)
    setError(null)
    const { error: rpcError } = await action()
    if (rpcError) setError(rpcError.message)
    else onSuccess?.()
    setBusy(null)
    router.refresh()
  }

  const acceptQuest = (quest: Quest) =>
    run(`accept:${quest.id}`, () => supabase.rpc('accept_quest', { p_quest_id: quest.id }), celebrateQuestAccepted)

  const submitQuest = (quest: Quest) =>
    run(`submit:${quest.id}`, () => supabase.rpc('submit_quest', { p_quest_id: quest.id }), celebrateTaskDone)

  const reviewQuest = (quest: Quest, acceptance: Acceptance, approve: boolean) =>
    run(
      `review:${acceptance.id}:${approve}`,
      () => supabase.rpc('review_quest', { p_quest_id: quest.id, p_user_id: acceptance.user_id, p_approve: approve }),
      () => (approve ? celebrateQuestApproved(quest.bonus_xp) : feedbackReject())
    )

  return (
    <>
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Optional bonus work</p>
          <h1 className="page-title">Quests</h1>
          <p className="page-description">Pick up focused team challenges and earn bonus XP after approval.</p>
        </div>
        {isAdmin && <button onClick={() => { setError(null); setOpen(true) }} className="btn btn-primary"><Plus size={16} /> Create quest</button>}
      </header>

      {error && !open && <div className="mb-5 rounded-[10px] border px-4 py-3 text-sm" style={{ background: 'var(--red-dim)', borderColor: 'rgba(239,68,68,.3)', color: 'var(--red)' }}>{error}</div>}

      {quests.length ? (
        <div className="grid gap-6 md:grid-cols-2">
          {quests.map((quest) => {
            const questAcceptances = acceptances.filter((a) => a.quest_id === quest.id)
            const mine = questAcceptances.find((a) => a.user_id === userId)
            const pendingReview = questAcceptances.filter((a) => a.status === 'DONE')
            const questClosed = ['APPROVED', 'REJECTED'].includes(quest.status)
            const canAccept = !mine && !questClosed && (quest.allow_multiple_accepts || questAcceptances.length === 0)

            return (
              <article key={quest.id} className="app-card flex flex-col p-6 sm:p-7">
                <div className="mb-6 flex items-start gap-4">
                  <span className="flex h-12 w-12 flex-none items-center justify-center rounded-[10px]" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}><Trophy size={21} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <h2 className="text-[16px] font-bold">{quest.title}</h2>
                      <span className="meta-pill !text-[9px]">{quest.status}</span>
                    </div>
                    <p className="text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>{quest.description || 'No description provided.'}</p>
                  </div>
                </div>

                <div className="mb-6 grid grid-cols-2 gap-4">
                  <div className="rounded-[10px] border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface2)' }}>
                    <span className="metric-label">Reward</span>
                    <strong className="mt-2 block text-lg" style={{ color: 'var(--accent)' }}>+{quest.bonus_xp} XP</strong>
                  </div>
                  <div className="rounded-[10px] border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface2)' }}>
                    <span className="metric-label">Deadline</span>
                    <span className="mt-2 flex items-center gap-1.5 text-xs font-semibold"><CalendarDays size={12} />{deadlineLabel(quest.deadline_at)}</span>
                  </div>
                </div>

                {/* Admin review queue */}
                {isAdmin && pendingReview.length > 0 && (
                  <div className="mb-5 space-y-2.5 rounded-[10px] border p-4" style={{ borderColor: 'rgba(200,169,106,.35)', background: 'var(--accent-dim)' }}>
                    <p className="text-[10px] font-extrabold uppercase tracking-[.1em]" style={{ color: 'var(--accent)' }}>Awaiting review</p>
                    {pendingReview.map((acceptance) => {
                      const name = acceptance.profile?.full_name || acceptance.profile?.email || 'Teammate'
                      return (
                        <div key={acceptance.id} className="flex items-center gap-3">
                          <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-[9px] font-extrabold" style={{ background: 'var(--surface3)', color: 'var(--text)' }}>{getInitials(name)}</span>
                          <span className="min-w-0 flex-1 truncate text-xs font-semibold">{name}</span>
                          <button onClick={() => reviewQuest(quest, acceptance, true)} disabled={busy !== null} className="btn !min-h-8 !px-3 text-xs" style={{ background: 'var(--green)', color: '#071007', border: 'none' }}>
                            {busy === `review:${acceptance.id}:true` ? <Loader2 className="animate-spin" size={12} /> : <ThumbsUp size={12} />} Approve
                          </button>
                          <button onClick={() => reviewQuest(quest, acceptance, false)} disabled={busy !== null} className="btn btn-secondary !min-h-8 !px-3 text-xs hover:!text-[var(--red)]">
                            {busy === `review:${acceptance.id}:false` ? <Loader2 className="animate-spin" size={12} /> : <ThumbsDown size={12} />}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}

                <div className="mt-auto flex flex-wrap items-center justify-between gap-4 border-t pt-5" style={{ borderColor: 'var(--border)' }}>
                  <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--muted)' }}>
                    <Users size={13} />
                    {quest.allow_multiple_accepts ? 'Open to multiple people' : 'Single acceptance'}
                    {questAcceptances.length > 0 && ` · ${questAcceptances.length} accepted`}
                  </span>

                  {/* Employee lifecycle actions */}
                  {!mine && canAccept && (
                    <button onClick={() => acceptQuest(quest)} disabled={busy !== null} className="btn btn-primary min-h-11 min-w-[138px]">
                      {busy === `accept:${quest.id}` ? <Loader2 className="animate-spin" size={15} /> : <Trophy size={15} />} Accept Quest
                    </button>
                  )}
                  {!mine && !canAccept && !questClosed && !isAdmin && (
                    <span className="meta-pill"><Clock3 size={12} /> Already taken</span>
                  )}
                  {mine?.status === 'ACCEPTED' && (
                    <button onClick={() => submitQuest(quest)} disabled={busy !== null} className="btn btn-primary min-h-11 min-w-[150px]">
                      {busy === `submit:${quest.id}` ? <Loader2 className="animate-spin" size={15} /> : <Send size={14} />} Mark as done
                    </button>
                  )}
                  {mine?.status === 'DONE' && (
                    <span className="meta-pill" style={{ color: 'var(--amber)' }}><Clock3 size={12} /> Waiting for review</span>
                  )}
                  {mine?.status === 'APPROVED' && (
                    <span className="meta-pill" style={{ color: 'var(--green)' }}><CheckCircle2 size={13} /> +{quest.bonus_xp} XP earned</span>
                  )}
                  {mine?.status === 'REJECTED' && (
                    <span className="meta-pill" style={{ color: 'var(--red)' }}><XCircle size={13} /> Not approved</span>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <div className="app-card card-empty min-h-[300px]">
          <div>
            <Trophy className="mx-auto mb-4" size={28} style={{ color: 'var(--accent)' }} />
            <h2 className="font-bold">No open quests</h2>
            <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>{isAdmin ? 'Create the first bonus challenge for the team.' : 'New bonus opportunities will appear here.'}</p>
            {isAdmin && <button onClick={() => setOpen(true)} className="btn btn-secondary mt-5"><Plus size={15} /> Create first quest</button>}
          </div>
        </div>
      )}

      <Modal open={open} onClose={() => !saving && setOpen(false)} title="Create quest" size="lg">
        <form onSubmit={createQuest}>
          <div className="grid gap-5 p-6 sm:grid-cols-2">
            <label className="sm:col-span-2"><span className="form-label">Quest title</span><input autoFocus required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="form-control" placeholder="e.g. Clear the launch QA backlog" /></label>
            <label className="sm:col-span-2"><span className="form-label">Description</span><textarea rows={4} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="form-control py-3" placeholder="Define the outcome and acceptance criteria." /></label>
            <label><span className="form-label">Bonus XP</span><input type="number" min="0" value={form.bonusXp} onChange={(event) => setForm({ ...form, bonusXp: event.target.value })} className="form-control" /></label>
            <label><span className="form-label">Deadline (optional)</span><input type="datetime-local" value={form.deadline} onChange={(event) => setForm({ ...form, deadline: event.target.value })} className="form-control" /></label>
            <button type="button" role="switch" aria-checked={form.multiple} onClick={() => setForm({ ...form, multiple: !form.multiple })} className="sm:col-span-2 flex items-center justify-between rounded-[10px] border p-4 text-left" style={{ background: 'var(--surface2)', borderColor: form.multiple ? 'var(--border-strong)' : 'var(--border)' }}>
              <span><strong className="block text-sm">Allow multiple acceptances</strong><span className="mt-1 block text-xs" style={{ color: 'var(--muted)' }}>More than one teammate can take this quest.</span></span>
              <span className="relative h-5 w-9 rounded-full" style={{ background: form.multiple ? 'var(--accent)' : 'var(--surface3)' }}><span className="absolute top-0.5 h-4 w-4 rounded-full transition-transform" style={{ background: form.multiple ? 'var(--bg)' : 'var(--muted)', transform: form.multiple ? 'translateX(18px)' : 'translateX(2px)' }} /></span>
            </button>
            {error && <p className="sm:col-span-2 text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
          </div>
          <div className="modal-actions"><button type="button" onClick={() => setOpen(false)} className="btn btn-secondary">Cancel</button><button disabled={saving || !form.title.trim()} className="btn btn-primary">{saving && <Loader2 className="animate-spin" size={15} />}Create quest</button></div>
        </form>
      </Modal>
    </>
  )
}
