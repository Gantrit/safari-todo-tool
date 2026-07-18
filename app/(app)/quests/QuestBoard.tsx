'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, CheckCircle2, Clock3, Loader2, Pencil, Plus, Send, Tag, ThumbsDown, ThumbsUp, Trash2, Trophy, Users, XCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { deadlineLabel, getInitials } from '@/lib/utils'
import { celebrateQuestAccepted, celebrateQuestApproved, celebrateTaskDone, feedbackReject } from '@/lib/gamification'
import Modal from '@/components/ui/Modal'

type Category = { id: string; name: string }

type Quest = {
  id: string
  title: string
  description: string | null
  department_id: string | null
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

const EMPTY_FORM = { title: '', description: '', bonusXp: '10', deadline: '', multiple: false, categoryId: '' }

const QUEST_STATUS_META: Record<Acceptance['status'], { label: string; color: string }> = {
  ACCEPTED: { label: 'In progress', color: 'var(--muted)' },
  DONE: { label: 'Awaiting review', color: 'var(--amber)' },
  APPROVED: { label: 'Approved', color: 'var(--green)' },
  REJECTED: { label: 'Not approved', color: 'var(--red)' },
}

function toLocalInput(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16)
}

export default function QuestBoard({ quests, acceptances, categories, isAdmin, userId }: { quests: Quest[]; acceptances: Acceptance[]; categories: Category[]; isAdmin: boolean; userId: string }) {
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('all')
  const router = useRouter()
  const supabase = createClient()

  // Deep-link from the board's "Open Quests" section (/quests?quest=<id>):
  // scroll the matching quest into view and briefly flash it. Done imperatively
  // on the DOM node (not via React state) so a background router.refresh() or
  // realtime re-render can't wipe the transient highlight mid-animation.
  useEffect(() => {
    const target = new URLSearchParams(window.location.search).get('quest')
    if (!target) return
    let timer: ReturnType<typeof setTimeout>
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(`quest-${target}`)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('quest-deeplink-flash')
      timer = setTimeout(() => el.classList.remove('quest-deeplink-flash'), 2600)
    })
    return () => { cancelAnimationFrame(raf); clearTimeout(timer) }
  }, [])

  const visibleQuests = useMemo(
    () => (filter === 'all' ? quests : quests.filter((q) => (filter === 'none' ? !q.department_id : q.department_id === filter))),
    [quests, filter]
  )

  function openCreate() {
    setEditingId(null); setForm(EMPTY_FORM); setError(null); setOpen(true)
  }
  function openEdit(quest: Quest) {
    setEditingId(quest.id)
    setForm({
      title: quest.title,
      description: quest.description || '',
      bonusXp: String(quest.bonus_xp),
      deadline: toLocalInput(quest.deadline_at),
      multiple: quest.allow_multiple_accepts,
      categoryId: quest.department_id || '',
    })
    setError(null); setOpen(true)
  }

  async function saveQuest(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true); setError(null)
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      bonus_xp: Math.max(0, Number(form.bonusXp) || 0),
      deadline_at: form.deadline ? new Date(form.deadline).toISOString() : null,
      allow_multiple_accepts: form.multiple,
      department_id: form.categoryId || null,
    }
    const { error: saveError } = editingId
      ? await supabase.from('quests').update(payload).eq('id', editingId)
      : await supabase.from('quests').insert({ ...payload, created_by: userId })
    if (saveError) { setError(saveError.message); setSaving(false); return }
    setOpen(false); setSaving(false); setEditingId(null); setForm(EMPTY_FORM)
    router.refresh()
  }

  async function deleteQuest(quest: Quest) {
    if (!confirm(`Delete "${quest.title}"? It disappears from the board; accepted teammates keep any XP already earned.`)) return
    setBusy(`delete:${quest.id}`); setError(null)
    const { error: delError } = await supabase.from('quests').update({ deleted_at: new Date().toISOString() }).eq('id', quest.id)
    if (delError) setError(delError.message)
    setBusy(null); router.refresh()
  }

  async function run(key: string, action: () => PromiseLike<{ error: { message: string } | null }>, onSuccess?: () => void) {
    setBusy(key); setError(null)
    const { error: rpcError } = await action()
    if (rpcError) setError(rpcError.message)
    else onSuccess?.()
    setBusy(null); router.refresh()
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
        {isAdmin && <button onClick={openCreate} className="btn btn-primary"><Plus size={16} /> Create quest</button>}
      </header>

      {categories.length > 0 && quests.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[.08em]" style={{ color: 'var(--muted)' }}><Tag size={12} /> Category</span>
          <button onClick={() => setFilter('all')} className={`filter-chip ${filter === 'all' ? 'is-active' : ''}`}>All</button>
          {categories.map((c) => (
            <button key={c.id} onClick={() => setFilter(c.id)} className={`filter-chip ${filter === c.id ? 'is-active' : ''}`}>{c.name}</button>
          ))}
          <button onClick={() => setFilter('none')} className={`filter-chip ${filter === 'none' ? 'is-active' : ''}`}>Uncategorized</button>
        </div>
      )}

      {error && !open && <div className="mb-5 rounded-[10px] border px-4 py-3 text-sm" style={{ background: 'var(--red-dim)', borderColor: 'rgba(239,68,68,.3)', color: 'var(--red)' }}>{error}</div>}

      {visibleQuests.length ? (
        <div className="grid gap-6 md:grid-cols-2">
          {visibleQuests.map((quest) => {
            const questAcceptances = acceptances.filter((a) => a.quest_id === quest.id)
            const mine = questAcceptances.find((a) => a.user_id === userId)
            const pendingReview = questAcceptances.filter((a) => a.status === 'DONE')
            const questClosed = ['APPROVED', 'REJECTED'].includes(quest.status)
            const canAccept = !mine && !questClosed && (quest.allow_multiple_accepts || questAcceptances.length === 0)

            return (
              <article
                key={quest.id}
                id={`quest-${quest.id}`}
                className="app-card flex flex-col p-6 sm:p-7"
              >
                <div className="mb-6 flex items-start gap-4">
                  <span className="flex h-12 w-12 flex-none items-center justify-center rounded-[10px]" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}><Trophy size={21} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <h2 className="text-[16px] font-bold">{quest.title}</h2>
                      <span className="meta-pill !text-[9px]">{quest.status}</span>
                      {quest.departments?.name && <span className="meta-pill !text-[9px]" style={{ color: 'var(--accent)' }}><Tag size={9} /> {quest.departments.name}</span>}
                    </div>
                    <p className="text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>{quest.description || 'No description provided.'}</p>
                  </div>
                  {isAdmin && (
                    <div className="flex flex-none gap-1">
                      <button onClick={() => openEdit(quest)} className="icon-button !h-8 !w-8" aria-label={`Edit ${quest.title}`} title="Edit quest"><Pencil size={13} /></button>
                      <button onClick={() => deleteQuest(quest)} disabled={busy === `delete:${quest.id}`} className="icon-button !h-8 !w-8 hover:!text-[var(--red)]" aria-label={`Delete ${quest.title}`} title="Delete quest">
                        {busy === `delete:${quest.id}` ? <Loader2 className="animate-spin" size={13} /> : <Trash2 size={13} />}
                      </button>
                    </div>
                  )}
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

                {/* Who accepted this quest + their status. Non-admins only see
                    their own acceptance (RLS), so this roster is mainly for
                    admins/managers reviewing who's on it. */}
                {questAcceptances.length > 0 && (
                  <div className="mb-5 rounded-[10px] border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface2)' }}>
                    <p className="mb-2.5 text-[10px] font-extrabold uppercase tracking-[.1em]" style={{ color: 'var(--muted)' }}>Accepted by</p>
                    <div className="space-y-2">
                      {questAcceptances.map((a) => {
                        const name = a.profile?.full_name || a.profile?.email || 'Teammate'
                        const meta = QUEST_STATUS_META[a.status]
                        return (
                          <div key={a.id} className="flex items-center gap-2.5">
                            <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full text-[9px] font-extrabold" style={{ background: 'var(--surface3)', color: 'var(--text)' }}>{getInitials(name)}</span>
                            <span className="min-w-0 flex-1 truncate text-xs font-semibold">{name}{a.user_id === userId ? ' · you' : ''}</span>
                            <span className="meta-pill !text-[9px]" style={{ color: meta.color }}>{meta.label}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

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
            <h2 className="font-bold">{quests.length ? 'No quests in this category' : 'No open quests'}</h2>
            <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>{quests.length ? 'Try another category filter.' : isAdmin ? 'Create the first bonus challenge for the team.' : 'New bonus opportunities will appear here.'}</p>
            {isAdmin && !quests.length && <button onClick={openCreate} className="btn btn-secondary mt-5"><Plus size={15} /> Create first quest</button>}
          </div>
        </div>
      )}

      <Modal open={open} onClose={() => !saving && setOpen(false)} title={editingId ? 'Edit quest' : 'Create quest'} size="lg">
        <form onSubmit={saveQuest}>
          <div className="grid gap-5 p-6 sm:grid-cols-2">
            <label className="sm:col-span-2"><span className="form-label">Quest title</span><input autoFocus required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="form-control" placeholder="e.g. Clear the launch QA backlog" /></label>
            <label className="sm:col-span-2"><span className="form-label">Description</span><textarea rows={4} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="form-control py-3" placeholder="Define the outcome and acceptance criteria." /></label>
            <label><span className="form-label">Bonus XP</span><input type="number" min="0" value={form.bonusXp} onChange={(event) => setForm({ ...form, bonusXp: event.target.value })} className="form-control" /></label>
            <label><span className="form-label">Deadline (optional)</span><input type="datetime-local" value={form.deadline} onChange={(event) => setForm({ ...form, deadline: event.target.value })} className="form-control" /></label>
            <label className="sm:col-span-2"><span className="form-label">Category (optional)</span>
              <select value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })} className="form-control">
                <option value="">No category</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <button type="button" role="switch" aria-checked={form.multiple} onClick={() => setForm({ ...form, multiple: !form.multiple })} className="sm:col-span-2 flex items-center justify-between rounded-[10px] border p-4 text-left" style={{ background: 'var(--surface2)', borderColor: form.multiple ? 'var(--border-strong)' : 'var(--border)' }}>
              <span><strong className="block text-sm">Allow multiple acceptances</strong><span className="mt-1 block text-xs" style={{ color: 'var(--muted)' }}>More than one teammate can take this quest.</span></span>
              <span className="relative h-5 w-9 rounded-full" style={{ background: form.multiple ? 'var(--accent)' : 'var(--surface3)' }}><span className="absolute top-0.5 h-4 w-4 rounded-full transition-transform" style={{ background: form.multiple ? 'var(--bg)' : 'var(--muted)', transform: form.multiple ? 'translateX(18px)' : 'translateX(2px)' }} /></span>
            </button>
            {error && <p className="sm:col-span-2 text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
          </div>
          <div className="modal-actions"><button type="button" onClick={() => setOpen(false)} className="btn btn-secondary">Cancel</button><button disabled={saving || !form.title.trim()} className="btn btn-primary">{saving && <Loader2 className="animate-spin" size={15} />}{editingId ? 'Save changes' : 'Create quest'}</button></div>
        </form>
      </Modal>
    </>
  )
}
