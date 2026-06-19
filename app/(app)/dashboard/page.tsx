import { createClient } from '@/lib/supabase/server'
import { getLevelInfo, normalizeRole } from '@/lib/types'
import { deadlineLabel, getInitials, isOverdue } from '@/lib/utils'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user!.id)
    .single()

  const { data: leaderboard } = await supabase
    .from('profiles')
    .select('id, full_name, email, xp, level')
    .order('xp', { ascending: false })
    .limit(10)

  const { data: myTasks } = await supabase
    .from('tasks')
    .select('*')
    .eq('assigned_to', user!.id)
    .neq('status', 'APPROVED')
    .order('deadline_at', { ascending: true, nullsFirst: false })
    .limit(8)

  const { data: allOpenTasks } = await supabase
    .from('tasks')
    .select('id, title, status, priority, section, deadline_at, due_date, assigned_to')
    .is('deleted_at', null)
    .neq('status', 'APPROVED')
    .limit(100)

  const { data: boards } = await supabase
    .from('boards')
    .select('*')
    .eq('type', 'kanban')
    .order('created_at', { ascending: true })

  const { data: notifications } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user!.id)
    .eq('read', false)
    .order('created_at', { ascending: false })
    .limit(5)

  const levelInfo = profile ? getLevelInfo(profile.xp) : null
  const role = normalizeRole(profile?.role)
  const openTasks = allOpenTasks || []
  const overdueTasks = openTasks.filter((task: any) => isOverdue(task.deadline_at || task.due_date))
  const pendingApproval = openTasks.filter((task: any) => task.status === 'DONE')
  const boardHref = boards?.[0]?.id ? `/board/${boards[0].id}` : '/settings'

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--accent)' }}>Safari To-Dos V1</p>
          <h1 className="text-3xl font-bold mb-1" style={{ color: 'var(--text)' }}>
            {role === 'admin' ? 'Admin Command Center' : 'My Tasks'}
          </h1>
          <p style={{ color: 'var(--muted)' }}>Here are the to-dos, deadlines, approvals, and pings that need attention.</p>
        </div>
        <Link href={boardHref} className="rounded-[8px] px-4 py-2 text-sm font-semibold" style={{ background: 'var(--accent)', color: '#070907' }}>
          Open team board
        </Link>
      </div>

      <div className="grid gap-4 mb-8 md:grid-cols-2 xl:grid-cols-4">
        {/* XP Card */}
        <div className="p-5 rounded-[8px]" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--muted)' }}>Your XP</p>
          <div className="flex items-end gap-2 mb-3">
            <span className="text-4xl font-bold" style={{ color: 'var(--accent)' }}>
              {profile?.xp || 0}
            </span>
            <span className="text-sm mb-1" style={{ color: 'var(--muted)' }}>XP</span>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <span
              className="text-xs px-2 py-0.5 rounded font-bold"
              style={{ background: 'var(--surface2)', color: 'var(--accent)', border: '1px solid var(--accent)' }}
            >
              L{levelInfo?.current.level} {levelInfo?.current.title}
            </span>
          </div>
          {levelInfo && (
            <div>
              <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--muted)' }}>
                <span>{levelInfo.current.title}</span>
                {levelInfo.next && <span>{levelInfo.next.title}</span>}
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface2)' }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${levelInfo.progress}%`, background: 'var(--accent)' }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="p-5 rounded-[8px]" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--muted)' }}>Open Tasks</p>
          <p className="text-4xl font-bold" style={{ color: 'var(--text)' }}>{openTasks.length}</p>
          <p className="text-sm mt-2" style={{ color: 'var(--muted)' }}>Across visible boards</p>
        </div>

        <div className="p-5 rounded-[8px]" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--muted)' }}>Overdue</p>
          <p className="text-4xl font-bold" style={{ color: overdueTasks.length ? 'var(--red)' : 'var(--green)' }}>{overdueTasks.length}</p>
          <p className="text-sm mt-2" style={{ color: 'var(--muted)' }}>Requires admin review if missed</p>
        </div>

        <div className="p-5 rounded-[8px]" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--muted)' }}>Approval Pending</p>
          <p className="text-4xl font-bold" style={{ color: pendingApproval.length ? 'var(--accent)' : 'var(--text)' }}>{pendingApproval.length}</p>
          <p className="text-sm mt-2" style={{ color: 'var(--muted)' }}>Done tasks waiting for admin</p>
        </div>
      </div>

      <div className="grid gap-4 mb-8 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="p-5 rounded-[8px]" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--muted)' }}>My Active Tasks</p>
          </div>
          {myTasks && myTasks.length > 0 ? (
            <div className="space-y-2">
              {myTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-3 py-2 border-b"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{
                      background: task.priority === 'HIGH' ? 'var(--red)' : task.priority === 'MEDIUM' ? 'var(--amber)' : 'var(--muted)',
                    }}
                  />
                  <span className="flex-1 text-sm truncate" style={{ color: 'var(--text)' }}>{task.title}</span>
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>{task.status.replace('_', ' ')}</span>
                  <span className="text-xs" style={{ color: isOverdue(task.deadline_at || task.due_date) ? 'var(--red)' : 'var(--muted)' }}>{deadlineLabel(task.deadline_at || task.due_date)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>No active tasks</p>
          )}
        </div>

        <div className="p-5 rounded-[8px]" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="text-xs uppercase tracking-wider mb-4" style={{ color: 'var(--muted)' }}>Unread Notifications</p>
          {(notifications || []).length > 0 ? (
            <div className="space-y-3">
              {(notifications || []).map((notification: any) => (
                <div key={notification.id} className="rounded-[8px] p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                  <p className="text-sm" style={{ color: 'var(--text)' }}>{notification.message}</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{notification.type.replaceAll('_', ' ')}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>No unread notifications.</p>
          )}
        </div>
      </div>

      {/* Leaderboard */}
      <div className="p-5 rounded-[8px]" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <p className="text-xs uppercase tracking-wider mb-4" style={{ color: 'var(--muted)' }}>Leaderboard</p>
        <div className="space-y-2">
          {(leaderboard || []).map((member, i) => {
            const info = getLevelInfo(member.xp)
            const isMe = member.id === user!.id
            return (
              <div
                key={member.id}
                className="flex items-center gap-3 py-2 rounded-[8px] px-3"
                style={{
                  background: isMe ? 'rgba(200,240,96,0.05)' : 'transparent',
                  border: isMe ? '1px solid rgba(200,240,96,0.15)' : '1px solid transparent',
                }}
              >
                <span
                  className="w-5 text-sm font-bold text-center"
                  style={{ color: i === 0 ? 'var(--accent)' : i === 1 ? 'var(--amber)' : 'var(--muted)' }}
                >
                  {i + 1}
                </span>
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{ background: isMe ? 'var(--accent)' : 'var(--surface2)', color: isMe ? '#0e0e0e' : 'var(--text)' }}
                >
                  {getInitials(member.full_name || member.email)}
                </div>
                <div className="flex-1">
                  <p className="text-sm" style={{ color: 'var(--text)' }}>
                    {member.full_name || member.email}
                    {isMe && <span className="ml-1 text-xs" style={{ color: 'var(--accent)' }}>(you)</span>}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>L{info.current.level} {info.current.title}</p>
                </div>
                <span className="text-sm font-bold" style={{ color: 'var(--accent)' }}>{member.xp} XP</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
