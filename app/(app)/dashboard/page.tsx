import { createClient } from '@/lib/supabase/server'
import { getLevelInfo, normalizeRole } from '@/lib/types'
import { deadlineLabel, getInitials, isOverdue } from '@/lib/utils'
import { AlertTriangle, ArrowRight, Bell, CheckCircle2, ClipboardCheck, Gauge, LayoutGrid, Trophy } from 'lucide-react'
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

  const levelInfo = profile ? getLevelInfo(profile.xp) : null
  const role = normalizeRole(profile?.role)
  const openTasks = allOpenTasks || []
  const overdueTasks = openTasks.filter((task: any) => isOverdue(task.deadline_at || task.due_date))
  const pendingApproval = openTasks.filter((task: any) => task.status === 'DONE')
  const board = boards?.[0]

  const metrics = [
    { label: 'Open tasks', value: openTasks.length, detail: 'Across your team boards', icon: <ClipboardCheck size={18} />, tone: 'var(--blue)' },
    { label: 'Overdue', value: overdueTasks.length, detail: overdueTasks.length ? 'Needs attention today' : 'Everything is on track', icon: <AlertTriangle size={18} />, tone: overdueTasks.length ? 'var(--red)' : 'var(--green)' },
    { label: 'Awaiting approval', value: pendingApproval.length, detail: 'Completed and ready to review', icon: <CheckCircle2 size={18} />, tone: 'var(--accent)' },
  ]

  return (
    <div className="mx-auto max-w-[1440px] px-5 py-7 sm:px-8 lg:px-10 lg:py-10">
      <header className="mb-8 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="mb-2 text-[11px] font-extrabold uppercase tracking-[.2em]" style={{ color: 'var(--accent)' }}>Safari Studios · Team operations</p>
          <h1 className="text-3xl font-extrabold tracking-[-.04em] sm:text-4xl">{role === 'admin' ? 'Command center' : 'Your work, at a glance'}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 sm:text-base" style={{ color: 'var(--muted)' }}>Track active work, clear approvals, and keep the team moving without losing the details.</p>
        </div>
        {board ? (
          <Link href={`/board/${board.id}`} className="btn btn-primary self-start xl:self-auto"><LayoutGrid size={17} /> Open team board <ArrowRight size={16} /></Link>
        ) : (
          <Link href="/settings" className="btn btn-primary self-start xl:self-auto"><LayoutGrid size={17} /> Set up workspace <ArrowRight size={16} /></Link>
        )}
      </header>

      {!board && (
        <section className="app-card mb-6 flex flex-col gap-5 border-dashed p-6 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-bold">Your team board is not configured yet</h2><p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>Create a workspace and first board, then invite your team from Settings.</p></div>
          <Link href="/settings" className="btn btn-secondary flex-none">Open setup</Link>
        </section>
      )}

      <section className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="app-card min-h-[178px] p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-[.12em]" style={{ color: 'var(--muted)' }}>Your progress</span><Gauge size={18} style={{ color: 'var(--accent)' }} /></div>
          <div className="mb-4 flex items-end gap-2"><strong className="text-4xl tracking-[-.04em]" style={{ color: 'var(--accent)' }}>{profile?.xp || 0}</strong><span className="pb-1 text-xs font-bold" style={{ color: 'var(--muted)' }}>XP · L{levelInfo?.current.level} {levelInfo?.current.title}</span></div>
          <div className="h-2 overflow-hidden rounded-full" style={{ background: 'var(--surface3)' }}><div className="h-full rounded-full" style={{ width: `${levelInfo?.progress || 0}%`, background: 'linear-gradient(90deg,var(--accent),#f1df8a)' }} /></div>
          <p className="mt-2 text-[11px]" style={{ color: 'var(--muted)' }}>{levelInfo?.next ? `${levelInfo.next.title} is your next rank` : 'Top rank achieved'}</p>
        </article>
        {metrics.map((metric) => <article key={metric.label} className="app-card min-h-[178px] p-5 sm:p-6"><div className="mb-5 flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-[.12em]" style={{ color: 'var(--muted)' }}>{metric.label}</span><span style={{ color: metric.tone }}>{metric.icon}</span></div><strong className="block text-4xl tracking-[-.04em]" style={{ color: metric.tone }}>{metric.value}</strong><p className="mt-3 text-sm" style={{ color: 'var(--muted)' }}>{metric.detail}</p></article>)}
      </section>

      <section className="mb-6 grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
        <article className="app-card overflow-hidden">
          <div className="flex items-center justify-between border-b px-5 py-4 sm:px-6" style={{ borderColor: 'var(--border)' }}><div><h2 className="font-bold">My tasks</h2><p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>Your next actions, sorted by deadline</p></div>{board && <Link href={`/board/${board.id}`} className="text-xs font-bold" style={{ color: 'var(--accent)' }}>View board →</Link>}</div>
          {myTasks?.length ? <div>{myTasks.map((task) => <div key={task.id} className="grid gap-2 border-b px-5 py-4 last:border-0 sm:grid-cols-[1fr_auto_auto] sm:items-center sm:px-6" style={{ borderColor: 'var(--border)' }}><div className="flex min-w-0 items-center gap-3"><span className="h-2 w-2 flex-none rounded-full" style={{ background: task.priority === 'HIGH' ? 'var(--red)' : task.priority === 'MEDIUM' ? 'var(--amber)' : 'var(--green)' }} /><span className="truncate text-sm font-semibold">{task.title}</span></div><span className="w-fit rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wide" style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>{task.status.replace('_', ' ')}</span><span className="text-xs sm:min-w-24 sm:text-right" style={{ color: isOverdue(task.deadline_at || task.due_date) ? 'var(--red)' : 'var(--muted)' }}>{deadlineLabel(task.deadline_at || task.due_date)}</span></div>)}</div> : <div className="px-6 py-12 text-center"><CheckCircle2 className="mx-auto mb-3" size={28} style={{ color: 'var(--green)' }} /><h3 className="font-bold">All clear</h3><p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>You have no active assigned tasks.</p></div>}
        </article>

        <article className="app-card overflow-hidden">
          <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--border)' }}><div><h2 className="font-bold">Unread notifications</h2><p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>Updates needing your attention</p></div><Bell size={17} style={{ color: 'var(--accent)' }} /></div>
          {notifications?.length ? <div className="divide-y" style={{ borderColor: 'var(--border)' }}>{notifications.map((notification: any) => <div key={notification.id} className="px-5 py-4"><p className="text-sm leading-5">{notification.message}</p><p className="mt-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>{notification.type.replaceAll('_', ' ')}</p></div>)}</div> : <div className="px-5 py-12 text-center"><p className="text-sm" style={{ color: 'var(--muted)' }}>You are all caught up.</p></div>}
          <div className="border-t p-3" style={{ borderColor: 'var(--border)' }}><Link href="/notifications" className="btn btn-secondary w-full !min-h-10">View notifications</Link></div>
        </article>
      </section>

      <section className="app-card overflow-hidden">
        <div className="flex items-center gap-3 border-b px-5 py-4 sm:px-6" style={{ borderColor: 'var(--border)' }}><Trophy size={18} style={{ color: 'var(--accent)' }} /><div><h2 className="font-bold">Team leaderboard</h2><p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>Cumulative XP across Safari Studios</p></div></div>
        <div className="grid gap-px md:grid-cols-2" style={{ background: 'var(--border)' }}>{(leaderboard || []).map((member, index) => { const info = getLevelInfo(member.xp); const isMe = member.id === user!.id; return <div key={member.id} className="flex items-center gap-3 px-5 py-4 sm:px-6" style={{ background: isMe ? '#1c2118' : 'var(--surface)' }}><span className="w-5 text-center text-xs font-extrabold" style={{ color: index < 3 ? 'var(--accent)' : 'var(--muted)' }}>#{index + 1}</span><span className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-extrabold" style={{ background: isMe ? 'var(--accent)' : 'var(--surface3)', color: isMe ? '#0b0d09' : 'var(--text)' }}>{getInitials(member.full_name || member.email)}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{member.full_name || member.email}{isMe && <em className="ml-1 not-italic" style={{ color: 'var(--accent)' }}>you</em>}</span><span className="text-[11px]" style={{ color: 'var(--muted)' }}>Level {info.current.level} · {info.current.title}</span></span><strong className="text-sm" style={{ color: 'var(--accent)' }}>{member.xp} XP</strong></div>})}</div>
      </section>
    </div>
  )
}
