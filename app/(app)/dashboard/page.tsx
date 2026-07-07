import { createClient } from '@/lib/supabase/server'
import { getLevelInfo, normalizeRole } from '@/lib/types'
import { deadlineLabel, getInitials, isOverdue } from '@/lib/utils'
import { AlertTriangle, ArrowRight, Bell, CheckCircle2, ClipboardCheck, Gauge, LayoutGrid, Sparkles, Trophy } from 'lucide-react'
import EmptyState from '@/components/ui/EmptyState'
import Link from 'next/link'

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ workspace?: string }> }) {
  const { workspace: requestedWorkspaceId } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const [{ data: profile }, { data: leaderboard }, { data: myTasks }, { data: allOpenTasks }, { data: boards }, { data: workspaces }, { data: notifications }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user!.id).single(),
    supabase.from('profiles').select('id, full_name, email, xp, level').order('xp', { ascending: false }).limit(10),
    supabase.from('tasks').select('*').eq('assigned_to', user!.id).is('deleted_at', null).neq('status', 'APPROVED').order('deadline_at', { ascending: true, nullsFirst: false }).limit(8),
    supabase.from('tasks').select('id, title, status, priority, section, deadline_at, due_date, assigned_to, board_id').is('deleted_at', null).neq('status', 'APPROVED').limit(100),
    supabase.from('boards').select('*').eq('type', 'kanban').order('created_at', { ascending: true }),
    supabase.from('workspaces').select('id, name').order('created_at', { ascending: true }),
    supabase.from('notifications').select('*').eq('user_id', user!.id).eq('read', false).order('created_at', { ascending: false }).limit(5),
  ])

  const levelInfo = getLevelInfo(profile?.xp || 0)
  const role = normalizeRole(profile?.role)
  const openTasks = allOpenTasks || []
  const overdueTasks = openTasks.filter((task: any) => isOverdue(task.deadline_at || task.due_date))
  const pendingApproval = openTasks.filter((task: any) => task.status === 'DONE')
  const selectedWorkspace = workspaces?.find((workspace) => workspace.id === requestedWorkspaceId) || workspaces?.[0]
  const board = boards?.find((candidate) => candidate.workspace_id === selectedWorkspace?.id) || boards?.[0]

  // Admin clicking "Awaiting approval" should land on the submission whose
  // deadline is nearest, regardless of assignee — sort DONE tasks by deadline.
  const nextApproval = [...pendingApproval].sort((a: any, b: any) => {
    const da = a.deadline_at || a.due_date
    const db = b.deadline_at || b.due_date
    return (da ? new Date(da).getTime() : Infinity) - (db ? new Date(db).getTime() : Infinity)
  })[0] as any
  const firstOverdue = overdueTasks[0] as any

  const metrics = [
    {
      label: 'Open tasks', value: openTasks.length, detail: 'Across your team boards', icon: <ClipboardCheck size={14} />, tone: 'var(--text)', alert: false,
      href: board ? `/board/${board.id}?member=me` : null,
    },
    {
      label: 'Overdue', value: overdueTasks.length, detail: overdueTasks.length ? 'Needs attention today' : 'Everything is on track', icon: <AlertTriangle size={14} />, tone: overdueTasks.length ? 'var(--red)' : 'var(--green)', alert: overdueTasks.length > 0,
      href: firstOverdue?.board_id ? `/board/${firstOverdue.board_id}?urgency=overdue` : board ? `/board/${board.id}?urgency=overdue` : null,
    },
    {
      label: 'Awaiting approval', value: pendingApproval.length, detail: 'Completed and ready to review', icon: <CheckCircle2 size={14} />, tone: 'var(--text)', alert: false,
      href: role === 'admin' && nextApproval?.board_id
        ? `/board/${nextApproval.board_id}?task=${nextApproval.id}`
        : board ? `/board/${board.id}?status=DONE` : null,
    },
  ]

  return (
    <div className="page-shell">
      <header className="page-header dashboard-header">
        <div>
          <p className="page-eyebrow">{selectedWorkspace?.name || 'Workspace'} overview</p>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-description">{role === 'admin' ? 'Track delivery, approvals and team momentum from one place.' : 'Your tasks, deadlines and progress in one place.'}</p>
        </div>
        {board && (
          <Link href={`/board/${board.id}`} className="btn btn-primary self-start xl:self-auto"><LayoutGrid size={17} /> Open {board.name} <ArrowRight size={16} /></Link>
        )}
      </header>

      {overdueTasks.length > 0 ? (
        <section className="attention-banner">
          <div className="icon-chip is-danger" style={{ width: 44, height: 44 }}><AlertTriangle size={20} /></div>
          <div className="min-w-0 flex-1">
            <p className="attention-title">{overdueTasks.length} {overdueTasks.length === 1 ? 'task is' : 'tasks are'} overdue</p>
            <p className="attention-sub">These have passed their deadline and need attention before anything else.</p>
          </div>
          {board && <Link href={`/board/${board.id}`} className="btn btn-primary flex-none">Review now <ArrowRight size={15} /></Link>}
        </section>
      ) : pendingApproval.length > 0 && role === 'admin' ? (
        <section className="attention-banner is-review">
          <div className="icon-chip" style={{ width: 44, height: 44 }}><CheckCircle2 size={20} /></div>
          <div className="min-w-0 flex-1">
            <p className="attention-title">{pendingApproval.length} {pendingApproval.length === 1 ? 'submission is' : 'submissions are'} awaiting approval</p>
            <p className="attention-sub">Completed work is ready for your review and XP award.</p>
          </div>
          {board && <Link href={`/board/${board.id}`} className="btn btn-primary flex-none">Review <ArrowRight size={15} /></Link>}
        </section>
      ) : null}

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

      {/* Every KPI tile is a link into its detail view (progress → character,
          open → own tasks on the board, overdue → overdue filter, approval →
          the nearest-deadline submission). */}
      <section className="dashboard-metrics grid md:grid-cols-2 xl:grid-cols-4">
        <Link href="/character" className="app-card dashboard-kpi xp-hero transition-colors hover:border-[var(--border-strong)]" aria-label="Open my character">
          <div className="flex items-center justify-between gap-2"><span className="metric-label">Your progress</span><Gauge size={16} style={{ color: 'var(--muted)' }} /></div>
          <div>
            <div className="mb-2 flex items-end justify-between gap-2.5">
              <div className="flex items-end gap-2.5"><strong className="metric-value" style={{ color: 'var(--accent)' }}>{profile?.xp || 0}</strong><span className="pb-0.5 text-xs font-semibold" style={{ color: 'var(--accent)' }}>XP</span></div>
              <span className="xp-rank-badge">{levelInfo.current.title}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full" style={{ background: 'var(--surface3)' }}><div className="xp-bar-live h-full rounded-full" style={{ width: `${Math.min(levelInfo.progress, 100)}%` }} /></div>
            <p className="metric-description mt-3 flex items-center justify-between gap-2">
              <span>Level {levelInfo.current.level}</span>
              <span style={{ color: 'var(--text-secondary)' }}>{Math.max(0, levelInfo.next.min - (profile?.xp || 0))} XP to Level {levelInfo.next.level}</span>
            </p>
          </div>
        </Link>
        {metrics.map((metric) => {
          const inner = (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="metric-label" style={metric.alert ? { color: 'var(--red)' } : undefined}>{metric.label}</span>
                <span className={`icon-chip ${metric.alert ? 'is-danger' : 'is-muted'}`} style={{ width: 28, height: 28 }}>{metric.icon}</span>
              </div>
              <div>
                <strong className="metric-value" style={{ color: metric.tone }}>{metric.value}</strong>
                <p className="metric-description mt-4">{metric.detail}</p>
              </div>
            </>
          )
          const style = metric.alert ? { borderColor: 'rgba(240,85,90,0.32)', background: 'radial-gradient(130% 130% at 100% 0%, rgba(240,85,90,0.10), transparent 55%), var(--surface)' } : undefined
          return metric.href ? (
            <Link key={metric.label} href={metric.href} className="app-card dashboard-kpi transition-colors hover:border-[var(--border-strong)]" style={style} aria-label={`Open ${metric.label}`}>
              {inner}
            </Link>
          ) : (
            <article key={metric.label} className="app-card dashboard-kpi" style={style}>
              {inner}
            </article>
          )
        })}
      </section>

      <section className="dashboard-primary-grid grid items-stretch xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,.75fr)]">
        <article className="app-card dashboard-panel">
          <div className="card-header"><div><h2 className="text-[15px] font-bold">My tasks</h2><p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>Your next actions, sorted by deadline</p></div>{board && <Link href={`/board/${board.id}`} className="text-xs font-bold" style={{ color: 'var(--accent)' }}>View board →</Link>}</div>
          {myTasks?.length ? (
            <div>
              {myTasks.map((task) => {
                const overdue = isOverdue(task.deadline_at || task.due_date)
                return (
                  <div
                    key={task.id}
                    className="dashboard-row grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
                    style={overdue ? { boxShadow: 'inset 3px 0 0 var(--red)', background: 'rgba(240,85,90,0.05)' } : undefined}
                  >
                    <div className="flex min-w-0 items-center gap-3.5">
                      <span className="h-2 w-2 flex-none rounded-full" style={{ background: task.priority === 'HIGH' ? 'var(--red)' : task.priority === 'MEDIUM' ? 'var(--amber)' : 'var(--green)' }} />
                      <span className={`truncate text-[13.5px] ${overdue ? 'font-bold' : 'font-semibold'}`} style={overdue ? undefined : { color: 'var(--text-secondary)' }}>{task.title}</span>
                    </div>
                    <span className="meta-pill w-fit !min-h-7 uppercase tracking-[.06em]">{task.status.replace('_', ' ')}</span>
                    <span className="text-xs font-bold sm:min-w-24 sm:text-right" style={{ color: overdue ? 'var(--red)' : 'var(--muted)' }}>{deadlineLabel(task.deadline_at || task.due_date)}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <EmptyState tone="accent" icon={<CheckCircle2 size={24} style={{ color: 'var(--green)' }} />} title="All clear" text="You have no active assigned tasks right now." />
          )}
        </article>

        <article className="app-card dashboard-panel">
          <div className="card-header"><div><h2 className="text-[15px] font-bold">Unread notifications</h2><p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>Updates needing your attention</p></div><Bell size={18} style={{ color: 'var(--accent)' }} /></div>
          {notifications?.length ? <div>{notifications.map((notification: any) => <div key={notification.id} className="dashboard-row"><p className="text-[13px] leading-5">{notification.message}</p><p className="mt-2 text-[9.5px] font-bold uppercase tracking-[.1em]" style={{ color: 'var(--muted)' }}>{notification.type.replaceAll('_', ' ')}</p></div>)}</div> : <EmptyState tone="muted" icon={<Bell size={22} />} title="Inbox clear" text="You’re all caught up. New team activity will appear here." />}
          <div className="mt-auto border-t p-4" style={{ borderColor: 'var(--border)' }}><Link href="/notifications" className="btn btn-secondary w-full">View notifications</Link></div>
        </article>
      </section>

      <Link href="/leaderboard" className="app-card group flex items-center gap-4 !p-5 transition-colors hover:border-[var(--border-strong)]">
        <span className="icon-chip flex-none" style={{ width: 42, height: 42 }}><Trophy size={19} style={{ color: 'var(--accent)' }} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-bold">Team leaderboard</span>
          <span className="mt-0.5 block text-xs" style={{ color: 'var(--muted)' }}>All-time, weekly and monthly standings</span>
        </span>
        {(leaderboard || []).slice(0, 3).map((member, index) => (
          <span key={member.id} className="hidden h-9 w-9 flex-none items-center justify-center rounded-full text-[11px] font-extrabold sm:flex" style={{ background: index === 0 ? 'var(--accent)' : 'var(--surface3)', color: index === 0 ? '#0b0d09' : 'var(--text)', marginLeft: index ? -8 : 0, border: '2px solid var(--surface)' }}>{getInitials(member.full_name || member.email)}</span>
        ))}
        <ArrowRight size={17} className="flex-none transition-transform group-hover:translate-x-0.5" style={{ color: 'var(--accent)' }} />
      </Link>
    </div>
  )
}
