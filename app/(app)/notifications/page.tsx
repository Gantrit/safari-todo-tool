import { createClient } from '@/lib/supabase/server'
import { Bell } from 'lucide-react'
import MarkAllRead from './MarkAllRead'
import NotificationList, { type NotificationItem } from './NotificationList'

export default async function NotificationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: notifications } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })
    .limit(50)

  const raw = notifications || []
  const unread = raw.filter((n) => !n.read).length

  // Resolve each task's board so a notification can deep-link to the task modal
  // (/board/<board_id>?task=<task_id>). One batched lookup, then a map.
  const taskIds = Array.from(new Set(raw.map((n) => n.task_id).filter(Boolean))) as string[]
  const boardByTask = new Map<string, string | null>()
  if (taskIds.length > 0) {
    const { data: tasks } = await supabase.from('tasks').select('id, board_id').in('id', taskIds)
    for (const t of tasks || []) boardByTask.set(t.id, t.board_id ?? null)
  }

  const hrefFor = (taskId: string | null): string | null => {
    if (!taskId) return '/dashboard'
    const boardId = boardByTask.get(taskId)
    // Board task → open its modal. Task gone/private → land on the dashboard so
    // the click still takes you somewhere useful rather than doing nothing.
    return boardId ? `/board/${boardId}?task=${taskId}` : '/dashboard'
  }

  const items: NotificationItem[] = raw.map((n) => ({
    id: n.id,
    type: n.type,
    message: n.message,
    created_at: n.created_at,
    read: n.read,
    href: hrefFor(n.task_id ?? null),
  }))

  return (
    <div className="page-shell !max-w-[860px]">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Activity</p>
          <h1 className="page-title">Notifications</h1>
          <p className="page-description">{unread ? `${unread} unread update${unread === 1 ? '' : 's'} waiting for you.` : 'You are all caught up.'}</p>
        </div>
        {items.length > 0 && <MarkAllRead userId={user!.id} unread={unread} total={items.length} />}
      </header>

      <section className="app-card">
        {items.length === 0 ? (
          <div className="card-empty min-h-[280px]">
            <div>
              <Bell className="mx-auto mb-4" size={28} style={{ color: 'var(--muted)' }} />
              <h2 className="font-bold">No notifications yet</h2>
              <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>Team activity that concerns you will appear here.</p>
            </div>
          </div>
        ) : (
          <NotificationList items={items} />
        )}
      </section>
    </div>
  )
}
