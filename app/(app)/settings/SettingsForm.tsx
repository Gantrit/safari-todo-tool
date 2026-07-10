'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, ExternalLink, GripVertical, LayoutGrid, Loader2, Pencil, Plus, ShieldOff, ShieldCheck, Tag, Trash2, UserPlus, Users } from 'lucide-react'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { createClient } from '@/lib/supabase/client'
import { Profile, Role } from '@/lib/types'
import { getInitials } from '@/lib/utils'

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'employee', label: 'Member' },
  { value: 'guest', label: 'Viewer' },
]

interface MemberRow {
  user_id: string
  role?: string
  profiles?: { id?: string; full_name?: string | null; email?: string | null; role?: string; deactivated_at?: string | null } | null
}

interface Category { id: string; name: string; slug: string; position: number }

interface BoardRow { id: string; name: string; type: string; position?: number | null }

interface SettingsFormProps {
  workspace: { id: string; name: string } | null
  members: MemberRow[]
  boards: BoardRow[]
  boardAccess: { board_id: string; user_id: string }[]
  categories: Category[]
  currentUser: Profile
}

function slugify(name: string) {
  const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `${base || 'category'}-${Math.random().toString(36).slice(2, 6)}`
}

export default function SettingsForm({ workspace, members, boards, boardAccess, categories, currentUser }: SettingsFormProps) {
  const [wsName, setWsName] = useState(workspace?.name || '')
  const [inviteEmail, setInviteEmail] = useState('')
  const [newBoardName, setNewBoardName] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [access, setAccess] = useState<Set<string>>(new Set(boardAccess.map((a) => `${a.board_id}:${a.user_id}`)))
  const [openAccessBoard, setOpenAccessBoard] = useState<string | null>(null)

  // boardAccess is a prop from the server component; router.refresh() re-fetches it,
  // but this component instance stays mounted, so the initial useState() snapshot
  // above would otherwise go stale (e.g. after the auto-grant trigger in migration
  // 010 seeds access for a newly added member).
  useEffect(() => {
    setAccess(new Set(boardAccess.map((a) => `${a.board_id}:${a.user_id}`)))
  }, [boardAccess])

  // Local board order for drag-to-reorder — optimistic, persisted to
  // boards.position (migration 025). Same staleness caveat as `access` above.
  const [boardList, setBoardList] = useState<BoardRow[]>(boards)
  useEffect(() => { setBoardList(boards) }, [boards])
  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  async function handleBoardDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = boardList.findIndex((b) => b.id === active.id)
    const newIdx = boardList.findIndex((b) => b.id === over.id)
    if (oldIdx < 0 || newIdx < 0) return
    const next = arrayMove(boardList, oldIdx, newIdx)
    setBoardList(next)
    const results = await Promise.all(
      next.map((b, i) => b.position === i ? null : supabase.from('boards').update({ position: i }).eq('id', b.id))
    )
    const failed = results.find((r) => r && r.error)
    if (failed && failed.error) {
      setBoardList(boardList) // revert
      setMessage({ text: failed.error.message, type: 'error' })
      return
    }
    router.refresh()
  }
  const [renamingBoard, setRenamingBoard] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [renamingCategory, setRenamingCategory] = useState<string | null>(null)
  const [categoryRenameValue, setCategoryRenameValue] = useState('')
  const supabase = createClient()
  const router = useRouter()

  const memberRole = (m: MemberRow): Role => (m.profiles?.role || m.role || 'employee') as Role
  const isDeactivated = (m: MemberRow) => Boolean(m.profiles?.deactivated_at)

  async function createWorkspace() {
    if (!wsName.trim()) return
    setBusy('workspace'); setMessage(null)
    const { data: id, error } = await supabase.rpc('create_workspace_with_defaults', { p_name: wsName.trim() })
    if (error || !id) { setMessage({ text: error?.message || 'Workspace could not be created.', type: 'error' }); setBusy(null); return }
    router.push(`/dashboard?workspace=${id}`)
  }
  async function invite() {
    if (!inviteEmail.trim()) return
    setBusy('invite'); setMessage(null)
    const response = await fetch('/api/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: inviteEmail.trim(), workspaceId: workspace?.id }) })
    const body = await response.json().catch(() => null)
    setMessage({ text: response.ok ? `Invite sent to ${inviteEmail}.` : (body?.error || 'Invite could not be sent.'), type: response.ok ? 'success' : 'error' })
    if (response.ok) setInviteEmail('')
    setBusy(null)
  }
  async function addBoard() {
    if (!newBoardName.trim() || !workspace?.id) return
    setBusy('board'); setMessage(null)
    const { error } = await supabase.from('boards').insert({ workspace_id: workspace.id, name: newBoardName.trim(), type: 'kanban', position: boardList.length })
    if (error) setMessage({ text: error.message, type: 'error' }); else setNewBoardName('')
    setBusy(null); router.refresh()
  }
  async function renameBoard(id: string) {
    if (!renameValue.trim()) return
    setBusy(`rename-${id}`); setMessage(null)
    const { error } = await supabase.from('boards').update({ name: renameValue.trim() }).eq('id', id)
    if (error) setMessage({ text: error.message, type: 'error' }); else setRenamingBoard(null)
    setBusy(null); router.refresh()
  }
  async function deleteBoard(id: string, name: string) {
    if (!confirm(`Delete “${name}”? Its tasks are archived (soft-deleted), not permanently erased.`)) return
    setBusy(`board-${id}`); setMessage(null)
    const { error } = await supabase.rpc('soft_delete_board', { p_board_id: id })
    if (error) setMessage({ text: error.message, type: 'error' })
    setBusy(null); router.refresh()
  }
  async function changeRole(userId: string, role: Role) {
    setBusy(`role-${userId}`); setMessage(null)
    const { error } = await supabase.rpc('set_member_role', { p_user_id: userId, p_role: role })
    if (error) setMessage({ text: error.message, type: 'error' })
    setBusy(null); router.refresh()
  }
  async function toggleDeactivate(userId: string, name: string, currentlyDeactivated: boolean) {
    const action = currentlyDeactivated ? 'Reactivate' : 'Deactivate'
    if (!confirm(`${action} ${name}? ${currentlyDeactivated ? 'They regain access.' : 'Their access is blocked but their data is kept.'}`)) return
    setBusy(`deact-${userId}`); setMessage(null)
    const { error } = await supabase.rpc('set_member_deactivated', { p_user_id: userId, p_deactivated: !currentlyDeactivated })
    if (error) setMessage({ text: error.message, type: 'error' })
    setBusy(null); router.refresh()
  }
  async function removeMember(id: string, name: string) {
    if (!workspace?.id || id === currentUser.id || !confirm(`Remove ${name} from this workspace? This does not delete their account.`)) return
    setBusy(`remove-${id}`)
    const { error } = await supabase.from('workspace_members').delete().eq('user_id', id).eq('workspace_id', workspace.id)
    if (error) setMessage({ text: error.message, type: 'error' })
    setBusy(null); router.refresh()
  }
  async function addCategory() {
    if (!newCategory.trim()) return
    setBusy('category'); setMessage(null)
    const position = (categories.reduce((max, c) => Math.max(max, c.position), 0) || 0) + 10
    const { error } = await supabase.from('departments').insert({ name: newCategory.trim(), slug: slugify(newCategory), position })
    if (error) setMessage({ text: error.message, type: 'error' }); else setNewCategory('')
    setBusy(null); router.refresh()
  }
  async function renameCategory(id: string) {
    if (!categoryRenameValue.trim()) return
    setBusy(`cat-rename-${id}`); setMessage(null)
    const { error } = await supabase.from('departments').update({ name: categoryRenameValue.trim() }).eq('id', id)
    if (error) setMessage({ text: error.message, type: 'error' }); else setRenamingCategory(null)
    setBusy(null); router.refresh()
  }
  async function deleteCategory(id: string, name: string) {
    if (!confirm(`Delete category "${name}"? Quests and tasks in it become uncategorized — nothing else is lost.`)) return
    setBusy(`cat-${id}`); setMessage(null)
    const { error } = await supabase.from('departments').delete().eq('id', id)
    if (error) setMessage({ text: error.message, type: 'error' })
    setBusy(null); router.refresh()
  }
  async function toggleAccess(boardId: string, userId: string) {
    const key = `${boardId}:${userId}`
    const has = access.has(key)
    const next = new Set(access)
    if (has) next.delete(key); else next.add(key)
    setAccess(next)
    const { error } = has
      ? await supabase.from('board_access').delete().eq('board_id', boardId).eq('user_id', userId)
      : await supabase.from('board_access').upsert({ board_id: boardId, user_id: userId, can_comment: true }, { onConflict: 'board_id,user_id' })
    if (error) {
      setAccess(access) // revert
      setMessage({ text: error.message, type: 'error' })
    }
  }

  if (!workspace) return <div className="app-card mx-auto max-w-2xl"><div className="card-header"><div><h2 className="font-bold">Start a new workspace</h2><p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>A workspace board is created automatically.</p></div><Building2 size={20} style={{ color: 'var(--accent)' }} /></div><div className="p-6"><label><span className="form-label">Workspace name</span><input autoFocus value={wsName} onChange={(e) => setWsName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && createWorkspace()} className="form-control" placeholder="e.g. Safari" /></label>{message && <Notice {...message} />}<button onClick={createWorkspace} disabled={busy === 'workspace' || !wsName.trim()} className="btn btn-primary mt-5">{busy === 'workspace' && <Loader2 className="animate-spin" size={15} />}Create workspace</button></div></div>

  return <div className="space-y-6">
    {message && <Notice {...message} />}
    <section className="app-card"><SectionHead icon={<UserPlus size={18} />} title="Invite user" description="Add a teammate to this workspace by email." /><div className="p-5 sm:p-6"><label><span className="form-label">Email address</span><div className="flex flex-col gap-3 sm:flex-row"><input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className="form-control" placeholder="teammate@safarixstudios.com" /><button onClick={invite} disabled={busy === 'invite' || !inviteEmail.trim()} className="btn btn-secondary flex-none">{busy === 'invite' && <Loader2 className="animate-spin" size={15} />}Send invite</button></div></label></div></section>

    <section className="app-card">
      <SectionHead icon={<Users size={18} />} title="Members & roles" description={`${members.length} ${members.length === 1 ? 'person' : 'people'} · set each member's role, deactivate, or remove.`} />
      <div>
        {members.map((member) => {
          const name = member.profiles?.full_name || member.profiles?.email || 'Unknown member'
          const uid = member.user_id
          const isSelf = uid === currentUser.id
          const deactivated = isDeactivated(member)
          return (
            <div key={uid} className="settings-row" style={deactivated ? { opacity: 0.6 } : undefined}>
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-xs font-bold" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>{getInitials(name)}</span>
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-sm">{name}{isSelf && <span className="ml-2 text-[10px] uppercase tracking-wider" style={{ color: 'var(--accent)' }}>you</span>}{deactivated && <span className="ml-2 rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wider" style={{ background: 'var(--red-dim)', color: 'var(--red)' }}>deactivated</span>}</strong>
                <span className="block truncate text-xs" style={{ color: 'var(--muted)' }}>{member.profiles?.email}</span>
              </span>
              <select
                value={memberRole(member)}
                disabled={isSelf || busy === `role-${uid}`}
                onChange={(e) => changeRole(uid, e.target.value as Role)}
                className="form-control !min-h-9 !w-auto !py-0 !text-[12.5px] disabled:opacity-50"
                aria-label={`Role for ${name}`}
              >
                {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {!isSelf && (
                <>
                  <button onClick={() => toggleDeactivate(uid, name, deactivated)} disabled={busy === `deact-${uid}`} className="icon-button !h-8 !w-8" title={deactivated ? 'Reactivate' : 'Deactivate'} aria-label={deactivated ? `Reactivate ${name}` : `Deactivate ${name}`}>
                    {busy === `deact-${uid}` ? <Loader2 className="animate-spin" size={13} /> : deactivated ? <ShieldCheck size={14} /> : <ShieldOff size={14} />}
                  </button>
                  <button onClick={() => removeMember(uid, name)} disabled={busy === `remove-${uid}`} className="icon-button !h-8 !w-8 hover:!text-[var(--red)]" aria-label={`Remove ${name}`}>
                    {busy === `remove-${uid}` ? <Loader2 className="animate-spin" size={13} /> : <Trash2 size={13} />}
                  </button>
                </>
              )}
            </div>
          )
        })}
      </div>
    </section>

    <section className="app-card">
      <SectionHead icon={<LayoutGrid size={18} />} title="Boards & access" description="Create boards and control which members can see each one. Drag the handle to change the order — the sidebar follows it. Admins always have access." />
      {/* Stable id: dnd-kit otherwise generates sequential a11y ids that differ
          between server and client render → React hydration mismatch. */}
      <DndContext id="settings-board-order" sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleBoardDragEnd}>
        <SortableContext items={boardList.map((b) => b.id)} strategy={verticalListSortingStrategy}>
        <div>
        {boardList.map((board) => {
          const open = openAccessBoard === board.id
          const renaming = renamingBoard === board.id
          const displayName = board.name === 'Team Board' ? `${workspace.name} Board` : board.name
          return (
            <SortableBoardRow key={board.id} id={board.id}>
              {(handleProps) => (<>
              <div className="settings-row">
                <button
                  type="button"
                  className="icon-button !h-8 !w-6 flex-none cursor-grab active:cursor-grabbing"
                  aria-label={`Reorder ${displayName}`}
                  title="Drag to reorder"
                  {...handleProps}
                >
                  <GripVertical size={14} />
                </button>
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[8px]" style={{ background: 'var(--surface2)', color: 'var(--text-secondary)' }}><LayoutGrid size={15} /></span>
                {renaming ? (
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} className="form-control !min-h-8 !py-1 !text-sm" autoFocus onKeyDown={(e) => e.key === 'Enter' && renameBoard(board.id)} />
                    <button onClick={() => renameBoard(board.id)} disabled={busy === `rename-${board.id}` || !renameValue.trim()} className="btn btn-secondary !min-h-8 !px-3 !text-[12px]">{busy === `rename-${board.id}` ? <Loader2 className="animate-spin" size={13} /> : 'Save'}</button>
                    <button onClick={() => setRenamingBoard(null)} className="btn btn-secondary !min-h-8 !px-3 !text-[12px]">Cancel</button>
                  </div>
                ) : (
                  <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{displayName}</strong><span className="text-xs capitalize" style={{ color: 'var(--muted)' }}>{board.type} board</span></span>
                )}
                {!renaming && (
                  <button onClick={() => { setRenamingBoard(board.id); setRenameValue(board.name) }} className="icon-button !h-8 !w-8" aria-label={`Rename ${board.name}`} title="Rename board"><Pencil size={13} /></button>
                )}
                <button onClick={() => setOpenAccessBoard(open ? null : board.id)} className="btn btn-secondary !min-h-8 !px-3 !text-[12px]">{open ? 'Done' : 'Manage access'}</button>
                <button onClick={() => deleteBoard(board.id, board.name)} disabled={busy === `board-${board.id}`} className="icon-button !h-8 !w-8 hover:!text-[var(--red)]" aria-label={`Delete ${board.name}`}>{busy === `board-${board.id}` ? <Loader2 className="animate-spin" size={13} /> : <Trash2 size={13} />}</button>
              </div>
              {open && (
                <div className="flex flex-wrap gap-2 px-5 pb-5 sm:px-6" style={{ background: 'var(--surface2)' }}>
                  {members.map((member) => {
                    const uid = member.user_id
                    const name = member.profiles?.full_name || member.profiles?.email || 'Member'
                    const admin = memberRole(member) === 'admin'
                    const has = admin || access.has(`${board.id}:${uid}`)
                    return (
                      <button key={uid} onClick={() => !admin && toggleAccess(board.id, uid)} disabled={admin} className={`filter-chip ${has ? 'is-active' : ''} disabled:opacity-60`} title={admin ? 'Admins always have access' : undefined}>
                        <span className="flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-extrabold" style={{ background: 'var(--surface3)', color: 'var(--text)' }}>{getInitials(name)}</span>
                        {member.profiles?.full_name?.split(' ')[0] || name}
                        {has && <span style={{ color: 'var(--accent)' }}>✓</span>}
                      </button>
                    )
                  })}
                </div>
              )}
              </>)}
            </SortableBoardRow>
          )
        })}
        </div>
        </SortableContext>
      </DndContext>
      <div className="border-t p-5 sm:p-6" style={{ borderColor: 'var(--border)', background: 'var(--surface2)' }}><span className="form-label">Add board</span><div className="flex flex-col gap-3 sm:flex-row"><input value={newBoardName} onChange={(e) => setNewBoardName(e.target.value)} className="form-control" placeholder="Board name" /><button onClick={addBoard} disabled={busy === 'board' || !newBoardName.trim()} className="btn btn-secondary flex-none">{busy === 'board' ? <Loader2 className="animate-spin" size={15} /> : <Plus size={15} />}Add board</button></div></div>
    </section>

    <section className="app-card">
      <SectionHead icon={<Tag size={18} />} title="Quest categories" description="Group quests (Traffic, Backend, Chatting …). These also apply to tasks. Add, rename, or remove — deleting one just makes its quests uncategorized." />
      <div>
        {categories.map((category) => {
          const renaming = renamingCategory === category.id
          return (
            <div key={category.id} className="settings-row">
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[8px]" style={{ background: 'var(--surface2)', color: 'var(--accent)' }}><Tag size={15} /></span>
              {renaming ? (
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <input value={categoryRenameValue} onChange={(e) => setCategoryRenameValue(e.target.value)} className="form-control !min-h-8 !py-1 !text-sm" autoFocus onKeyDown={(e) => e.key === 'Enter' && renameCategory(category.id)} />
                  <button onClick={() => renameCategory(category.id)} disabled={busy === `cat-rename-${category.id}` || !categoryRenameValue.trim()} className="btn btn-secondary !min-h-8 !px-3 !text-[12px]">{busy === `cat-rename-${category.id}` ? <Loader2 className="animate-spin" size={13} /> : 'Save'}</button>
                  <button onClick={() => setRenamingCategory(null)} className="btn btn-secondary !min-h-8 !px-3 !text-[12px]">Cancel</button>
                </div>
              ) : (
                <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{category.name}</strong></span>
              )}
              {!renaming && (
                <>
                  <button onClick={() => { setRenamingCategory(category.id); setCategoryRenameValue(category.name) }} className="icon-button !h-8 !w-8" aria-label={`Rename ${category.name}`} title="Rename category"><Pencil size={13} /></button>
                  <button onClick={() => deleteCategory(category.id, category.name)} disabled={busy === `cat-${category.id}`} className="icon-button !h-8 !w-8 hover:!text-[var(--red)]" aria-label={`Delete ${category.name}`}>{busy === `cat-${category.id}` ? <Loader2 className="animate-spin" size={13} /> : <Trash2 size={13} />}</button>
                </>
              )}
            </div>
          )
        })}
        {categories.length === 0 && <p className="px-5 py-4 text-xs sm:px-6" style={{ color: 'var(--muted)' }}>No categories yet — add your first below.</p>}
      </div>
      <div className="border-t p-5 sm:p-6" style={{ borderColor: 'var(--border)', background: 'var(--surface2)' }}><span className="form-label">Add category</span><div className="flex flex-col gap-3 sm:flex-row"><input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCategory()} className="form-control" placeholder="e.g. Traffic" /><button onClick={addCategory} disabled={busy === 'category' || !newCategory.trim()} className="btn btn-secondary flex-none">{busy === 'category' ? <Loader2 className="animate-spin" size={15} /> : <Plus size={15} />}Add category</button></div></div>
    </section>

    <section className="app-card"><SectionHead icon={<ExternalLink size={18} />} title="Defaults & links" description="Shared references are attached at task level in the current workspace model." /><div className="p-5 sm:p-6"><div className="rounded-[10px] border p-4 text-sm leading-6" style={{ borderColor: 'var(--border)', background: 'var(--surface2)', color: 'var(--text-secondary)' }}>Add Drive, brief, or SOP links when creating a task. This keeps each reference attached to the work it belongs to.</div></div></section>
  </div>
}

/** Sortable wrapper for one board row; drag activates only via the handle so the
 *  row's buttons/inputs keep working. Render-prop passes the handle's listeners. */
function SortableBoardRow({ id, children }: { id: string; children: (handleProps: Record<string, unknown>) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.7 : 1, position: 'relative', zIndex: isDragging ? 10 : undefined }}
    >
      {children({ ...attributes, ...listeners })}
    </div>
  )
}

function SectionHead({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) { return <div className="card-header"><div><h2 className="font-bold">{title}</h2><p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>{description}</p></div><span style={{ color: 'var(--accent)' }}>{icon}</span></div> }
function Notice({ text, type }: { text: string; type: 'success' | 'error' }) { return <div className="rounded-[10px] border px-4 py-3 text-sm" style={{ background: type === 'success' ? 'var(--green-dim)' : 'var(--red-dim)', borderColor: type === 'success' ? 'rgba(34,197,94,.3)' : 'rgba(239,68,68,.3)', color: type === 'success' ? 'var(--green)' : 'var(--red)' }}>{text}</div> }
