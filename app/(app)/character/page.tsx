import { createClient } from '@/lib/supabase/server'
import { getLevelInfo } from '@/lib/types'
import { getInitials } from '@/lib/utils'
import { CheckCircle2, Clock3, Flame, ScrollText, Sparkles, Swords, Trophy } from 'lucide-react'
import Link from 'next/link'

const RANK_LADDER = [
  { title: 'Rookie', from: 1, to: 4 },
  { title: 'Reliable', from: 5, to: 9 },
  { title: 'Executor', from: 10, to: 19 },
  { title: 'High Performer', from: 20, to: 34 },
  { title: 'Elite', from: 35, to: 49 },
  { title: 'Safari Legend', from: 50, to: null },
] as const

const ACCEPTANCE_LABEL: Record<string, { label: string; color: string }> = {
  ACCEPTED: { label: 'In progress', color: 'var(--amber)' },
  DONE: { label: 'Awaiting review', color: 'var(--blue, #38BDF8)' },
  APPROVED: { label: 'Completed', color: 'var(--green)' },
  REJECTED: { label: 'Rejected', color: 'var(--red)' },
}

function berlinDay(date: string | Date) {
  return new Date(date).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })
}

export default async function CharacterPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: profile }, { data: xpLog }, { data: acceptances }, { data: approvedTasks }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user!.id).single(),
    supabase.from('xp_log').select('amount, reason, created_at').eq('user_id', user!.id).order('created_at', { ascending: false }).limit(60),
    supabase.from('quest_acceptances').select('status, accepted_at, submitted_at, reviewed_at, quests(title, bonus_xp, deadline_at)').eq('user_id', user!.id).order('accepted_at', { ascending: false }).limit(20),
    supabase.from('tasks').select('id, completed_at, approved_at, deadline_at, due_date').eq('status', 'APPROVED').is('deleted_at', null).or(`assigned_to.eq.${user!.id},assignee_ids.cs.{${user!.id}}`),
  ])

  const xp = profile?.xp || 0
  const info = getLevelInfo(xp)
  const entries = xpLog || []

  // Streak: consecutive Berlin days ending today/yesterday with positive XP
  const gainDays = new Set(entries.filter((entry) => entry.amount > 0).map((entry) => berlinDay(entry.created_at)))
  let streak = 0
  const cursor = new Date()
  if (!gainDays.has(berlinDay(cursor))) cursor.setDate(cursor.getDate() - 1)
  while (gainDays.has(berlinDay(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }

  const weekStart = new Date()
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7))
  weekStart.setHours(0, 0, 0, 0)
  const weekXp = entries.filter((entry) => new Date(entry.created_at) >= weekStart).reduce((sum, entry) => sum + entry.amount, 0)

  const tasks = approvedTasks || []
  const onTime = tasks.filter((task) => {
    const deadline = task.deadline_at || task.due_date
    if (!deadline || !task.completed_at) return true
    return new Date(task.completed_at) <= new Date(deadline)
  }).length
  const onTimeRate = tasks.length ? Math.round((onTime / tasks.length) * 100) : null

  const quests = (acceptances || []) as unknown as Array<{ status: string; accepted_at: string; quests: { title: string; bonus_xp: number; deadline_at: string | null } | null }>
  const activeQuests = quests.filter((quest) => quest.status === 'ACCEPTED' || quest.status === 'DONE')
  const questsCompleted = quests.filter((quest) => quest.status === 'APPROVED').length

  const currentRankIndex = RANK_LADDER.findIndex((rank) => rank.title === info.current.title)

  return (
    <div className="page-shell !max-w-[1180px]">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Personal progress</p>
          <h1 className="page-title">My character</h1>
          <p className="page-description">Your level, rank, quest log and XP history — everything you&apos;ve earned at Safari Studios.</p>
        </div>
        <Link href="/leaderboard" className="btn btn-secondary self-start xl:self-auto"><Trophy size={16} /> Leaderboard</Link>
      </header>

      <section className="app-card mb-7 p-7 sm:p-8">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-4">
          <span className="flex h-16 w-16 flex-none items-center justify-center rounded-full text-lg font-extrabold" style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--border-strong)' }}>{getInitials(profile?.full_name || profile?.email || '?')}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h2 className="text-[22px] font-extrabold tracking-[-.02em]">{profile?.full_name || profile?.email}</h2>
              <span className="xp-rank-badge">{info.current.title}</span>
            </div>
            <p className="mt-2 text-[13px]" style={{ color: 'var(--muted)' }}>Level {info.current.level} · {xp.toLocaleString()} XP lifetime</p>
          </div>
          {streak > 1 && (
            <div className="flex flex-none items-center gap-2 rounded-[10px] border px-4 py-2.5" style={{ borderColor: 'rgba(240,140,60,.35)', background: 'rgba(240,140,60,.08)' }}>
              <Flame size={17} style={{ color: 'var(--amber)' }} />
              <span className="text-[13px] font-extrabold" style={{ color: 'var(--amber)' }}>{streak}-day streak</span>
            </div>
          )}
        </div>
        <div className="mt-7">
          <div className="mb-2.5 flex items-center justify-between gap-3 text-[12px] font-bold">
            <span style={{ color: 'var(--text-secondary)' }}>Level {info.current.level}</span>
            <span style={{ color: 'var(--accent)' }}>{Math.max(0, info.next.min - xp)} XP to Level {info.next.level}</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full" style={{ background: 'var(--surface3)' }}>
            <div className="xp-bar-live h-full rounded-full" style={{ width: `${Math.min(info.progress, 100)}%` }} />
          </div>
        </div>
      </section>

      <section className="mb-7 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <article className="app-card p-6">
          <div className="flex items-center justify-between gap-3"><span className="metric-label">XP this week</span><Sparkles size={15} style={{ color: 'var(--accent)' }} /></div>
          <strong className="metric-value mt-4 block" style={{ color: weekXp >= 0 ? 'var(--accent)' : 'var(--red)' }}>{weekXp >= 0 ? `+${weekXp}` : weekXp}</strong>
          <p className="metric-description mt-2.5">Since Monday</p>
        </article>
        <article className="app-card p-6">
          <div className="flex items-center justify-between gap-3"><span className="metric-label">Tasks approved</span><CheckCircle2 size={15} style={{ color: 'var(--green)' }} /></div>
          <strong className="metric-value mt-4 block">{tasks.length}</strong>
          <p className="metric-description mt-2.5">Lifetime, all boards</p>
        </article>
        <article className="app-card p-6">
          <div className="flex items-center justify-between gap-3"><span className="metric-label">On-time rate</span><Clock3 size={15} style={{ color: 'var(--muted)' }} /></div>
          <strong className="metric-value mt-4 block">{onTimeRate === null ? '—' : `${onTimeRate}%`}</strong>
          <p className="metric-description mt-2.5">{onTimeRate === null ? 'No approvals yet' : 'Of approved tasks met their deadline'}</p>
        </article>
        <article className="app-card p-6">
          <div className="flex items-center justify-between gap-3"><span className="metric-label">Quests completed</span><Swords size={15} style={{ color: 'var(--muted)' }} /></div>
          <strong className="metric-value mt-4 block">{questsCompleted}</strong>
          <p className="metric-description mt-2.5">{activeQuests.length ? `${activeQuests.length} active right now` : 'Visit Quests to pick one up'}</p>
        </article>
      </section>

      <section className="app-card mb-7 p-7 sm:p-8">
        <h2 className="mb-1.5 text-[15px] font-bold">Rank ladder</h2>
        <p className="mb-6 text-xs" style={{ color: 'var(--muted)' }}>100 XP per level. Keep shipping to climb.</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {RANK_LADDER.map((rank, index) => {
            const reached = index <= currentRankIndex
            const isCurrent = index === currentRankIndex
            return (
              <div key={rank.title} className="flex items-center gap-3 rounded-[10px] border px-4 py-3" style={{ borderColor: isCurrent ? 'var(--accent)' : 'var(--border)', background: isCurrent ? 'var(--accent-dim)' : reached ? 'var(--surface2)' : 'transparent', opacity: reached ? 1 : 0.55 }}>
                <Trophy size={15} style={{ color: reached ? 'var(--accent)' : 'var(--muted)' }} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold" style={{ color: isCurrent ? 'var(--accent)' : undefined }}>{rank.title}</p>
                  <p className="text-[11px]" style={{ color: 'var(--muted)' }}>{rank.to ? `Level ${rank.from}–${rank.to}` : `Level ${rank.from}+`}</p>
                </div>
                {isCurrent && <span className="rounded px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider" style={{ background: 'var(--accent)', color: '#0b0d09' }}>You</span>}
              </div>
            )
          })}
        </div>
      </section>

      <section className="grid items-start gap-6 xl:grid-cols-2">
        <article className="app-card">
          <div className="card-header">
            <div>
              <h2 className="text-[15px] font-bold">Quest log</h2>
              <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>Bonus challenges you&apos;ve picked up</p>
            </div>
            <Link href="/quests" className="text-xs font-bold" style={{ color: 'var(--accent)' }}>All quests →</Link>
          </div>
          {quests.length ? (
            <div className="px-5 py-5">
              <div className="space-y-2.5">
                {quests.slice(0, 8).map((quest, index) => {
                  const meta = ACCEPTANCE_LABEL[quest.status] || ACCEPTANCE_LABEL.ACCEPTED
                  return (
                    <div key={index} className="flex items-center justify-between gap-3 rounded-[10px] border px-4 py-3" style={{ borderColor: 'var(--border)' }}>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-bold">{quest.quests?.title || 'Quest'}</p>
                        <p className="mt-0.5 text-[11px]" style={{ color: 'var(--muted)' }}>+{quest.quests?.bonus_xp ?? 0} XP reward</p>
                      </div>
                      <span className="flex-none rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider" style={{ color: meta.color, border: `1px solid ${meta.color}44`, background: `${meta.color}11` }}>{meta.label}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="px-5 py-8 text-center">
              <p className="text-[13.5px] font-bold">No quests yet</p>
              <p className="mt-1.5 text-[12.5px]" style={{ color: 'var(--muted)' }}>Quests are optional bonus challenges worth extra XP.</p>
              <Link href="/quests" className="btn btn-secondary mx-auto mt-4 !min-h-9 w-fit !px-4 text-[12.5px]">Browse quests</Link>
            </div>
          )}
        </article>

        <article className="app-card">
          <div className="card-header">
            <div>
              <h2 className="text-[15px] font-bold">XP history</h2>
              <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>Every XP change on your record</p>
            </div>
            <ScrollText size={16} style={{ color: 'var(--muted)' }} />
          </div>
          {entries.length ? (
            <div className="px-5 py-5">
              <div className="space-y-1.5">
                {entries.slice(0, 12).map((entry, index) => (
                  <div key={index} className="flex items-center justify-between gap-3 rounded-[8px] px-3 py-2" style={{ background: 'var(--surface2)' }}>
                    <span className="min-w-0 truncate text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{entry.reason || 'XP change'}</span>
                    <span className="flex flex-none items-center gap-3">
                      <span className="text-[11px]" style={{ color: 'var(--muted)' }}>{new Date(entry.created_at).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}</span>
                      <span className="min-w-11 text-right text-[12.5px] font-extrabold" style={{ color: entry.amount >= 0 ? 'var(--green)' : 'var(--red)' }}>{entry.amount >= 0 ? '+' : ''}{entry.amount}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="px-5 py-8 text-center">
              <p className="text-[13.5px] font-bold">Nothing earned yet</p>
              <p className="mt-1.5 text-[12.5px]" style={{ color: 'var(--muted)' }}>Approved tasks and quests will show up here with their XP.</p>
            </div>
          )}
        </article>
      </section>
    </div>
  )
}
