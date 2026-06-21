import { createClient } from '@/lib/supabase/server'
import { getLevelInfo, normalizeRole } from '@/lib/types'
import { deadlineLabel, getInitials, isOverdue } from '@/lib/utils'
import { AlertTriangle, ArrowRight, Bell, CheckCircle2, ClipboardCheck, Gauge, LayoutGrid, Sparkles, Trophy } from 'lucide-react'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const [{ data: profile }, { data: leaderboard }, { data: myTasks }, { data: allOpenTasks }, { data: boards }, { data: notifications }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user!.id).single(),
    supabase.from('profiles').select('id, full_name, email, xp, level').order('xp', { ascending: false }).limit(10),
    supabase.from('tasks').select('*').eq('assigned_to', user!.id).neq('status', 'APPROVED').order('deadline_at', { ascending: true, nullsFirst: false }).limit(8),
    supabase.from('tasks').select('id, title, status, priority, section, deadline_at, due_date, assigned_to').is('deleted_at', null).neq('status', 'APPROVED').limit(100),
    supabase.from('boards').select('*').eq('type', 'kanban').order('created_at', { ascending: true }),
    supabase.from('notifications').select('*').eq('user_id', user!.id).eq('read', false).order('created_at', { ascending: false }).limit(5),
  ])

  const levelInfo = getLevelInfo(profile?.xp || 0)
  const role = normalizeRole(profile?.role)
  const openTasks = allOpenTasks || []
  const overdueTasks = openTasks.filter((task: any) => isOverdue(task.deadline_at || task.due_date))
  const pendingApproval = openTasks.filter((task: any) => task.status === 'DONE')
  const board = boards?.[0]

  const metrics = [
    { label: 'Open tasks', value: openTasks.length, detail: 'Across your team boards', icon: <ClipboardCheck size={14} />, tone: 'var(--text)' },
    { label: 'Overdue', value: overdueTasks.length, detail: overdueTasks.length ? 'Needs attention today' : 'Everything is on track', icon: <AlertTriangle size={14} />, tone: overdueTasks.length ? 'var(--red)' : 'var(--green)' },
    { label: 'Awaiting approval', value: pendingApproval.length, detail: 'Completed and ready to review', icon: <CheckCircle2 size={14} />, tone: 'var(--text)' },
  ]

  return (
    <div className="page-shell">
      <header className="page-header dashboard-header">
        <div>
          <p className="page-eyebrow">Workspace overview</p>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-description">{role === 'admin' ? 'Track delivery, approvals and team momentum from one place.' : 'Your tasks, deadlines and progress in one place.'}</p>
        </div>
        {board && (
          <Link href={`/board/${board.id}`} className="btn btn-primary self-start xl:self-auto"><LayoutGrid size={17} /> Open team board <ArrowRight size={16} /></Link>
        )}
      </header>

      {!board && (
        <section className="app-card onboarding-card">
          <div className="onboarding-icon"><Sparkles size={21} /></div>
          <div className="min-w-0 flex-1">
            <p className="page-eyebrow">Getting started</p>
            <h2 className="text-[21px] font-extrabold tracking-[-.03em]">Set up your workspace</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 muted-text">Create your team workspace and open the first board. You’ll be ready to assign work, review submissions and track progress.</p>
          </div>
          <Link href="/settings" className="btn btn-primary flex-none"><LayoutGrid size={17} /> Create workspace <ArrowRight size={15} /></Link>
        </section>
      )}

      <section className="dashboard-metrics grid md:grid-cols-2 xl:grid-cols-4">
        <article className="app-card dashboard-kpi">
          <div className="flex items-center justify-between gap-2"><span className="metric-label">Your progress</span><Gauge size={16} style={{ color: 'var(--muted)' }} /></div>
          <div>
            <div className="mb-4 flex items-end gap-2.5"><strong className="metric-value">{profile?.xp || 0}</strong><span className="pb-0.5 text-xs font-semibold" style={{ color: 'var(--accent)' }}>XP</span></div>
            <div className="h-2 overflow-hidden rounded-full" style={{ background: 'var(--surface3)' }}><div className="h-full rounded-full" style={{ width: `${levelInfo.progress}%`, background: 'var(--accent)' }} /></div>
            <p className="metric-description mt-3">Level {levelInfo.current.level} · {levelInfo.current.title}{levelInfo.next ? ` · ${levelInfo.next.title} next` : ''}</p>
          </div>
        </article>
        {metrics.map((metric) => <article key={metric.label} className="app-card dashboard-kpi"><div className="flex items-center justify-between gap-2"><span className="metric-label">{metric.label}</span><span style={{ color: 'var(--muted)' }}>{metric.icon}</span></div><div><strong className="metric-value" style={{ color: metric.tone }}>{metric.value}</strong><p className="metric-description mt-4">{metric.detail}</p></div></article>)}
      </section>

      <section className="dashboard-primary-grid grid items-stretch xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,.75fr)]">
        <article className="app-card dashboard-panel">
          <div className="card-header"><div><h2 className="text-[15px] font-bold">My tasks</h2><p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>Your next actions, sorted by deadline</p></div>{board && <Link href={`/board/${board.id}`} className="text-xs font-bold" style={{ color: 'var(--accent)' }}>View board →</Link>}</div>
          {myTasks?.length ? <div>{myTasks.map((task) => <div key={task.id} className="dashboard-row grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"><div className="flex min-w-0 items-center gap-3.5"><span className="h-2 w-2 flex-none rounded-full" style={{ background: task.priority === 'HIGH' ? 'var(--red)' : task.priority === 'MEDIUM' ? 'var(--amber)' : 'var(--green)' }} /><span className="truncate text-[13.5px] font-semibold">{task.title}</span></div><span className="meta-pill w-fit !min-h-7 uppercase tracking-[.06em]">{task.status.replace('_', ' ')}</span><span className="text-xs font-medium sm:min-w-24 sm:text-right" style={{ color: isOverdue(task.deadline_at || task.due_date) ? 'var(--red)' : 'var(--muted)' }}>{deadlineLabel(task.deadline_at || task.due_date)}</span></div>)}</div> : <div className="card-empty"><div><CheckCircle2 className="mx-auto mb-4" size={30} style={{ color: 'var(--green)' }} /><h3 className="font-bold">All clear</h3><p className="mt-1.5 text-sm" style={{ color: 'var(--muted)' }}>You have no active assigned tasks.</p></div></div>}
        </article>

        <article className="app-card dashboard-panel">
          <div className="card-header"><div><h2 className="text-[15px] font-bold">Unread notifications</h2><p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>Updates needing your attention</p></div><Bell size={18} style={{ color: 'var(--accent)' }} /></div>
          {notifications?.length ? <div>{notifications.map((notification: any) => <div key={notification.id} className="dashboard-row"><p className="text-[13px] leading-5">{notification.message}</p><p className="mt-2 text-[9.5px] font-bold uppercase tracking-[.1em]" style={{ color: 'var(--muted)' }}>{notification.type.replaceAll('_', ' ')}</p></div>)}</div> : <div className="card-empty"><div><Bell className="mx-auto mb-4" size={28} style={{ color: 'var(--muted)' }} /><h3 className="font-bold">Inbox clear</h3><p className="mt-1.5 text-sm" style={{ color: 'var(--muted)' }}>You’re all caught up. New team activity will appear here.</p></div></div>}
          <div className="mt-auto border-t p-4" style={{ borderColor: 'var(--border)' }}><Link href="/notifications" className="btn btn-secondary w-full">View notifications</Link></div>
        </article>
      </section>

      <section className="app-card dashboard-leaderboard">
        <div className="card-header !justify-start"><Trophy size={19} style={{ color: 'var(--accent)' }} /><div><h2 className="text-[15px] font-bold">Team leaderboard</h2><p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>Cumulative XP across Safari Studios</p></div></div>
        {leaderboard?.length ? (
          <div>{leaderboard.map((member, index) => { const info = getLevelInfo(member.xp); const isMe = member.id === user!.id; return <div key={member.id} className="dashboard-row flex items-center gap-4" style={{ background: isMe ? 'var(--accent-dim)' : undefined }}><span className="w-7 text-center text-xs font-extrabold" style={{ color: index < 3 ? 'var(--accent)' : 'var(--muted)' }}>#{index + 1}</span><span className="flex h-10 w-10 flex-none items-center justify-center rounded-full text-xs font-extrabold" style={{ background: isMe ? 'var(--accent)' : 'var(--surface3)', color: isMe ? '#0b0d09' : 'var(--text)' }}>{getInitials(member.full_name || member.email)}</span><span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-bold">{member.full_name || member.email}{isMe && <em className="ml-2 rounded px-1.5 py-0.5 text-[9px] not-italic uppercase tracking-wider" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>you</em>}</span><span className="mt-0.5 block text-[11px]" style={{ color: 'var(--muted)' }}>Level {info.current.level} · {info.current.title}</span></span><strong className="text-sm" style={{ color: 'var(--accent)' }}>{member.xp} XP</strong></div>})}</div>
        ) : (
          <div className="card-empty"><p className="text-sm" style={{ color: 'var(--muted)' }}>No XP earned yet. Approved tasks will show up here.</p></div>
        )}
      </section>
    </div>
  )
}
