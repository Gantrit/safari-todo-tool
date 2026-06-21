'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Check, ChevronDown, Loader2, Plus } from 'lucide-react'
type WorkspaceSummary = { id: string; name: string }
type BoardSummary = { id: string; name: string; workspace_id: string }

interface WorkspaceSwitcherProps {
  workspaces: WorkspaceSummary[]
  boards: BoardSummary[]
  selectedWorkspaceId?: string
  canManage?: boolean
}

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
      <button onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex min-h-[62px] w-full items-center gap-3 rounded-[12px] border px-3.5 text-left transition-colors" style={{ background: 'var(--surface2)', borderColor: open ? 'var(--border-strong)' : 'var(--border)' }}>
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] text-xs font-extrabold" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>{selected.name?.[0]?.toUpperCase()}</span>
        <span className="min-w-0 flex-1"><span className="block text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Workspace</span><span className="block truncate text-sm font-bold">{selected.name}</span></span>
        {isPending ? <Loader2 className="animate-spin" size={15} style={{ color: 'var(--accent)' }} /> : <ChevronDown size={15} style={{ color: 'var(--muted)', transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 160ms' }} />}
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-[60] overflow-hidden rounded-[12px] border p-1.5 shadow-2xl" style={{ background: '#1a2018', borderColor: 'var(--border-strong)' }}>
          {workspaces.map((workspace) => {
            const active = workspace.id === selected.id
            const boardCount = boards.filter((board) => board.workspace_id === workspace.id).length
            return <button key={workspace.id} onClick={() => selectWorkspace(workspace)} disabled={isPending} className="flex min-h-11 w-full items-center gap-2 rounded-[8px] px-2.5 text-left text-xs font-semibold transition-colors hover:bg-white/5 disabled:opacity-60"><span className="flex-1 truncate">{workspace.name}</span><span className="text-[10px] font-medium" style={{ color: 'var(--muted)' }}>{boardCount} {boardCount === 1 ? 'board' : 'boards'}</span>{active && <Check size={14} style={{ color: 'var(--accent)' }} />}</button>
          })}
          {canManage && <Link href="/settings?newWorkspace=1" onClick={() => setOpen(false)} className="mt-1 flex min-h-10 items-center gap-2 border-t px-2.5 pt-1 text-xs font-bold" style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}><Plus size={14} /> New Workspace</Link>}
        </div>
      )}
    </div>
  )
}
