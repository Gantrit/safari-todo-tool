'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getLevelInfo, normalizeRole } from '@/lib/types'
import { getInitials } from '@/lib/utils'
import { playSound, xpToast } from '@/lib/gamification'
import { ChevronDown, Crown, Loader2, Medal, Minus, Plus, ScrollText, Shield, Swords } from 'lucide-react'

type Member = {
  id: string
  full_name: string | null
  email: string
  role: string
  xp: number
  level: number
  rank: string | null
  deactivated_at: string | null
}

type XpEntry = { user_id: string; amount: number; reason: string | null; created_at: string }
type Acceptance = { user_id: string; status: 'ACCEPTED' | 'DONE' | 'APPROVED' | 'REJECTED' }
type ApprovedTask = { assignee_ids: string[] | null; assigned_to: string | null; completed_at: string | null; approved_at: string | null }

const ROLE_LABEL: Record<string, string> = { admin: 'Admin', manager: 'Manager', employee: 'Member', guest: 'Viewer' }

const QUICK_AMOUNTS = [5, 10, 20, 50]

export default function GuildRoster({ members, xpLog, acceptances, approvedTasks, currentUserId }: {
  members: Member[]
  xpLog: XpEntry[]
  acceptances: Acceptance[]
  approvedTasks: ApprovedTask[]
  currentUserId: string
}) {
  const router = useRouter()
  const supabase = createClient()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [adjusting, setAdjusting] = useState<string | null>(null)
  const [amount, setAmount] = useState('10')
  const [direction, setDirection] = useState<1 | -1>(1)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const statsByUser = useMemo(() => {
    const map = new Map<string, { weekXp: number; entries: XpEntry[]; questsDone: number; questsActive: number; tasksApproved: number }>()
    const weekStart = new Date()
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7))
    weekStart.setHours(0, 0, 0, 0)
    for (const member of members) {
      map.set(member.id, { weekXp: 0, entries: [], questsDone: 0, questsActive: 0, tasksApproved: 0 })
    }
    for (const entry of xpLog) {
      const stats = map.get(entry.user_id)
      if (!stats) continue
      stats.entries.push(entry)
      if (new Date(entry.created_at) >= weekStart) stats.weekXp += entry.amount
    }
    for (const acceptance of acceptances) {
      const stats = map.get(acceptance.user_id)
      if (!stats) continue
      if (acceptance.status === 'APPROVED') stats.questsDone += 1
      if (acceptance.status === 'ACCEPTED' || acceptance.status === 'DONE') stats.questsActive += 1
    }
    for (const task of approvedTasks) {
      const ids = task.assignee_ids?.length ? task.assignee_ids : task.assigned_to ? [task.assigned_to] : []
      for (const id of ids) {
        const stats = map.get(id)
        if (stats) stats.tasksApproved += 1
      }
    }
    return map
  }, [members, xpLog, acceptances, approvedTasks])

  const guildXp = members.reduce((sum, member) => sum + (member.xp || 0), 0)
  const guildWeekXp = [...statsByUser.values()].reduce((sum, stats) => sum + stats.weekXp, 0)
  const activeMembers = members.filter((member) => !member.deactivated_at)

  function openAdjust(memberId: string, dir: 1 | -1) {
    setAdjusting(memberId)
    setDirection(dir)
    setAmount('10')
    setReason('')
    setError(null)
  }

  async function submitAdjust(member: Member) {
    const value = Math.abs(Math.round(Number(amount))) * direction
    if (!value) { setError('Amount must be a non-zero number.'); return }
    if (reason.trim().length < 3) { setError('Please give a short reason — it lands in the audit log and the member’s notification.'); return }
    setBusy(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('admin_adjust_xp', {
      p_user_id: member.id,
      p_amount: value,
      p_reason: reason.trim(),
    })
    setBusy(false)
    if (rpcError) {
      setError(rpcError.message.includes('admin_adjust_xp') ? 'Migration 012 has not been applied in Supabase yet.' : rpcError.message)
      return
    }
    playSound(value > 0 ? 'xp' : 'reject')
    xpToast(value)
    setAdjusting(null)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-3">
        <article className="app-card p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="metric-label">Guild XP</span>
            <Crown size={15} style={{ color: 'var(--accent)' }} />
          </div>
          <strong className="metric-value mt-3 block" style={{ color: 'var(--accent)' }}>{guildXp.toLocaleString()}</strong>
          <p className="metric-description mt-2">Lifetime XP across all members</p>
        </article>
        <article className="app-card p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="metric-label">This week</span>
            <Swords size={15} style={{ color: 'var(--muted)' }} />
          </div>
          <strong className="metric-value mt-3 block">{guildWeekXp >= 0 ? `+${guildWeekXp}` : guildWeekXp}</strong>
          <p className="metric-description mt-2">XP earned since Monday</p>
        </article>
        <article className="app-card p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="metric-label">Roster</span>
            <Shield size={15} style={{ color: 'var(--muted)' }} />
          </div>
          <strong className="metric-value mt-3 block">{activeMembers.length}</strong>
          <p className="metric-description mt-2">{members.length - activeMembers.length ? `${members.length - activeMembers.length} deactivated` : 'All members active'}</p>
        </article>
      </section>

      {error && !adjusting && (
        <p className="rounded-[10px] border px-4 py-3 text-sm font-semibold" style={{ borderColor: 'rgba(240,85,90,.4)', color: 'var(--red)', background: 'rgba(240,85,90,.07)' }}>{error}</p>
      )}

      <section className="app-card overflow-hidden">
        <div className="card-header">
          <div>
            <h2 className="text-[15px] font-bold">Member roster</h2>
            <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>Sorted by lifetime XP — expand a member to review and adjust their record.</p>
          </div>
        </div>
        {members.map((member) => {
          const info = getLevelInfo(member.xp)
          const stats = statsByUser.get(member.id)!
          const isExpanded = expanded === member.id
          const isAdjusting = adjusting === member.id
          const deactivated = !!member.deactivated_at
          return (
            <div key={member.id} className="border-t" style={{ borderColor: 'var(--border)', opacity: deactivated ? 0.55 : 1 }}>
              <button
                type="button"
                onClick={() => { setExpanded(isExpanded ? null : member.id); setAdjusting(null); setError(null) }}
                className="grid w-full items-center gap-x-4 gap-y-2 px-5 py-4 text-left transition-colors hover:bg-[rgba(255,255,255,0.02)] sm:grid-cols-[minmax(0,1.4fr)_minmax(120px,1fr)_auto_auto]"
              >
                <span className="flex min-w-0 items-center gap-3.5">
                  <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full text-xs font-extrabold" style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--border-strong)' }}>{getInitials(member.full_name || member.email)}</span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[14px] font-bold">{member.full_name || member.email}</span>
                      {member.id === currentUserId && <em className="rounded px-1.5 py-0.5 text-[9px] font-bold not-italic uppercase tracking-wider" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>You</em>}
                      {deactivated && <em className="rounded px-1.5 py-0.5 text-[9px] font-bold not-italic uppercase tracking-wider" style={{ background: 'var(--surface3)', color: 'var(--muted)' }}>Deactivated</em>}
                    </span>
                    <span className="mt-0.5 block truncate text-[11.5px]" style={{ color: 'var(--muted)' }}>{ROLE_LABEL[normalizeRole(member.role)]} · {member.email}</span>
                  </span>
                </span>
                <span className="min-w-0">
                  <span className="flex items-center justify-between gap-2 text-[11px] font-bold">
                    <span style={{ color: 'var(--text-secondary)' }}>Lvl {info.current.level} · {info.current.title}</span>
                    <span style={{ color: 'var(--accent)' }}>{member.xp} XP</span>
                  </span>
                  <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--surface3)' }}>
                    <span className="block h-full rounded-full" style={{ width: `${Math.min(info.progress, 100)}%`, background: 'var(--accent)' }} />
                  </span>
                </span>
                <span className="hidden text-right text-[11.5px] font-bold sm:block" style={{ color: stats.weekXp > 0 ? 'var(--green)' : 'var(--muted)' }}>
                  {stats.weekXp > 0 ? `+${stats.weekXp}` : stats.weekXp} this week
                </span>
                <ChevronDown size={16} className={`justify-self-end transition-transform ${isExpanded ? 'rotate-180' : ''}`} style={{ color: 'var(--muted)' }} />
              </button>

              {isExpanded && (
                <div className="border-t px-5 py-5" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                  <div className="mb-5 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-[10px] border px-4 py-3" style={{ borderColor: 'var(--border)' }}>
                      <p className="metric-label">Tasks approved</p>
                      <p className="mt-1.5 text-lg font-extrabold">{stats.tasksApproved}</p>
                    </div>
                    <div className="rounded-[10px] border px-4 py-3" style={{ borderColor: 'var(--border)' }}>
                      <p className="metric-label">Quests completed</p>
                      <p className="mt-1.5 text-lg font-extrabold">{stats.questsDone}<span className="ml-2 text-xs font-semibold" style={{ color: 'var(--muted)' }}>{stats.questsActive ? `${stats.questsActive} active` : ''}</span></p>
                    </div>
                    <div className="rounded-[10px] border px-4 py-3" style={{ borderColor: 'var(--border)' }}>
                      <p className="metric-label">Next level</p>
                      <p className="mt-1.5 text-lg font-extrabold">{Math.max(0, info.next.min - member.xp)} <span className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>XP to Lvl {info.next.level}</span></p>
                    </div>
                  </div>

                  {!isAdjusting ? (
                    <div className="mb-5 flex flex-wrap items-center gap-2.5">
                      <button type="button" className="btn btn-primary !min-h-9 !px-3.5 text-[12.5px]" onClick={() => openAdjust(member.id, 1)}><Plus size={14} /> Award XP</button>
                      <button type="button" className="btn btn-secondary !min-h-9 !px-3.5 text-[12.5px]" onClick={() => openAdjust(member.id, -1)}><Minus size={14} /> Deduct XP</button>
                    </div>
                  ) : (
                    <div className="mb-5 rounded-[12px] border p-4" style={{ borderColor: 'var(--border-strong)', background: 'var(--surface2)' }}>
                      <p className="mb-3 text-[12px] font-bold uppercase tracking-[.08em]" style={{ color: direction > 0 ? 'var(--accent)' : 'var(--red)' }}>
                        {direction > 0 ? 'Award XP' : 'Deduct XP'} — {member.full_name || member.email}
                      </p>
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        {QUICK_AMOUNTS.map((quick) => (
                          <button key={quick} type="button" onClick={() => setAmount(String(quick))} className="rounded-[8px] border px-3 py-1.5 text-[12px] font-bold transition-colors" style={{ borderColor: amount === String(quick) ? 'var(--accent)' : 'var(--border)', color: amount === String(quick) ? 'var(--accent)' : 'var(--text-secondary)', background: amount === String(quick) ? 'var(--accent-dim)' : 'transparent' }}>
                            {direction > 0 ? '+' : '−'}{quick}
                          </button>
                        ))}
                        <input
                          type="number"
                          min={1}
                          max={1000}
                          value={amount}
                          onChange={(event) => setAmount(event.target.value)}
                          className="form-control !min-h-9 w-24 text-center text-[13px] font-bold"
                          aria-label="Custom XP amount"
                        />
                      </div>
                      <input
                        type="text"
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder={direction > 0 ? 'Reason — e.g. “Covered weekend support”' : 'Reason — e.g. “Correction: double-awarded quest”'}
                        className="form-control mb-3 w-full text-[13px]"
                        maxLength={140}
                      />
                      {error && <p className="mb-3 text-[12px] font-semibold" style={{ color: 'var(--red)' }}>{error}</p>}
                      <div className="flex flex-wrap items-center gap-2.5">
                        <button type="button" disabled={busy} className="btn btn-primary !min-h-9 !px-4 text-[12.5px]" onClick={() => submitAdjust(member)}>
                          {busy ? <Loader2 size={14} className="animate-spin" /> : <Medal size={14} />} Confirm {direction > 0 ? '+' : '−'}{Math.abs(Math.round(Number(amount) || 0))} XP
                        </button>
                        <button type="button" className="btn btn-secondary !min-h-9 !px-4 text-[12.5px]" onClick={() => { setAdjusting(null); setError(null) }}>Cancel</button>
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="mb-2.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.08em]" style={{ color: 'var(--muted)' }}><ScrollText size={13} /> Recent XP history</p>
                    {stats.entries.length ? (
                      <div className="space-y-1.5">
                        {stats.entries.slice(0, 8).map((entry, index) => (
                          <div key={index} className="flex items-center justify-between gap-3 rounded-[8px] px-3 py-2" style={{ background: 'var(--surface2)' }}>
                            <span className="min-w-0 truncate text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{entry.reason || 'XP change'}</span>
                            <span className="flex flex-none items-center gap-3">
                              <span className="text-[11px]" style={{ color: 'var(--muted)' }}>{new Date(entry.created_at).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}</span>
                              <span className="min-w-11 text-right text-[12.5px] font-extrabold" style={{ color: entry.amount >= 0 ? 'var(--green)' : 'var(--red)' }}>{entry.amount >= 0 ? '+' : ''}{entry.amount}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[12.5px]" style={{ color: 'var(--muted)' }}>No XP activity yet.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </section>
    </div>
  )
}
