'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Building2, Check, ChevronDown, Plus } from 'lucide-react'
type WorkspaceSummary = { id: string; name: string }
type WorkspaceOption = { workspace_id?: string; role?: string; workspaces: WorkspaceSummary | WorkspaceSummary[] | null } | WorkspaceSummary

interface WorkspaceSwitcherProps {
  workspaces: WorkspaceOption[]
  canManage?: boolean
}

export default function WorkspaceSwitcher({ workspaces, canManage = false }: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState(workspaces[0] || null)
  const rootRef = useRef<HTMLDivElement>(null)
  const workspaceData = (option: WorkspaceOption | null): WorkspaceSummary | null => {
    if (!option) return null
    if ('workspaces' in option) {
      const value = option.workspaces
      return Array.isArray(value) ? value[0] || null : value || null
    }
    return option
  }
  const selected = workspaceData(current)

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  if (!selected) {
    const message = canManage ? 'No workspace yet' : 'Ask an admin to invite you'
    if (!canManage) {
      return (
        <div className="flex items-center gap-[10px] rounded-[6px] px-3 py-[9px] text-[13px]" style={{ color: 'var(--muted)' }}>
          <Building2 size={16} style={{ opacity: 0.7 }} />
          <span className="truncate">{message}</span>
        </div>
      )
    }
    return (
      <Link href="/settings?newWorkspace=1" className="nav-item flex items-center gap-[10px] rounded-[6px] px-3 py-[9px] text-[13px] font-medium">
        <Building2 size={16} style={{ opacity: 0.7 }} />
        <span className="flex-1 truncate">{message}</span>
        <Plus size={14} style={{ color: 'var(--accent)' }} />
      </Link>
    )
  }

  return (
    <div className="relative" ref={rootRef}>
      <button onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex min-h-14 w-full items-center gap-3 rounded-[12px] border px-3 text-left transition-colors" style={{ background: 'var(--surface2)', borderColor: open ? 'var(--border-strong)' : 'var(--border)' }}>
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] text-xs font-extrabold" style={{ background: 'rgba(216,195,106,.14)', color: 'var(--accent)' }}>{selected.name?.[0]?.toUpperCase()}</span>
        <span className="min-w-0 flex-1"><span className="block text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Workspace</span><span className="block truncate text-sm font-bold">{selected.name}</span></span>
        <ChevronDown size={15} style={{ color: 'var(--muted)', transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 160ms' }} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-[60] overflow-hidden rounded-[12px] border p-1.5 shadow-2xl" style={{ background: '#1a2018', borderColor: 'var(--border-strong)' }}>
          {workspaces.map((workspace, index) => {
            const data = workspaceData(workspace)
            const active = data?.id === selected.id
            return <button key={data?.id || index} onClick={() => { setCurrent(workspace); setOpen(false) }} className="flex min-h-10 w-full items-center gap-2 rounded-[8px] px-2.5 text-left text-xs font-semibold hover:bg-white/5"><span className="flex-1 truncate">{data?.name}</span>{active && <Check size={14} style={{ color: 'var(--accent)' }} />}</button>
          })}
          {canManage && <Link href="/settings?newWorkspace=1" onClick={() => setOpen(false)} className="mt-1 flex min-h-10 items-center gap-2 border-t px-2.5 pt-1 text-xs font-bold" style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}><Plus size={14} /> New Workspace</Link>}
        </div>
      )}
    </div>
  )
}
