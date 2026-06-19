'use client'

import { useState } from 'react'
import { ChevronDown, Plus } from 'lucide-react'

interface WorkspaceSwitcherProps {
  workspaces: any[]
}

export default function WorkspaceSwitcher({ workspaces }: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState(workspaces[0] || null)

  const ws = current?.workspaces || current
  const name = ws?.name || 'Select Workspace'

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-[8px] text-sm transition-all"
        style={{ background: 'var(--surface2)', color: 'var(--text)' }}
      >
        <span
          className="w-5 h-5 rounded flex items-center justify-center text-xs font-bold flex-shrink-0"
          style={{ background: 'var(--accent)', color: '#0e0e0e' }}
        >
          {name[0]?.toUpperCase()}
        </span>
        <span className="flex-1 text-left truncate text-xs font-medium">{name}</span>
        <ChevronDown size={12} style={{ color: 'var(--muted)' }} />
      </button>

      {open && (
        <div
          className="absolute top-full left-0 right-0 mt-1 rounded-[8px] overflow-hidden z-50"
          style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}
        >
          {workspaces.map((ws, i) => {
            const wsData = ws.workspaces || ws
            return (
              <button
                key={i}
                onClick={() => { setCurrent(ws); setOpen(false) }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:opacity-80 transition-opacity"
                style={{ color: 'var(--text)' }}
              >
                <span
                  className="w-4 h-4 rounded flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: 'var(--accent)', color: '#0e0e0e' }}
                >
                  {wsData?.name?.[0]?.toUpperCase()}
                </span>
                {wsData?.name}
              </button>
            )
          })}
          <button
            className="w-full flex items-center gap-2 px-3 py-2 text-xs border-t"
            style={{ color: 'var(--muted)', borderColor: 'var(--border)' }}
          >
            <Plus size={12} />
            New Workspace
          </button>
        </div>
      )}
    </div>
  )
}
