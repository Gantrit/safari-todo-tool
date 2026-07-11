'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardList, ListChecks, Loader2, Pencil, Plus, Trash2, UserPlus, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Priority, TaskSection } from '@/lib/types'
import Modal from '@/components/ui/Modal'

type TemplateItem = {
  id: string
  template_id?: string
  title: string
  description: string | null
  section: TaskSection
  priority: Priority
  checklist: string[]
  reference_url: string | null
  due_time: string | null
  position: number
}
type Template = {
  id: string
  title: string
  description: string | null
  items: TemplateItem[]
}
type BoardOption = { id: string; name: string; workspace_id: string; workspaces?: { name: string } | null }
type MemberOption = { workspace_id: string; profiles: { id: string; full_name: string; email: string } | null }

type DraftItem = { key: string; title: string; description: string; section: TaskSection; priority: Priority; checklist: string; referenceUrl: string; dueTime: string }

const SECTIONS: { value: TaskSection; label: string }[] = [
  { value: 'DAILY', label: 'Daily to-dos' },
  { value: 'WEEKLY', label: 'Weekly to-dos' },
  { value: 'MONTHLY', label: 'Monthly to-dos' },
]

const newKey = () => Math.random().toString(36).slice(2)
const emptyDraft = (section: TaskSection): DraftItem => ({ key: newKey(), title: '', description: '', section, priority: 'MEDIUM', checklist: '', referenceUrl: '', dueTime: '' })

export default function TemplateLibrary({ templates, boards, members, isAdmin, userId }: { templates: Template[]; boards: BoardOption[]; members: MemberOption[]; isAdmin: boolean; userId: string }) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Template | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [items, setItems] = useState<DraftItem[]>([])
  const [saving, setSaving] = useState(false)
  const [assigning, setAssigning] = useState<Template | null>(null)
  const [assignForm, setAssignForm] = useState({ boardId: boards[0]?.id || '', assigneeId: '' })
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const startCreate = () => {
    setEditing(null); setName(''); setDescription('')
    setItems([emptyDraft('DAILY')])
    setError(null); setOpen(true)
  }
  const startEdit = (template: Template) => {
    setEditing(template); setName(template.title); setDescription(template.description || '')
    setItems((template.items || []).slice().sort((a, b) => a.position - b.position).map((item) => ({
      key: item.id, title: item.title, description: item.description || '', section: item.section, priority: item.priority,
      checklist: (item.checklist || []).join('\n'), referenceUrl: item.reference_url || '', dueTime: (item.due_time || '').slice(0, 5),
    })))
    setError(null); setOpen(true)
  }

  const addItem = (section: TaskSection) => setItems((prev) => [...prev, emptyDraft(section)])
  const updateItem = (key: string, patch: Partial<DraftItem>) => setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)))
  const removeItem = (key: string) => setItems((prev) => prev.filter((it) => it.key !== key))

  async function save(event: React.FormEvent) {
    event.preventDefault()
    const cleanItems = items.filter((it) => it.title.trim())
    if (!name.trim() || cleanItems.length === 0) { setError('Give the template a name and at least one task.'); return }
    setSaving(true); setError(null)

    let templateId = editing?.id
    if (editing) {
      const { error: updErr } = await supabase.from('task_templates').update({ title: name.trim(), description: description.trim() || null, updated_at: new Date().toISOString() }).eq('id', editing.id)
      if (updErr) { setError(updErr.message); setSaving(false); return }
      await supabase.from('template_items').delete().eq('template_id', editing.id)
    } else {
      const { data, error: insErr } = await supabase.from('task_templates').insert({ title: name.trim(), description: description.trim() || null, created_by: userId }).select('id').single()
      if (insErr || !data) { setError(insErr?.message || 'Template could not be created.'); setSaving(false); return }
      templateId = data.id
    }

    const rows = cleanItems.map((it, index) => ({
      template_id: templateId,
      title: it.title.trim(),
      description: it.description.trim() || null,
      section: it.section,
      priority: it.priority,
      checklist: it.checklist.split('\n').map((l) => l.trim()).filter(Boolean),
      reference_url: it.referenceUrl.trim() || null,
      due_time: it.dueTime || null,
      position: index,
    }))
    const { error: itemsErr } = await supabase.from('template_items').insert(rows)
    if (itemsErr) { setError(itemsErr.message); setSaving(false); return }

    setSaving(false); setOpen(false); router.refresh()
  }

  async function remove(template: Template) {
    if (!confirm(`Delete “${template.title}”? Already-assigned tasks stay on the board.`)) return
    await supabase.from('task_templates').update({ deleted_at: new Date().toISOString() }).eq('id', template.id)
    router.refresh()
  }

  const availableMembers = members.filter((m) => m.workspace_id === boards.find((b) => b.id === assignForm.boardId)?.workspace_id && m.profiles)
  const startAssign = (template: Template) => {
    const boardId = boards[0]?.id || ''
    const workspaceId = boards.find((b) => b.id === boardId)?.workspace_id
    setAssignForm({ boardId, assigneeId: members.find((m) => m.workspace_id === workspaceId)?.profiles?.id || '' })
    setAssigning(template); setError(null)
  }
  async function assignTemplate(event: React.FormEvent) {
    event.preventDefault()
    if (!assigning || !assignForm.boardId || !assignForm.assigneeId) return
    setSaving(true); setError(null)
    const { error: rpcErr } = await supabase.rpc('assign_template', { p_template_id: assigning.id, p_board_id: assignForm.boardId, p_assignee: assignForm.assigneeId })
    if (rpcErr) { setError(rpcErr.message); setSaving(false); return }
    setSaving(false); setAssigning(null)
    router.push(`/board/${assignForm.boardId}`); router.refresh()
  }

  const countBySection = (t: Template, section: TaskSection) => (t.items || []).filter((i) => i.section === section).length

  return (
    <>
      <header className="page-header">
        <div><p className="page-eyebrow">Reusable task bundles</p><h1 className="page-title">Templates</h1><p className="page-description">Build a bundle of recurring daily / weekly / monthly to-dos once, then assign it to any member in one click.</p></div>
        {isAdmin && <button onClick={startCreate} className="btn btn-primary"><Plus size={16} /> Create template</button>}
      </header>

      {templates.length > 0 ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => {
            const total = (template.items || []).length
            return (
              <article key={template.id} className="app-card flex min-h-[270px] flex-col p-6">
                <div className="mb-5 flex items-start gap-3">
                  <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[9px]" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}><ClipboardList size={18} /></span>
                  <div className="min-w-0 flex-1"><h2 className="font-bold">{template.title}</h2><p className="mt-1.5 line-clamp-2 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>{template.description || 'No description provided.'}</p></div>
                  {isAdmin && <div className="flex gap-1"><button onClick={() => startEdit(template)} className="icon-button !h-8 !w-8" aria-label={`Edit ${template.title}`}><Pencil size={13} /></button><button onClick={() => remove(template)} className="icon-button !h-8 !w-8 hover:!text-[var(--red)]" aria-label={`Delete ${template.title}`}><Trash2 size={13} /></button></div>}
                </div>

                <div className="mb-4 flex flex-wrap gap-2">
                  <span className="meta-pill"><ListChecks size={12} /> {total} task{total === 1 ? '' : 's'}</span>
                  {SECTIONS.map((s) => countBySection(template, s.value) > 0 && <span key={s.value} className="meta-pill">{countBySection(template, s.value)} {s.value.toLowerCase()}</span>)}
                </div>

                {total > 0 && (
                  <div className="mb-5 space-y-1.5 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
                    {(template.items || []).slice(0, 4).map((item) => (
                      <div key={item.id} className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                        <span className="mt-1 h-1.5 w-1.5 flex-none rounded-full" style={{ background: 'var(--accent)' }} />
                        <span className="min-w-0 flex-1 truncate">{item.title}</span>
                        {item.due_time && <span className="flex-none text-[10px] font-semibold" style={{ color: 'var(--accent)' }}>{item.due_time.slice(0, 5)}</span>}
                        <span className="flex-none text-[10px] uppercase" style={{ color: 'var(--muted)' }}>{item.section}</span>
                      </div>
                    ))}
                    {total > 4 && <p className="pl-3.5 text-[11px]" style={{ color: 'var(--muted)' }}>+{total - 4} more</p>}
                  </div>
                )}

                <div className="mt-auto border-t pt-4" style={{ borderColor: 'var(--border)' }}>
                  <button onClick={() => startAssign(template)} disabled={!boards.length || !isAdmin || total === 0} className="btn btn-primary w-full !min-h-10 disabled:opacity-50"><UserPlus size={14} /> Assign to member</button>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <div className="app-card card-empty min-h-[300px]"><div><ClipboardList className="mx-auto mb-4" size={28} style={{ color: 'var(--accent)' }} /><h2 className="font-bold">No templates yet</h2><p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>{isAdmin ? 'Create the first reusable bundle for your team.' : 'Templates will appear here when an admin adds them.'}</p>{isAdmin && <button onClick={startCreate} className="btn btn-secondary mt-5"><Plus size={15} /> Create first template</button>}</div></div>
      )}

      {/* Create / edit template */}
      <Modal open={open} onClose={() => !saving && setOpen(false)} title={editing ? 'Edit template' : 'Create template'} size="2xl">
        <form onSubmit={save}>
          <div className="space-y-6 p-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Template name" className="sm:col-span-2"><input autoFocus required value={name} onChange={(e) => setName(e.target.value)} className="form-control" placeholder="e.g. Chatter, Traffic, Manager" /></Field>
              <Field label="Description" className="sm:col-span-2"><textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className="form-control py-3" placeholder="What role or workflow is this bundle for?" /></Field>
            </div>

            {SECTIONS.map((section) => {
              const sectionItems = items.filter((it) => it.section === section.value)
              return (
                <div key={section.value} className="rounded-[12px] border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface2)' }}>
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-[13px] font-bold">{section.label} <span className="ml-1 text-xs font-medium" style={{ color: 'var(--muted)' }}>· {sectionItems.length}</span></p>
                    <button type="button" onClick={() => addItem(section.value)} className="btn btn-secondary !min-h-8 !px-3 !text-[11px]"><Plus size={12} /> Add task</button>
                  </div>
                  {sectionItems.length === 0 ? (
                    <p className="rounded-[9px] border border-dashed px-3 py-4 text-center text-xs" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>No {section.value.toLowerCase()} tasks yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {sectionItems.map((item) => (
                        <div key={item.key} className="rounded-[10px] border p-3.5" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                          <div className="mb-2.5 flex items-start gap-2">
                            <input value={item.title} onChange={(e) => updateItem(item.key, { title: e.target.value })} className="form-control flex-1 !min-h-10" placeholder="Task title" />
                            <select value={item.priority} onChange={(e) => updateItem(item.key, { priority: e.target.value as Priority })} className="form-control !min-h-10 !w-auto"><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option></select>
                            <button type="button" onClick={() => removeItem(item.key)} className="icon-button !h-10 !w-10 hover:!text-[var(--red)]" aria-label="Remove task"><X size={14} /></button>
                          </div>
                          <div className="mb-2.5 flex flex-wrap items-center gap-2">
                            <span className="text-[11px] font-semibold uppercase tracking-[.06em]" style={{ color: 'var(--muted)' }}>Due by</span>
                            <input type="time" value={item.dueTime} onChange={(e) => updateItem(item.key, { dueTime: e.target.value })} className="form-control !min-h-9 !w-auto !py-1 !text-[13px]" />
                            {item.dueTime && <button type="button" onClick={() => updateItem(item.key, { dueTime: '' })} className="text-[11px] underline" style={{ color: 'var(--muted)' }}>clear</button>}
                            <span className="text-[11px]" style={{ color: 'var(--muted)' }}>optional · Berlin time · {item.section === 'DAILY' ? 'each day' : item.section === 'WEEKLY' ? 'on the weekly deadline' : 'on the monthly deadline'}</span>
                          </div>
                          <textarea value={item.checklist} onChange={(e) => updateItem(item.key, { checklist: e.target.value })} rows={2} className="form-control py-2.5 text-[13px]" placeholder="Checklist — one item per line (optional)" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
          </div>
          <div className="modal-actions"><button type="button" onClick={() => setOpen(false)} className="btn btn-secondary">Cancel</button><button disabled={saving || !name.trim()} className="btn btn-primary">{saving && <Loader2 className="animate-spin" size={15} />}{editing ? 'Save changes' : 'Create template'}</button></div>
        </form>
      </Modal>

      {/* Assign template to a member */}
      <Modal open={!!assigning} onClose={() => !saving && setAssigning(null)} title="Assign template to member" size="md">
        {assigning && (
          <form onSubmit={assignTemplate}>
            <div className="space-y-5 p-6">
              <div className="rounded-[10px] border p-4" style={{ background: 'var(--surface2)', borderColor: 'var(--border)' }}>
                <p className="text-sm font-bold">{assigning.title}</p>
                <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>{(assigning.items || []).length} recurring task{(assigning.items || []).length === 1 ? '' : 's'} will be created for the member.</p>
              </div>
              <Field label="Board"><select required value={assignForm.boardId} onChange={(e) => { const boardId = e.target.value; const workspaceId = boards.find((b) => b.id === boardId)?.workspace_id; setAssignForm({ boardId, assigneeId: members.find((m) => m.workspace_id === workspaceId)?.profiles?.id || '' }) }} className="form-control"><option value="">Choose a board</option>{boards.map((board) => <option key={board.id} value={board.id}>{board.workspaces?.name ? `${board.workspaces.name} · ` : ''}{board.name === 'Team Board' ? 'Workspace Board' : board.name}</option>)}</select></Field>
              <Field label="Member"><select required value={assignForm.assigneeId} onChange={(e) => setAssignForm({ ...assignForm, assigneeId: e.target.value })} className="form-control"><option value="">Choose a teammate</option>{availableMembers.map((m) => m.profiles && <option key={m.profiles.id} value={m.profiles.id}>{m.profiles.full_name || m.profiles.email}</option>)}</select></Field>
              {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
            </div>
            <div className="modal-actions"><button type="button" onClick={() => setAssigning(null)} className="btn btn-secondary">Cancel</button><button disabled={saving || !assignForm.boardId || !assignForm.assigneeId} className="btn btn-primary">{saving && <Loader2 className="animate-spin" size={15} />}<UserPlus size={15} /> Assign tasks</button></div>
          </form>
        )}
      </Modal>
    </>
  )
}

function Field({ label, className = '', children }: { label: string; className?: string; children: React.ReactNode }) {
  return <label className={className}><span className="form-label">{label}</span>{children}</label>
}
