'use client'

import { useMemo, useState } from 'react'
import { Archive as ArchiveIcon, CheckCircle2, Trophy } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import PriorityBadge from '@/components/ui/PriorityBadge'
import type { Priority } from '@/lib/types'

type TaskItem = { id: string; title: string; priority: Priority | null; date: string }
type QuestItem = { id: string; title: string; bonusXp: number; category: string | null; date: string }

const RANGES: { value: string; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
]

function cutoffFor(range: string): number | null {
  if (range === 'all') return null
  return Date.now() - Number(range) * 24 * 60 * 60 * 1000
}

export default function ArchiveView({ tasks, quests }: { tasks: TaskItem[]; quests: QuestItem[] }) {
  const [range, setRange] = useState('all')

  const cutoff = cutoffFor(range)
  const inRange = <T extends { date: string }>(items: T[]) =>
    cutoff === null ? items : items.filter((i) => i.date && new Date(i.date).getTime() >= cutoff)

  const visibleTasks = useMemo(() => inRange(tasks), [tasks, range])
  const visibleQuests = useMemo(() => inRange(quests), [quests, range])

  return (
    <div className="page-shell !max-w-[1100px]">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Completed work</p>
          <h1 className="page-title">Archive</h1>
          <p className="page-description">Your track record at Safari Studios — approved to-dos on the left, earned quests on the right.</p>
        </div>
        <label className="flex items-center gap-2">
          <span className="text-[10.5px] font-bold uppercase tracking-[.1em]" style={{ color: 'var(--muted)' }}>Period</span>
          <select value={range} onChange={(e) => setRange(e.target.value)} className="form-control !min-h-10 !w-auto !py-0 !text-[13px]">
            {RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </label>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left — approved to-dos */}
        <section className="app-card">
          <div className="card-header">
            <div><h2 className="font-bold">To-dos</h2><p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>{visibleTasks.length} approved</p></div>
            <span className="flex h-9 w-9 items-center justify-center rounded-[9px]" style={{ background: 'var(--green-dim)', color: 'var(--green)' }}><CheckCircle2 size={17} /></span>
          </div>
          {visibleTasks.length === 0 ? (
            <div className="card-empty min-h-[220px]"><div><ArchiveIcon className="mx-auto mb-3" size={24} style={{ color: 'var(--muted)' }} /><p className="text-sm font-semibold">Nothing here yet</p><p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>Approved tasks land here.</p></div></div>
          ) : (
            <div>
              {visibleTasks.map((item) => (
                <div key={item.id} className="flex items-center gap-4 border-b px-5 py-4 last:border-b-0 sm:px-6" style={{ borderColor: 'var(--border)' }}>
                  <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[9px]" style={{ background: 'var(--green-dim)', color: 'var(--green)' }}><CheckCircle2 size={16} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold" style={{ color: 'var(--text)', textDecoration: 'line-through', opacity: 0.65 }}>{item.title}</p>
                    <p className="mt-1 text-[11px]" style={{ color: 'var(--muted)' }}>Approved {formatDate(item.date)}</p>
                  </div>
                  {item.priority && <PriorityBadge priority={item.priority} />}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Right — earned quests */}
        <section className="app-card">
          <div className="card-header">
            <div><h2 className="font-bold">Quests</h2><p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>{visibleQuests.length} completed</p></div>
            <span className="flex h-9 w-9 items-center justify-center rounded-[9px]" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}><Trophy size={17} /></span>
          </div>
          {visibleQuests.length === 0 ? (
            <div className="card-empty min-h-[220px]"><div><Trophy className="mx-auto mb-3" size={24} style={{ color: 'var(--muted)' }} /><p className="text-sm font-semibold">No quests yet</p><p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>Approved quests land here.</p></div></div>
          ) : (
            <div>
              {visibleQuests.map((item) => (
                <div key={item.id} className="flex items-center gap-4 border-b px-5 py-4 last:border-b-0 sm:px-6" style={{ borderColor: 'var(--border)' }}>
                  <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[9px]" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}><Trophy size={16} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{item.title}</p>
                    <p className="mt-1 text-[11px]" style={{ color: 'var(--muted)' }}>Earned {formatDate(item.date)}{item.category ? ` · ${item.category}` : ''}</p>
                  </div>
                  <span className="meta-pill flex-none" style={{ color: 'var(--accent)' }}>+{item.bonusXp} XP</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
