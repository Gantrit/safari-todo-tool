'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Profile, Board, Notification, getLevelInfo } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { Bell, Archive, Calendar, Settings, Lock, LayoutGrid, Trophy, ClipboardList, ShieldCheck, Menu, X, Home, RefreshCw } from 'lucide-react'
import WorkspaceSwitcher from './WorkspaceSwitcher'
import XPBar from '../ui/XPBar'
import { getInitials } from '@/lib/utils'

interface SidebarProps {
  profile: Profile | null
  workspaces: Array<{ id: string; name: string }>
  boards: Board[]
  notifications: Notification[]
}

export default function Sidebar({ profile, workspaces, boards, notifications }: SidebarProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [refreshing, startRefresh] = useTransition()
  const unreadCount = notifications.length
  const kanbanBoards = boards.filter((board) => board.type === 'kanban')
  const activeBoardId = pathname.match(/^\/board\/([^/]+)/)?.[1]
  const activeBoard = kanbanBoards.find((board) => board.id === activeBoardId)
  const selectedWorkspaceId = activeBoard?.workspace_id || searchParams.get('workspace') || workspaces[0]?.id
  const workspaceBoards = kanbanBoards.filter((board) => board.workspace_id === selectedWorkspaceId)
  const levelInfo = profile ? getLevelInfo(profile.xp) : null

  const handleLogout = async () => {
    setLoggingOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const navItem = (href: string, label: string, icon: React.ReactNode, badge?: number) => {
    const active = pathname === href || pathname.startsWith(`${href}/`)
    return (
      <Link
        key={href}
        href={href}
        onClick={() => setMobileOpen(false)}
        aria-current={active ? 'page' : undefined}
        className={`nav-item mb-1 flex min-h-10 items-center gap-3 rounded-[8px] px-3 py-2.5 text-[13.5px] font-semibold ${active ? 'active' : ''}`}
      >
        <span style={{ opacity: active ? 1 : 0.7 }}>{icon}</span>
        <span className="flex-1 truncate">{label}</span>
        {!!badge && <span className="min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] font-extrabold" style={{ background: 'var(--accent)', color: '#0b0d09' }}>{badge}</span>}
        {active && !badge && <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: 'var(--accent)' }} />}
      </Link>
    )
  }

  const groupLabel = (label: string) => (
    <p className="section-label mb-2.5 mt-6 px-3 first:mt-0">{label}</p>
  )

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b px-4 lg:hidden" style={{ background: 'rgba(12,15,11,.94)', borderColor: 'var(--border)', backdropFilter: 'blur(18px)' }}>
        <Link href="/dashboard" className="flex items-center gap-2.5 font-extrabold">
          <span className="flex h-8 w-8 items-center justify-center rounded-[9px] text-sm" style={{ background: 'var(--accent)', color: '#0b0d09' }}>S</span>
          Safari To-Dos
        </Link>
        <button className="icon-button" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={19} /></button>
      </header>

      {mobileOpen && <button aria-label="Close navigation" className="fixed inset-0 z-40 bg-black/70 lg:hidden" onClick={() => setMobileOpen(false)} />}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[256px] flex-none flex-col border-r transition-transform duration-200 lg:static lg:z-0 lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
      >
        <div className="flex min-h-[84px] items-center justify-between gap-3 border-b px-5" style={{ borderColor: 'var(--border)' }}>
          <Link href="/dashboard" className="min-w-0">
            <span className="block truncate text-[16px] font-extrabold tracking-[-0.01em]">Safari To-Dos</span>
            <span className="mt-1 block text-[10.5px] font-medium" style={{ color: 'var(--muted)' }}>Task Tracker · v0.2-workspace</span>
          </Link>
          <button className="icon-button !h-8 !w-8 hidden lg:inline-flex" onClick={() => startRefresh(() => router.refresh())} aria-label="Refresh workspace data" title="Refresh workspace data"><RefreshCw className={refreshing ? 'animate-spin' : ''} size={14} /></button>
          <button className="icon-button lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={16} /></button>
        </div>

        <div className="px-4 pt-4">
          <WorkspaceSwitcher workspaces={workspaces} boards={kanbanBoards} selectedWorkspaceId={selectedWorkspaceId} canManage={profile?.role === 'admin'} />
        </div>

        <nav className="flex-1 overflow-y-auto px-4 py-5">
          {navItem('/dashboard', 'Overview', <Home size={16} />)}

          {groupLabel('Boards')}
          {workspaceBoards.map((board) => navItem(`/board/${board.id}`, board.name === 'Team Board' ? `${workspaces.find((workspace) => workspace.id === selectedWorkspaceId)?.name || 'Workspace'} Board` : board.name, <LayoutGrid size={16} />))}
          {navItem('/calendar', 'Calendar', <Calendar size={16} />)}

          {groupLabel('Tools')}
          {navItem('/quests', 'Quests', <Trophy size={16} />)}
          {navItem('/templates', 'Templates', <ClipboardList size={16} />)}
          {navItem('/private', 'My private tasks', <Lock size={16} />)}

          {groupLabel('Activity')}
          {navItem('/notifications', 'Notifications', <Bell size={16} />, unreadCount)}
          {navItem('/archive', 'Archive', <Archive size={16} />)}

          {profile?.role === 'admin' && <>{groupLabel('Administration')}{navItem('/audit', 'Audit log', <ShieldCheck size={16} />)}{navItem('/settings', 'Settings', <Settings size={16} />)}</>}
        </nav>

        {profile && (
          <div className="sidebar-footer flex-none border-t" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full text-xs font-extrabold" style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--border-strong)' }}>{getInitials(profile.full_name || profile.email)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-bold">{profile.full_name || 'Safari teammate'}</span>
                <span className="mt-0.5 block truncate text-[10.5px]" style={{ color: 'var(--muted)' }}>{profile.email}</span>
              </span>
            </div>
            {levelInfo && (
              <div className="sidebar-progress">
                <div className="mb-2.5 flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-bold" style={{ color: 'var(--text-secondary)' }}>L{levelInfo.current.level} {levelInfo.current.title}</span>
                  <span className="font-bold" style={{ color: 'var(--accent)' }}>{profile.xp} XP</span>
                </div>
                <XPBar progress={levelInfo.progress} nextLevel={levelInfo.next?.title} />
              </div>
            )}
            <div className="sidebar-account-meta"><span>Account</span><span>{profile.role}</span></div>
            <button onClick={handleLogout} disabled={loggingOut} className="btn btn-secondary min-h-10 w-full">
              {loggingOut ? 'Logging out…' : 'Logout'}
            </button>
          </div>
        )}
      </aside>
    </>
  )
}
