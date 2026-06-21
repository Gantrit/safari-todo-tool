'use client'

import { useState } from 'react'
import { Comment, Profile } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { formatRelative, getInitials } from '@/lib/utils'
import { Send } from 'lucide-react'

const EMOJIS = ['👍', '👎', '❤️', '✅']

interface CommentSectionProps {
  taskId: string
  comments: Comment[]
  currentUser: Profile
}

export default function CommentSection({ taskId, comments: initial, currentUser }: CommentSectionProps) {
  const [comments, setComments] = useState<Comment[]>(initial)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  async function addComment(e: React.FormEvent) {
    e.preventDefault()
    if (!content.trim()) return
    setLoading(true)
    const { data } = await supabase
      .from('comments')
      .insert({ task_id: taskId, user_id: currentUser.id, content: content.trim() })
      .select('*, profile:profiles(*)')
      .single()
    if (data) {
      setComments((prev) => [...prev, data as Comment])
      setContent('')
    }
    setLoading(false)
  }

  async function addReaction(commentId: string, emoji: string) {
    const existing = comments
      .find((c) => c.id === commentId)
      ?.reactions?.find((r) => r.user_id === currentUser.id && r.emoji === emoji)

    if (existing) {
      await supabase.from('reactions').delete().eq('id', existing.id)
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId
            ? { ...c, reactions: (c.reactions || []).filter((r) => r.id !== existing.id) }
            : c
        )
      )
    } else {
      const { data } = await supabase
        .from('reactions')
        .insert({ comment_id: commentId, user_id: currentUser.id, emoji })
        .select('*')
        .single()
      if (data) {
        setComments((prev) =>
          prev.map((c) =>
            c.id === commentId ? { ...c, reactions: [...(c.reactions || []), data] } : c
          )
        )
      }
    }
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5"><span style={{ color: 'var(--accent)' }}><Send size={14} /></span><h3 className="text-[13px] font-bold">Comments &amp; activity</h3></div>
        <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: 'var(--surface3)', color: 'var(--muted)' }}>{comments.length}</span>
      </div>

      <div className="mb-5 space-y-3">
        {comments.length === 0 && <div className="rounded-[10px] border border-dashed px-4 py-5 text-center text-xs leading-5" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>No activity yet. Add context or a progress note below.</div>}
        {comments.map((comment) => {
          const reactionCounts = EMOJIS.reduce((acc, emoji) => {
            acc[emoji] = (comment.reactions || []).filter((r) => r.emoji === emoji).length
            return acc
          }, {} as Record<string, number>)

          return (
            <div key={comment.id} className="rounded-[10px] border p-4" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
              <div className="flex items-start gap-3">
                <div
                  className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold"
                  style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--border-strong)' }}
                >
                  {getInitials(comment.profile?.full_name || comment.profile?.email || '?')}
                </div>
                <div className="flex-1">
                  <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-xs font-semibold" style={{ color: 'var(--text)' }}>
                      {comment.profile?.full_name || 'User'}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--muted)' }}>
                      {formatRelative(comment.created_at)}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text)' }}>
                    {comment.content}
                  </p>
                  <div className="mt-3 flex items-center gap-1">
                    {EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => addReaction(comment.id, emoji)}
                        className="flex min-h-6 items-center gap-0.5 rounded-full px-2 text-xs transition-colors hover:border-[var(--border-strong)]"
                        style={{
                          background: reactionCounts[emoji] > 0 ? 'var(--surface2)' : 'transparent',
                          border: '1px solid var(--border)',
                        }}
                      >
                        {emoji}
                        {reactionCounts[emoji] > 0 && (
                          <span style={{ color: 'var(--muted)' }}>{reactionCounts[emoji]}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <form onSubmit={addComment} className="flex items-center gap-2.5 rounded-[11px] border p-2" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <span className="ml-1 flex h-8 w-8 flex-none items-center justify-center rounded-full text-[10px] font-extrabold" style={{ background: 'var(--surface3)', color: 'var(--text-secondary)' }}>{getInitials(currentUser.full_name || currentUser.email)}</span>
        <input value={content} onChange={(e) => setContent(e.target.value)} placeholder="Add a comment or progress note..." className="min-h-10 min-w-0 flex-1 bg-transparent px-2 text-sm outline-none" style={{ color: 'var(--text)' }} />
        <button
          type="submit"
          disabled={loading || !content.trim()}
          className="flex h-10 w-10 flex-none items-center justify-center rounded-[9px] disabled:opacity-40"
          style={{ background: 'var(--accent)', color: '#0e0e0e' }}
          aria-label="Post comment"
        >
          <Send size={15} />
        </button>
      </form>
    </div>
  )
}
