'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardList, ExternalLink, ListChecks, Loader2, Pencil, Play, Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Priority, TaskSection } from '@/lib/types'
import Modal from '@/components/ui/Modal'

type Template = {
  id: string
  title: string
  description: string | null
  checklist: string[]
  section: TaskSection
  priority: Priority
  reference_url: string | null
}
type BoardOption = { id: string; name: string; workspace_id: string; workspaces?: { name: string } | null }
type MemberOption = { workspace_id: string; profiles: { id: string; full_name: string; email: string } | null }

const emptyForm = { title: '', description: '', checklist: '', section: 'DAILY' as TaskSection, priority: 'MEDIUM' as Priority, referenceUrl: '' }

export default function TemplateLibrary({ templates, boards, members, isAdmin, userId }: { templates: Template[]; boards: BoardOption[]; members: MemberOption[]; isAdmin: boolean; userId: string }) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Template | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [usingTemplate, setUsingTemplate] = useState<Template | null>(null)
  const [useForm, setUseForm] = useState({ boardId: boards[0]?.id || '', assigneeId: '', deadline: '' })
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const startCreate = () => { setEditing(null); setForm(emptyForm); setError(null); setOpen(true) }
  const startEdit = (template: Template) => {
    setEditing(template)
    setForm({ title: template.title, description: template.description || '', checklist: (template.checklist || []).join('\n'), section: template.section, priority: template.priority, referenceUrl: template.reference_url || '' })
    setError(null)
    setOpen(true)
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!form.title.trim()) return
    setSaving(true)
    setError(null)
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      checklist: form.checklist.split('\n').map((item) => item.trim()).filter(Boolean),
      section: form.section,
      priority: form.priority,
      reference_url: form.referenceUrl.trim() || null,
      created_by: userId,
      updated_at: new Date().toISOString(),
    }
    const result = editing
      ? await supabase.from('task_templates').update(payload).eq('id', editing.id)
      : await supabase.from('task_templates').insert(payload)
    if (result.error) { setError(result.error.message); setSaving(false); return }
    setOpen(false)
    setSaving(false)
    router.refresh()
  }

  async function remove(template: Template) {
    if (!confirm(`Delete “${template.title}”?`)) return
    await supabase.from('task_templates').update({ deleted_at: new Date().toISOString() }).eq('id', template.id)
    router.refresh()
  }

  const availableMembers = members.filter((member) => member.workspace_id === boards.find((board) => board.id === useForm.boardId)?.workspace_id && member.profiles)
  const startUse = (template: Template) => {
    const boardId = boards[0]?.id || ''
    const workspaceId = boards.find((board) => board.id === boardId)?.workspace_id
    const assigneeId = members.find((member) => member.workspace_id === workspaceId)?.profiles?.id || ''
    setUseForm({ boardId, assigneeId, deadline: '' }); setUsingTemplate(template); setError(null)
  }
  async function createFromTemplate(event: React.FormEvent) {
    event.preventDefault()
    if (!usingTemplate || !useForm.boardId || !useForm.assigneeId) return
    setSaving(true); setError(null)
    const { data: task, error: taskError } = await supabase.from('tasks').insert({ board_id: useForm.boardId, assigned_to: useForm.assigneeId, assignee_ids: [useForm.assigneeId], created_by: userId, creator_id: userId, title: usingTemplate.title, description: usingTemplate.description, priority: usingTemplate.priority, status: 'ASSIGNED', section: usingTemplate.section, due_date: useForm.deadline ? useForm.deadline.slice(0, 10) : null, deadline_at: useForm.deadline ? new Date(useForm.deadline).toISOString() : null, remind_3d: false, remind_24h: false, xp_awarded: false, position: 0, reference_url: usingTemplate.reference_url, google_drive_url: usingTemplate.reference_url }).select('id').single()
    if (taskError || !task) { setError(taskError?.message || 'Task could not be created.'); setSaving(false); return }
    if (usingTemplate.checklist?.length) {
      const { error: checklistError } = await supabase.from('checklist_items').insert(usingTemplate.checklist.map((title, position) => ({ task_id: task.id, title, position, done: false })))
      if (checklistError) setError(`Task created, but its checklist could not be saved: ${checklistError.message}`)
    }
    setSaving(false); setUsingTemplate(null); router.push(`/board/${useForm.boardId}`); router.refresh()
  }

  return (
    <>
      <header className="page-header">
        <div><p className="page-eyebrow">Reusable task structure</p><h1 className="page-title">Templates</h1><p className="page-description">Standardize recurring work with ready-made priorities, sections, and checklists.</p></div>
        {isAdmin && <button onClick={startCreate} className="btn btn-primary"><Plus size={16} /> Create template</button>}
      </header>

      {templates.length > 0 ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => (
            <article key={template.id} className="app-card flex min-h-[270px] flex-col p-6">
              <div className="mb-5 flex items-start gap-3">
                <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[9px]" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}><ClipboardList size={18} /></span>
                <div className="min-w-0 flex-1"><h2 className="font-bold">{template.title}</h2><p className="mt-1.5 line-clamp-3 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>{template.description || 'No description provided.'}</p></div>
                {isAdmin && <div className="flex gap-1"><button onClick={() => startEdit(template)} className="icon-button !h-8 !w-8" aria-label={`Edit ${template.title}`}><Pencil size={13} /></button><button onClick={() => remove(template)} className="icon-button !h-8 !w-8 hover:!text-[var(--red)]" aria-label={`Delete ${template.title}`}><Trash2 size={13} /></button></div>}
              </div>
              <div className="mb-5 flex flex-wrap gap-2"><span className="meta-pill">{template.section}</span><span className="meta-pill">{template.priority}</span><span className="meta-pill"><ListChecks size={12} /> {template.checklist?.length || 0} items</span></div>
              {template.checklist?.length > 0 && <div className="mb-5 space-y-2 border-t pt-4" style={{ borderColor: 'var(--border)' }}>{template.checklist.slice(0, 3).map((item) => <div key={item} className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}><span className="mt-1 h-1.5 w-1.5 flex-none rounded-full" style={{ background: 'var(--accent)' }} />{item}</div>)}</div>}
              <div className="mt-auto flex items-center justify-between gap-3 border-t pt-4" style={{ borderColor: 'var(--border)' }}><button onClick={() => startUse(template)} disabled={!boards.length} className="btn btn-secondary !min-h-9 !px-3"><Play size={13} /> Use template</button>{template.reference_url && <a href={template.reference_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--accent)' }}>Reference <ExternalLink size={12} /></a>}</div>
            </article>
          ))}
        </div>
      ) : (
        <div className="app-card card-empty min-h-[300px]"><div><ClipboardList className="mx-auto mb-4" size={28} style={{ color: 'var(--accent)' }} /><h2 className="font-bold">No templates yet</h2><p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>{isAdmin ? 'Create the first reusable workflow for your team.' : 'Templates will appear here when an admin adds them.'}</p>{isAdmin && <button onClick={startCreate} className="btn btn-secondary mt-5"><Plus size={15} /> Create first template</button>}</div></div>
      )}

      <Modal open={open} onClose={() => !saving && setOpen(false)} title={editing ? 'Edit template' : 'Create template'} size="lg">
        <form onSubmit={save}>
          <div className="grid gap-5 p-6 sm:grid-cols-2">
            <Field label="Template name" className="sm:col-span-2"><input autoFocus required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="form-control" placeholder="e.g. Weekly performance report" /></Field>
            <Field label="Description" className="sm:col-span-2"><textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="form-control py-3" placeholder="Explain when and how this template should be used." /></Field>
            <Field label="Default section"><select value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value as TaskSection })} className="form-control"><option value="IMMINENT">Imminent</option><option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option></select></Field>
            <Field label="Default priority"><select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })} className="form-control"><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option></select></Field>
            <Field label="Checklist items" className="sm:col-span-2"><textarea rows={5} value={form.checklist} onChange={(e) => setForm({ ...form, checklist: e.target.value })} className="form-control py-3" placeholder={'Collect source files\nPrepare first draft\nComplete final QA'} /><p className="form-hint">One item per line.</p></Field>
            <Field label="Reference link" className="sm:col-span-2"><input type="url" value={form.referenceUrl} onChange={(e) => setForm({ ...form, referenceUrl: e.target.value })} className="form-control" placeholder="https://drive.google.com/..." /></Field>
            {error && <p className="sm:col-span-2 text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
          </div>
          <div className="modal-actions"><button type="button" onClick={() => setOpen(false)} className="btn btn-secondary">Cancel</button><button disabled={saving || !form.title.trim()} className="btn btn-primary">{saving && <Loader2 className="animate-spin" size={15} />}{editing ? 'Save changes' : 'Create template'}</button></div>
        </form>
      </Modal>
      <Modal open={!!usingTemplate} onClose={() => !saving && setUsingTemplate(null)} title="Create task from template" size="md">
        {usingTemplate && <form onSubmit={createFromTemplate}><div className="space-y-5 p-6"><div className="rounded-[10px] border p-4" style={{ background: 'var(--surface2)', borderColor: 'var(--border)' }}><p className="text-sm font-bold">{usingTemplate.title}</p><p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>{usingTemplate.section} · {usingTemplate.priority} · {usingTemplate.checklist.length} checklist items</p></div><Field label="Board"><select required value={useForm.boardId} onChange={(e) => { const boardId = e.target.value; const workspaceId = boards.find((board) => board.id === boardId)?.workspace_id; setUseForm({ ...useForm, boardId, assigneeId: members.find((member) => member.workspace_id === workspaceId)?.profiles?.id || '' }) }} className="form-control"><option value="">Choose a board</option>{boards.map((board) => <option key={board.id} value={board.id}>{board.workspaces?.name ? `${board.workspaces.name} · ` : ''}{board.name === 'Team Board' ? 'Workspace Board' : board.name}</option>)}</select></Field><Field label="Assignee"><select required value={useForm.assigneeId} onChange={(e) => setUseForm({ ...useForm, assigneeId: e.target.value })} className="form-control"><option value="">Choose a teammate</option>{availableMembers.map((member) => member.profiles && <option key={member.profiles.id} value={member.profiles.id}>{member.profiles.full_name || member.profiles.email}</option>)}</select></Field><Field label="Deadline (optional)"><input type="datetime-local" value={useForm.deadline} onChange={(e) => setUseForm({ ...useForm, deadline: e.target.value })} className="form-control" /></Field>{error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}</div><div className="modal-actions"><button type="button" onClick={() => setUsingTemplate(null)} className="btn btn-secondary">Cancel</button><button disabled={saving || !useForm.boardId || !useForm.assigneeId} className="btn btn-primary">{saving && <Loader2 className="animate-spin" size={15} />}Create task</button></div></form>}
      </Modal>
    </>
  )
}

function Field({ label, className = '', children }: { label: string; className?: string; children: React.ReactNode }) {
  return <label className={className}><span className="form-label">{label}</span>{children}</label>
}
