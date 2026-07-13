'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Profile, Board, Notification, getLevelInfo, canManageTeam } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { Bell, Archive, Calendar, Settings, Lock, LayoutGrid, Trophy, ClipboardList, ShieldCheck, Menu, X, Home, RefreshCw, Swords, Medal, Crown, UserCog, FileBarChart2, FilePlus2 } from 'lucide-react'
import XPBar from '../ui/XPBar'
import Avatar from '../ui/Avatar'
import { APP_VERSION } from '@/lib/version'

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
        className={`nav-item mb-0.5 flex min-h-9 items-center gap-2.5 rounded-[9px] border border-transparent px-3 py-1.5 text-[12.5px] font-semibold ${active ? 'active' : ''}`}
      >
        <span className="flex h-5 w-5 flex-none items-center justify-center" style={{ opacity: active ? 1 : 0.7, color: active ? 'var(--accent)' : undefined }}>{icon}</span>
        <span className="flex-1 truncate">{label}</span>
        {!!badge && <span className="min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] font-extrabold" style={{ background: 'var(--accent)', color: '#0b0d09' }}>{badge}</span>}
      </Link>
    )
  }

  const groupLabel = (label: string) => (
    <p className="section-label mb-1.5 mt-3.5 px-3 first:mt-0">{label}</p>
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
        className={`fixed inset-y-0 left-0 z-50 flex w-[228px] flex-none flex-col border-r transition-transform duration-200 lg:static lg:z-0 lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
      >
        <div className="sidebar-brand-block flex items-center justify-between gap-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <Link href="/dashboard" className="min-w-0 flex-1">
            <span className="block truncate text-[17px] font-extrabold tracking-[-0.015em]">Safari To-Dos</span>
            <span className="mt-1 block text-[10.5px] font-medium" style={{ color: 'var(--muted)' }}>{APP_VERSION}</span>
          </Link>
          {/* NB: `hidden`/`lg:hidden` display utilities lose against the unlayered
              `.icon-button { display:inline-flex }` in globals.css, so visibility is
              handled in JSX: the close button only exists while the mobile drawer is open. */}
          {mobileOpen ? (
            <button className="icon-button !h-9 !w-9 flex-none" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={16} /></button>
          ) : (
            <button className="icon-button !h-9 !w-9 flex-none" onClick={() => startRefresh(() => router.refresh())} aria-label="Refresh workspace data" title="Refresh workspace data"><RefreshCw className={refreshing ? 'animate-spin' : ''} size={15} /></button>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-3.5 py-3">
          {navItem('/dashboard', 'Overview', <Home size={16} />)}

          {groupLabel('Boards')}
          {workspaceBoards.map((board) => navItem(`/board/${board.id}`, board.name === 'Team Board' ? `${workspaces.find((workspace) => workspace.id === selectedWorkspaceId)?.name || 'Workspace'} Board` : board.name, <LayoutGrid size={16} />))}
          {navItem('/calendar', 'Calendar', <Calendar size={16} />)}

          {groupLabel('Progress')}
          {navItem('/character', 'My character', <Swords size={16} />)}
          {navItem('/quests', 'Quests', <Trophy size={16} />)}
          {navItem('/leaderboard', 'Leaderboard', <Medal size={16} />)}

          {groupLabel('Tools')}
          {navItem('/templates', 'Templates', <ClipboardList size={16} />)}
          {/* Everyone can file a shift report — the form is the public /submit-report page,
              not gated on board access. Admins/managers additionally get the review list below.
              Opens in a new tab so navigating there doesn't lose your place in the app. */}
          <a
            href="/submit-report"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setMobileOpen(false)}
            className="nav-item mb-0.5 flex min-h-9 items-center gap-2.5 rounded-[9px] border border-transparent px-3 py-1.5 text-[12.5px] font-semibold"
          >
            <span className="flex h-5 w-5 flex-none items-center justify-center" style={{ opacity: 0.7 }}><FilePlus2 size={16} /></span>
            <span className="flex-1 truncate">Submit report</span>
          </a>
          {canManageTeam(profile?.role) && navItem('/reports', 'Shift Reports', <FileBarChart2 size={16} />)}
          {navItem('/private', 'My private tasks', <Lock size={16} />)}

          {groupLabel('Activity')}
          {navItem('/notifications', 'Notifications', <Bell size={16} />, unreadCount)}
          {navItem('/archive', 'Archive', <Archive size={16} />)}

          {groupLabel('Account')}
          {navItem('/account', 'Account settings', <UserCog size={16} />)}

          {profile?.role === 'admin' && <>{groupLabel('Administration')}{navItem('/guild', 'Guild Hall', <Crown size={16} />)}{navItem('/audit', 'Audit log', <ShieldCheck size={16} />)}{navItem('/settings', 'Settings', <Settings size={16} />)}</>}
        </nav>

        {profile && (
          <div className="sidebar-footer flex-none border-t" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
            <div className="flex min-w-0 items-center gap-3">
              <Avatar name={profile.full_name || profile.email} src={profile.avatar_url} size={40} />
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
                <XPBar
                  progress={levelInfo.progress}
                  nextLevel={levelInfo.next.title !== levelInfo.current.title
                    ? `${levelInfo.next.title} at Level ${levelInfo.next.level}`
                    : `Level ${levelInfo.next.level} · ${Math.max(0, levelInfo.next.min - profile.xp)} XP to go`}
                />
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
