'use client'

import { BoardViewMode } from '@/lib/boardViews'
import { Columns3, LayoutList, Rows3, Table2, UserRound } from 'lucide-react'

const VIEWS: { mode: BoardViewMode; label: string; icon: React.ReactNode }[] = [
  { mode: 'members', label: 'Member rows', icon: <Rows3 size={14} /> },
  { mode: 'table', label: 'Table', icon: <Table2 size={14} /> },
  { mode: 'focus', label: 'Focus', icon: <UserRound size={14} /> },
  { mode: 'selection', label: 'Selection', icon: <LayoutList size={14} /> },
  { mode: 'columns', label: 'Columns', icon: <Columns3 size={14} /> },
]

export default function BoardViewSwitcher({ view, onChange }: { view: BoardViewMode; onChange: (v: BoardViewMode) => void }) {
  return (
    <div className="seg" role="tablist" aria-label="Board view">
      {VIEWS.map(({ mode, label, icon }) => (
        <button
          key={mode}
          role="tab"
          aria-selected={view === mode}
          onClick={() => onChange(mode)}
          className={`seg-btn ${view === mode ? 'is-active' : ''}`}
        >
          {icon}
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  )
}
