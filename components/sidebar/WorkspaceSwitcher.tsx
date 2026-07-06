'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Check, ChevronDown, Loader2 } from 'lucide-react'
type WorkspaceSummary = { id: string; name: string }
type BoardSummary = { id: string; name: string; workspace_id: string }

interface WorkspaceSwitcherProps {
  workspaces: WorkspaceSummary[]
  boards: BoardSummary[]
  selectedWorkspaceId?: string
  canManage?: boolean
}

// Single-org model: boards are the departments, so with one workspace this is a
// static identity block. The dropdown only appears in the rare case of >1 org.
export default function WorkspaceSwitcher({ workspaces, boards, selectedWorkspaceId, canManage = false }: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = workspaces.find((workspace) => workspace.id === selectedWorkspaceId) || workspaces[0] || null

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const selectWorkspace = (workspace: WorkspaceSummary) => {
    setOpen(false)
    const firstBoard = boards.find((board) => board.workspace_id === workspace.id)
    startTransition(() => router.push(firstBoard ? `/board/${firstBoard.id}` : `/dashboard?workspace=${workspace.id}`))
  }

  if (!selected) {
    return (
      <div className="flex items-center gap-[10px] rounded-[12px] border px-3.5 py-[13px] text-[13px]" style={{ borderColor: 'var(--border)', background: 'var(--surface2)', color: 'var(--muted)' }}>
        <Building2 size={16} style={{ opacity: 0.7 }} />
        <span className="truncate">{canManage ? 'No organization yet' : 'Ask an admin to invite you'}</span>
      </div>
    )
  }

  const identity = (
    <>
      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] text-xs font-extrabold" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>{selected.name?.[0]?.toUpperCase()}</span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Organization</span>
        <span className="block truncate text-sm font-bold">{selected.name}</span>
      </span>
    </>
  )

  // One workspace → static identity, no interactive affordance.
  if (workspaces.length <= 1) {
    return (
      <div className="flex min-h-[62px] w-full items-center gap-3 rounded-[12px] border px-3.5" style={{ background: 'var(--surface2)', borderColor: 'var(--border)' }}>
        {identity}
      </div>
    )
  }

  return (
    <div className="relative" ref={rootRef}>
      <button onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex min-h-[62px] w-full items-center gap-3 rounded-[12px] border px-3.5 text-left transition-colors" style={{ background: 'var(--surface2)', borderColor: open ? 'var(--border-strong)' : 'var(--border)' }}>
        {identity}
        {isPending ? <Loader2 className="animate-spin" size={15} style={{ color: 'var(--accent)' }} /> : <ChevronDown size={15} style={{ color: 'var(--muted)', transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 160ms' }} />}
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-[60] overflow-hidden rounded-[12px] border p-1.5 shadow-2xl" style={{ background: 'var(--surface3)', borderColor: 'var(--border-strong)' }}>
          {workspaces.map((workspace) => {
            const active = workspace.id === selected.id
            return <button key={workspace.id} onClick={() => selectWorkspace(workspace)} disabled={isPending} className="flex min-h-11 w-full items-center gap-2 rounded-[8px] px-2.5 text-left text-xs font-semibold transition-colors hover:bg-white/5 disabled:opacity-60"><span className="flex-1 truncate">{workspace.name}</span>{active && <Check size={14} style={{ color: 'var(--accent)' }} />}</button>
          })}
        </div>
      )}
    </div>
  )
}
