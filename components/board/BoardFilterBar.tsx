'use client'

import { useState } from 'react'
import { Profile, TaskStatus } from '@/lib/types'
import { UrgencyLevel } from '@/lib/utils'
import { BoardFilters, filtersActiveCount } from '@/lib/boardViews'
import { getInitials } from '@/lib/utils'
import { SlidersHorizontal, X } from 'lucide-react'

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'ASSIGNED', label: 'Assigned' },
  { value: 'NOTICED', label: 'Noticed' },
  { value: 'IN_EDIT', label: 'In edit' },
  { value: 'DONE', label: 'Approval' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
]

const URGENCY_OPTIONS: { value: UrgencyLevel; label: string; color: string }[] = [
  { value: 'overdue', label: 'Overdue', color: 'var(--red)' },
  { value: 'soon', label: 'Soon', color: 'var(--orange)' },
  { value: 'near', label: 'Near', color: 'var(--yellow)' },
  { value: 'far', label: 'Later', color: 'var(--text-secondary)' },
  { value: 'none', label: 'No date', color: 'var(--muted)' },
]

function toggle<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value]
}

interface BoardFilterBarProps {
  filters: BoardFilters
  onChange: (f: BoardFilters) => void
  creators: Profile[]
}

export default function BoardFilterBar({ filters, onChange, creators }: BoardFilterBarProps) {
  const [open, setOpen] = useState(false)
  const active = filtersActiveCount(filters)

  return (
    <div className="w-full">
      <div className="board-list-toolbar !mb-0">
        <button onClick={() => setOpen((v) => !v)} className={`filter-chip ${active ? 'is-active' : ''}`} aria-expanded={open}>
          <SlidersHorizontal size={13} /> Filters {active > 0 && <span className="rounded-full px-1.5 text-[10px]" style={{ background: 'var(--accent)', color: 'var(--bg)' }}>{active}</span>}
        </button>
        {active > 0 && (
          <button onClick={() => onChange({ statuses: [], urgencies: [], creators: [] })} className="filter-chip">
            <X size={12} /> Clear
          </button>
        )}
      </div>

      {open && (
        <div className="filter-panel mx-auto mt-3" style={{ maxWidth: 1080 }}>
          <div>
            <p className="filter-group-label">Status</p>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_OPTIONS.map((o) => (
                <button key={o.value} onClick={() => onChange({ ...filters, statuses: toggle(filters.statuses, o.value) })} className={`filter-chip ${filters.statuses.includes(o.value) ? 'is-active' : ''}`}>{o.label}</button>
              ))}
            </div>
          </div>

          <div>
            <p className="filter-group-label">Urgency</p>
            <div className="flex flex-wrap gap-1.5">
              {URGENCY_OPTIONS.map((o) => (
                <button key={o.value} onClick={() => onChange({ ...filters, urgencies: toggle(filters.urgencies, o.value) })} className={`filter-chip ${filters.urgencies.includes(o.value) ? 'is-active' : ''}`}>
                  <span className="h-2 w-2 rounded-full" style={{ background: o.color }} /> {o.label}
                </button>
              ))}
            </div>
          </div>

          {creators.length > 0 && (
            <div>
              <p className="filter-group-label">Created by</p>
              <div className="flex flex-wrap gap-1.5">
                {creators.map((c) => (
                  <button key={c.id} onClick={() => onChange({ ...filters, creators: toggle(filters.creators, c.id) })} className={`filter-chip ${filters.creators.includes(c.id) ? 'is-active' : ''}`}>
                    <span className="flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-extrabold" style={{ background: 'var(--surface3)', color: 'var(--text)' }}>{getInitials(c.full_name || c.email)}</span>
                    {c.full_name?.split(' ')[0] || c.email}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
