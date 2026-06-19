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
      <p className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--muted)' }}>
        Comments ({comments.length})
      </p>

      <div className="space-y-4 mb-4">
        {comments.map((comment) => {
          const reactionCounts = EMOJIS.reduce((acc, emoji) => {
            acc[emoji] = (comment.reactions || []).filter((r) => r.emoji === emoji).length
            return acc
          }, {} as Record<string, number>)

          return (
            <div key={comment.id}>
              <div className="flex items-start gap-2.5">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5"
                  style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}
                >
                  {getInitials(comment.profile?.full_name || comment.profile?.email || '?')}
                </div>
                <div className="flex-1">
                  <div className="flex items-baseline gap-2 mb-1">
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
                  <div className="flex items-center gap-1 mt-2">
                    {EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => addReaction(comment.id, emoji)}
                        className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs transition-all hover:opacity-70"
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

      <form onSubmit={addComment} className="flex gap-2">
        <input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write a comment..."
          className="flex-1 px-3 py-2 text-sm rounded-[8px] outline-none"
          style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
        />
        <button
          type="submit"
          disabled={loading || !content.trim()}
          className="p-2 rounded-[8px] disabled:opacity-50 transition-opacity"
          style={{ background: 'var(--accent)', color: '#0e0e0e' }}
        >
          <Send size={14} />
        </button>
      </form>
    </div>
  )
}
