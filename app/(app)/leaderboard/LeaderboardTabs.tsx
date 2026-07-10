'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getLevelInfo } from '@/lib/types'
import Avatar from '@/components/ui/Avatar'
import { CalendarDays, CalendarRange, Loader2, Trophy } from 'lucide-react'

type ProfileRow = { id: string; full_name: string | null; email: string; xp: number; avatar_url?: string | null }
type Range = 'all' | 'week' | 'month'

const TABS: Array<{ key: Range; label: string; icon: React.ReactNode }> = [
  { key: 'all', label: 'All-time', icon: <Trophy size={14} /> },
  { key: 'week', label: 'This week', icon: <CalendarDays size={14} /> },
  { key: 'month', label: 'This month', icon: <CalendarRange size={14} /> },
]

function rangeStart(range: Range): string {
  const now = new Date()
  if (range === 'week') {
    const start = new Date(now)
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
    start.setHours(0, 0, 0, 0)
    return start.toISOString()
  }
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
}

export default function LeaderboardTabs({ profiles, currentUserId }: { profiles: ProfileRow[]; currentUserId: string }) {
  const supabase = createClient()
  const [range, setRange] = useState<Range>('all')
  const [rangeTotals, setRangeTotals] = useState<Record<string, Map<string, number>>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const profileById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles])

  useEffect(() => {
    if (range === 'all' || rangeTotals[range]) return
    let cancelled = false
    setLoading(true)
    setError(null)
    supabase.rpc('xp_leaderboard', { p_since: rangeStart(range) }).then(({ data, error: rpcError }) => {
      if (cancelled) return
      setLoading(false)
      if (rpcError) {
        setError(rpcError.message.includes('xp_leaderboard') ? 'Weekly and monthly standings need migration 012 in Supabase.' : rpcError.message)
        return
      }
      const totals = new Map<string, number>((data || []).map((row: { user_id: string; total: number }) => [row.user_id, Number(row.total)]))
      setRangeTotals((previous) => ({ ...previous, [range]: totals }))
    })
    return () => { cancelled = true }
  }, [range, rangeTotals, supabase])

  const rows = useMemo(() => {
    if (range === 'all') {
      return profiles.map((profile) => ({ profile, score: profile.xp }))
    }
    const totals = rangeTotals[range]
    if (!totals) return []
    return [...totals.entries()]
      .map(([userId, score]) => ({ profile: profileById.get(userId), score }))
      .filter((row): row is { profile: ProfileRow; score: number } => !!row.profile)
      .sort((a, b) => b.score - a.score)
  }, [range, profiles, rangeTotals, profileById])

  const podium = rows.slice(0, 3)
  const rest = rows.slice(3)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setRange(tab.key)}
            className="flex items-center gap-2 rounded-[9px] border px-3.5 py-2 text-[12.5px] font-bold transition-colors"
            style={{
              borderColor: range === tab.key ? 'var(--accent)' : 'var(--border)',
              color: range === tab.key ? 'var(--accent)' : 'var(--text-secondary)',
              background: range === tab.key ? 'var(--accent-dim)' : 'transparent',
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="rounded-[10px] border px-4 py-3 text-sm font-semibold" style={{ borderColor: 'rgba(240,85,90,.4)', color: 'var(--red)', background: 'rgba(240,85,90,.07)' }}>{error}</p>
      )}

      {loading ? (
        <div className="app-card flex items-center justify-center gap-3 p-10 text-sm font-semibold" style={{ color: 'var(--muted)' }}>
          <Loader2 size={17} className="animate-spin" /> Crunching the numbers…
        </div>
      ) : rows.length === 0 ? (
        <div className="app-card p-10 text-center">
          <Trophy size={26} className="mx-auto mb-3" style={{ color: 'var(--muted)' }} />
          <p className="text-[14px] font-bold">No XP {range === 'all' ? 'yet' : 'in this period yet'}</p>
          <p className="mt-1.5 text-[12.5px]" style={{ color: 'var(--muted)' }}>Approved tasks and quests will move people up the board.</p>
        </div>
      ) : (
        <>
          {podium.length > 0 && (
            <section className="grid gap-4 sm:grid-cols-3">
              {podium.map((row, index) => {
                const info = getLevelInfo(row.profile.xp)
                const isMe = row.profile.id === currentUserId
                const medals = ['🥇', '🥈', '🥉']
                return (
                  <article key={row.profile.id} className="app-card relative overflow-hidden p-5 text-center" style={index === 0 ? { borderColor: 'rgba(200,169,106,.45)' } : undefined}>
                    {index === 0 && <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-20" style={{ background: 'radial-gradient(60% 100% at 50% 0%, rgba(200,169,106,.14), transparent)' }} />}
                    <p className="text-2xl">{medals[index]}</p>
                    <Avatar name={row.profile.full_name || row.profile.email} src={row.profile.avatar_url} size={48} accent={isMe} className="mx-auto mt-2" />
                    <p className="mt-3 truncate text-[14px] font-extrabold">{row.profile.full_name || row.profile.email}{isMe && <span className="ml-1.5 text-[10px] font-bold uppercase" style={{ color: 'var(--accent)' }}>You</span>}</p>
                    <p className="mt-1 text-[11.5px]" style={{ color: 'var(--muted)' }}>Lvl {info.current.level} · {info.current.title}</p>
                    <p className="mt-2.5 text-[17px] font-extrabold" style={{ color: 'var(--accent)' }}>{range === 'all' ? row.score.toLocaleString() : `+${row.score}`} XP</p>
                  </article>
                )
              })}
            </section>
          )}

          {rest.length > 0 && (
            <section className="app-card overflow-hidden">
              {rest.map((row, index) => {
                const info = getLevelInfo(row.profile.xp)
                const isMe = row.profile.id === currentUserId
                return (
                  <div key={row.profile.id} className="flex items-center gap-4 border-t px-5 py-3.5 first:border-t-0" style={{ borderColor: 'var(--border)', background: isMe ? 'var(--accent-dim)' : undefined }}>
                    <span className="w-8 text-center text-xs font-extrabold" style={{ color: 'var(--muted)' }}>#{index + 4}</span>
                    <Avatar name={row.profile.full_name || row.profile.email} src={row.profile.avatar_url} size={36} accent={isMe} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-bold">{row.profile.full_name || row.profile.email}{isMe && <em className="ml-2 rounded px-1.5 py-0.5 text-[9px] not-italic font-bold uppercase tracking-wider" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>you</em>}</span>
                      <span className="mt-0.5 block text-[11px]" style={{ color: 'var(--muted)' }}>Lvl {info.current.level} · {info.current.title}</span>
                    </span>
                    <strong className="text-sm" style={{ color: 'var(--accent)' }}>{range === 'all' ? row.score.toLocaleString() : `+${row.score}`} XP</strong>
                  </div>
                )
              })}
            </section>
          )}
        </>
      )}
    </div>
  )
}
