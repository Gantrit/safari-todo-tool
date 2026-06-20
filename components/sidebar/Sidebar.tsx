'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { Profile, Board, Notification, getLevelInfo } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { Bell, Archive, Calendar, Settings, Lock, LayoutGrid, Trophy, ClipboardList, ShieldCheck, Menu, X, Home } from 'lucide-react'
import WorkspaceSwitcher from './WorkspaceSwitcher'
import XPBar from '../ui/XPBar'

interface SidebarProps {
  profile: Profile | null
  workspaces: Array<{ workspace_id?: string; role?: string; workspaces: { id: string; name: string } | Array<{ id: string; name: string }> | null } | { id: string; name: string }>
  boards: Board[]
  notifications: Notification[]
}

export default function Sidebar({ profile, workspaces, boards, notifications }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const unreadCount = notifications.length
  const kanbanBoards = boards.filter((board) => board.type === 'kanban')
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
        className={`nav-item mb-0.5 flex items-center gap-[10px] rounded-[6px] px-3 py-[9px] text-[13px] font-medium ${active ? 'active' : ''}`}
      >
        <span style={{ opacity: active ? 1 : 0.7 }}>{icon}</span>
        <span className="flex-1 truncate">{label}</span>
        {!!badge && <span className="min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] font-extrabold" style={{ background: 'var(--accent)', color: '#0b0d09' }}>{badge}</span>}
        {active && !badge && <span className="h-[7px] w-[7px] flex-none rounded-full" style={{ background: 'var(--accent)' }} />}
      </Link>
    )
  }

  const groupLabel = (label: string) => (
    <p className="mb-[6px] mt-3 px-3 text-[10px] uppercase tracking-[0.1em] first:mt-0" style={{ color: 'var(--muted)' }}>{label}</p>
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
        className={`fixed inset-y-0 left-0 z-50 flex w-[220px] flex-none flex-col border-r transition-transform duration-200 lg:static lg:z-0 lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center justify-between border-b px-[22px] pb-[18px] pt-6" style={{ borderColor: 'var(--border)' }}>
          <Link href="/dashboard" className="min-w-0">
            <span className="block truncate text-[15px] font-bold tracking-[0.02em]">Safari To-Dos</span>
            <span className="mt-[3px] block text-[11px]" style={{ color: 'var(--muted)' }}>Safari Studios</span>
          </Link>
          <button className="icon-button lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={16} /></button>
        </div>

        <div className="px-3 pt-3">
          <WorkspaceSwitcher workspaces={workspaces} canManage={profile?.role === 'admin'} />
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {navItem('/dashboard', 'Overview', <Home size={16} />)}

          {groupLabel('Workspace')}
          {kanbanBoards.map((board) => navItem(`/board/${board.id}`, board.name, <LayoutGrid size={16} />))}
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
          <div className="border-t px-[22px] py-[14px]" style={{ borderColor: 'var(--border)' }}>
            <p className="truncate text-[11px]" style={{ color: 'var(--text)' }}>{profile.email}</p>
            <p className="mb-2.5 mt-1 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: 'var(--muted)' }}>{profile.role}</p>
            {levelInfo && (
              <div className="mb-3">
                <div className="mb-1.5 flex items-center justify-between text-[11px]" style={{ color: 'var(--muted)' }}>
                  <span>L{levelInfo.current.level} {levelInfo.current.title}</span>
                  <span>{profile.xp} XP</span>
                </div>
                <XPBar progress={levelInfo.progress} nextLevel={levelInfo.next?.title} />
              </div>
            )}
            <button onClick={handleLogout} disabled={loggingOut} className="btn btn-secondary w-full !min-h-9">
              {loggingOut ? 'Logging out…' : 'Logout'}
            </button>
          </div>
        )}
      </aside>
    </>
  )
}
