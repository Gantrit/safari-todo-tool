'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Profile } from '@/lib/types'
import { Trash2, Plus, UserPlus } from 'lucide-react'

interface SettingsFormProps {
  workspace: any
  members: any[]
  boards: any[]
  currentUser: Profile
}

export default function SettingsForm({ workspace, members, boards, currentUser }: SettingsFormProps) {
  const [wsName, setWsName] = useState(workspace?.name || '')
  const [inviteEmail, setInviteEmail] = useState('')
  const [driveUrl, setDriveUrl] = useState('')
  const [newBoardName, setNewBoardName] = useState('')
  const [saving, setSaving] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const supabase = createClient()
  const router = useRouter()

  const inputStyle = {
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    borderRadius: '8px',
    minHeight: '44px',
    padding: '10px 13px',
    fontSize: '14px',
    width: '100%',
    outline: 'none',
  }

  async function createWorkspace() {
    if (!wsName.trim()) return
    setSaving(true)
    setMessage(null)
    const { data: workspaceId, error } = await supabase.rpc('create_workspace_with_defaults', {
      p_name: wsName.trim(),
    })
    if (error || !workspaceId) {
      setMessage({ text: error?.message || 'Failed to create workspace', type: 'error' })
      setSaving(false)
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  async function saveWorkspaceName() {
    if (!workspace?.id || !wsName.trim()) return
    setSaving(true)
    await supabase.from('workspaces').update({ name: wsName.trim() }).eq('id', workspace.id)
    setMessage({ text: 'Workspace name updated', type: 'success' })
    router.refresh()
    setSaving(false)
  }

  async function inviteUser() {
    if (!inviteEmail.trim()) return
    setInviting(true)
    const res = await fetch('/api/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail.trim(), workspaceId: workspace?.id }),
    })
    if (res.ok) {
      setMessage({ text: `Invite sent to ${inviteEmail}`, type: 'success' })
      setInviteEmail('')
    } else {
      setMessage({ text: 'Failed to send invite', type: 'error' })
    }
    setInviting(false)
  }

  async function addBoard() {
    if (!newBoardName.trim() || !workspace?.id) return
    await supabase.from('boards').insert({
      workspace_id: workspace.id,
      name: newBoardName.trim(),
      type: 'kanban',
    })
    setNewBoardName('')
    router.refresh()
  }

  async function deleteBoard(boardId: string) {
    if (!confirm('Delete this board and all its tasks?')) return
    await supabase.from('boards').delete().eq('id', boardId)
    router.refresh()
  }

  async function removeMember(memberId: string) {
    if (!workspace?.id || memberId === currentUser.id) return
    if (!confirm('Remove this member from the workspace?')) return
    await supabase.from('workspace_members').delete().eq('user_id', memberId).eq('workspace_id', workspace.id)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      {message && (
        <div
          className="p-3 rounded-[8px] text-sm"
          style={{ background: message.type === 'success' ? 'rgba(200,240,96,0.1)' : 'rgba(255,92,92,0.1)', color: message.type === 'success' ? 'var(--accent)' : 'var(--red)', border: `1px solid ${message.type === 'success' ? 'rgba(200,240,96,0.2)' : 'rgba(255,92,92,0.2)'}` }}
        >
          {message.text}
        </div>
      )}

      {/* Workspace name */}
      <section className="app-card p-5 sm:p-6">
        <h2 className="mb-1 text-base font-bold">{workspace ? 'Workspace name' : 'Start a new workspace'}</h2>
        <p className="mb-4 text-xs leading-5" style={{ color: 'var(--muted)' }}>{workspace ? 'This name appears in the sidebar for every member.' : 'A Team Board will be created automatically so you can start assigning work.'}</p>
        <div className="flex gap-2">
          <input value={wsName} onChange={(e) => setWsName(e.target.value)} placeholder="Safari Studios" style={inputStyle} />
          <button
            onClick={workspace ? saveWorkspaceName : createWorkspace}
            disabled={saving || !wsName.trim()}
            className="btn btn-primary flex-shrink-0"
          >
            {saving ? 'Saving…' : workspace ? 'Save changes' : 'Create Workspace'}
          </button>
        </div>
      </section>

      {!workspace ? null : <>

      {/* Google Drive URL */}
      <section className="app-card p-5 sm:p-6">
        <h2 className="text-base font-semibold mb-1" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>
          Google Drive Default URL
        </h2>
        <p className="text-xs mb-3" style={{ color: 'var(--muted)' }}>Appears as quick-link on task cards</p>
        <input
          value={driveUrl}
          onChange={(e) => setDriveUrl(e.target.value)}
          placeholder="https://drive.google.com/..."
          style={inputStyle}
        />
      </section>

      {/* Invite user */}
      <section className="app-card p-5 sm:p-6">
        <h2 className="text-base font-semibold mb-3" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>
          Invite User
        </h2>
        <div className="flex gap-2">
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="user@example.com"
            style={inputStyle}
          />
          <button
            onClick={inviteUser}
            disabled={inviting}
            className="px-4 py-2 text-sm font-semibold rounded-[8px] flex-shrink-0 flex items-center gap-1.5 disabled:opacity-50"
            style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}
          >
            <UserPlus size={14} />
            Invite
          </button>
        </div>
      </section>

      {/* Members */}
      <section className="app-card p-5 sm:p-6">
        <h2 className="text-base font-semibold mb-3" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>
          Members
        </h2>
        <div className="space-y-2">
          {members.map((m: any) => (
            <div
              key={m.user_id}
              className="flex items-center gap-3 p-3 rounded-[8px]"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}
            >
              <div className="flex-1">
                <p className="text-sm" style={{ color: 'var(--text)' }}>{m.profiles?.full_name || m.profiles?.email}</p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>{m.role}</p>
              </div>
              {m.user_id !== currentUser.id && (
                <button
                  onClick={() => removeMember(m.user_id)}
                  className="p-1.5 rounded hover:opacity-70 transition-opacity"
                  style={{ color: 'var(--red)' }}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Boards */}
      <section className="app-card p-5 sm:p-6">
        <h2 className="text-base font-semibold mb-3" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>
          Boards
        </h2>
        <div className="space-y-2 mb-3">
          {boards.map((b) => (
            <div
              key={b.id}
              className="flex items-center gap-3 p-3 rounded-[8px]"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}
            >
              <p className="flex-1 text-sm" style={{ color: 'var(--text)' }}>{b.name}</p>
              <span className="text-xs" style={{ color: 'var(--muted)' }}>{b.type}</span>
              <button
                onClick={() => deleteBoard(b.id)}
                className="p-1.5 rounded hover:opacity-70 transition-opacity"
                style={{ color: 'var(--red)' }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newBoardName}
            onChange={(e) => setNewBoardName(e.target.value)}
            placeholder="New board name..."
            style={inputStyle}
          />
          <button
            onClick={addBoard}
            className="px-3 py-2 text-sm rounded-[8px] flex-shrink-0 flex items-center gap-1.5"
            style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}
          >
            <Plus size={14} />
            Add
          </button>
        </div>
      </section>
      </>}
    </div>
  )
}
