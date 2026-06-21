'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, Check, Loader2, Plus, Trophy, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { deadlineLabel } from '@/lib/utils'
import Modal from '@/components/ui/Modal'

type Quest = { id: string; title: string; description: string | null; bonus_xp: number; deadline_at: string | null; allow_multiple_accepts: boolean; status: string; departments?: { name: string } | null }

export default function QuestBoard({ quests, isAdmin, userId, acceptedQuestIds }: { quests: Quest[]; isAdmin: boolean; userId: string; acceptedQuestIds: string[] }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', bonusXp: '10', deadline: '', multiple: false })
  const [saving, setSaving] = useState(false)
  const [accepting, setAccepting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  async function createQuest(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError(null)
    const { error: insertError } = await supabase.from('quests').insert({ title: form.title.trim(), description: form.description.trim() || null, bonus_xp: Math.max(0, Number(form.bonusXp) || 0), deadline_at: form.deadline ? new Date(form.deadline).toISOString() : null, allow_multiple_accepts: form.multiple, created_by: userId })
    if (insertError) { setError(insertError.message); setSaving(false); return }
    setOpen(false); setSaving(false); setForm({ title: '', description: '', bonusXp: '10', deadline: '', multiple: false }); router.refresh()
  }

  async function acceptQuest(questId: string) {
    setAccepting(questId)
    const { error: acceptError } = await supabase.from('quest_acceptances').insert({ quest_id: questId, user_id: userId })
    if (acceptError) setError(acceptError.message)
    setAccepting(null); router.refresh()
  }

  return <>
    <header className="page-header"><div><p className="page-eyebrow">Optional bonus work</p><h1 className="page-title">Quests</h1><p className="page-description">Pick up focused team challenges and earn bonus XP after approval.</p></div>{isAdmin && <button onClick={() => { setError(null); setOpen(true) }} className="btn btn-primary"><Plus size={16} /> Create quest</button>}</header>
    {error && !open && <div className="mb-5 rounded-[10px] border px-4 py-3 text-sm" style={{ background: 'var(--red-dim)', borderColor: 'rgba(239,68,68,.3)', color: 'var(--red)' }}>{error}</div>}
    {quests.length ? <div className="grid gap-5 md:grid-cols-2">{quests.map((quest) => { const accepted = acceptedQuestIds.includes(quest.id); return <article key={quest.id} className="app-card flex min-h-[250px] flex-col p-6"><div className="mb-5 flex gap-4"><span className="flex h-11 w-11 flex-none items-center justify-center rounded-[10px]" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}><Trophy size={20} /></span><div><div className="mb-1 flex flex-wrap items-center gap-2"><h2 className="font-bold">{quest.title}</h2><span className="meta-pill !text-[9px]">{quest.status}</span></div><p className="text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>{quest.description || 'No description provided.'}</p></div></div><div className="mb-5 grid grid-cols-2 gap-3"><div className="rounded-[9px] border p-3" style={{ borderColor: 'var(--border)', background: 'var(--surface2)' }}><span className="metric-label">Reward</span><strong className="mt-1 block text-lg" style={{ color: 'var(--accent)' }}>+{quest.bonus_xp} XP</strong></div><div className="rounded-[9px] border p-3" style={{ borderColor: 'var(--border)', background: 'var(--surface2)' }}><span className="metric-label">Deadline</span><span className="mt-1 flex items-center gap-1.5 text-xs font-semibold"><CalendarDays size={12} />{deadlineLabel(quest.deadline_at)}</span></div></div><div className="mt-auto flex items-center justify-between gap-3 border-t pt-4" style={{ borderColor: 'var(--border)' }}><span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--muted)' }}><Users size={13} />{quest.allow_multiple_accepts ? 'Open to multiple people' : 'Single acceptance'}</span>{!isAdmin && <button onClick={() => acceptQuest(quest.id)} disabled={accepted || accepting === quest.id || quest.status !== 'OPEN'} className={`btn ${accepted ? 'btn-secondary' : 'btn-primary'} !min-h-9 !px-3`}>{accepting === quest.id ? <Loader2 className="animate-spin" size={14} /> : accepted ? <Check size={14} /> : null}{accepted ? 'Accepted' : 'Accept quest'}</button>}</div></article> })}</div> : <div className="app-card card-empty min-h-[300px]"><div><Trophy className="mx-auto mb-4" size={28} style={{ color: 'var(--accent)' }} /><h2 className="font-bold">No open quests</h2><p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>{isAdmin ? 'Create the first bonus challenge for the team.' : 'New bonus opportunities will appear here.'}</p>{isAdmin && <button onClick={() => setOpen(true)} className="btn btn-secondary mt-5"><Plus size={15} /> Create first quest</button>}</div></div>}
    <Modal open={open} onClose={() => !saving && setOpen(false)} title="Create quest" size="lg"><form onSubmit={createQuest}><div className="grid gap-5 p-6 sm:grid-cols-2"><label className="sm:col-span-2"><span className="form-label">Quest title</span><input autoFocus required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="form-control" placeholder="e.g. Clear the launch QA backlog" /></label><label className="sm:col-span-2"><span className="form-label">Description</span><textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="form-control py-3" placeholder="Define the outcome and acceptance criteria." /></label><label><span className="form-label">Bonus XP</span><input type="number" min="0" value={form.bonusXp} onChange={(e) => setForm({ ...form, bonusXp: e.target.value })} className="form-control" /></label><label><span className="form-label">Deadline (optional)</span><input type="datetime-local" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} className="form-control" /></label><button type="button" role="switch" aria-checked={form.multiple} onClick={() => setForm({ ...form, multiple: !form.multiple })} className="sm:col-span-2 flex items-center justify-between rounded-[10px] border p-4 text-left" style={{ background: 'var(--surface2)', borderColor: form.multiple ? 'var(--border-strong)' : 'var(--border)' }}><span><strong className="block text-sm">Allow multiple acceptances</strong><span className="mt-1 block text-xs" style={{ color: 'var(--muted)' }}>More than one teammate can take this quest.</span></span><span className="relative h-5 w-9 rounded-full" style={{ background: form.multiple ? 'var(--accent)' : 'var(--surface3)' }}><span className="absolute top-0.5 h-4 w-4 rounded-full transition-transform" style={{ background: form.multiple ? 'var(--bg)' : 'var(--muted)', transform: form.multiple ? 'translateX(18px)' : 'translateX(2px)' }} /></span></button>{error && <p className="sm:col-span-2 text-sm" style={{ color: 'var(--red)' }}>{error}</p>}</div><div className="modal-actions"><button type="button" onClick={() => setOpen(false)} className="btn btn-secondary">Cancel</button><button disabled={saving || !form.title.trim()} className="btn btn-primary">{saving && <Loader2 className="animate-spin" size={15} />}Create quest</button></div></form></Modal>
  </>
}
