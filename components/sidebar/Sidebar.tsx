'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Profile, Board, Notification, getLevelInfo } from '@/lib/types'
import { getInitials } from '@/lib/utils'
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
  const [mobileOpen, setMobileOpen] = useState(false)
  const unreadCount = notifications.length
  const kanbanBoards = boards.filter((board) => board.type === 'kanban')
  const levelInfo = profile ? getLevelInfo(profile.xp) : null

  const navItem = (href: string, label: string, icon: React.ReactNode, badge?: number) => {
    const active = pathname === href || pathname.startsWith(`${href}/`)
    return (
      <Link
        key={href}
        href={href}
        onClick={() => setMobileOpen(false)}
        aria-current={active ? 'page' : undefined}
        className="group flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-sm font-semibold transition-colors"
        style={{
          background: active ? 'var(--surface2)' : 'transparent',
          color: active ? 'var(--text)' : 'var(--muted)',
        }}
      >
        <span>{icon}</span>
        <span className="flex-1 truncate">{label}</span>
        {active && !badge && <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: 'var(--accent)' }} />}
        {!!badge && <span className="min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] font-extrabold" style={{ background: 'var(--accent)', color: '#0b0d09' }}>{badge}</span>}
      </Link>
    )
  }

  const groupLabel = (label: string) => (
    <p className="mb-2 mt-5 px-3 text-[10px] font-extrabold uppercase tracking-[0.18em] first:mt-0" style={{ color: 'rgba(244,240,230,.38)' }}>{label}</p>
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
        className={`fixed inset-y-0 left-0 z-50 flex w-[272px] flex-none flex-col border-r shadow-[20px_0_60px_rgba(0,0,0,0.22)] transition-transform duration-200 lg:static lg:z-0 lg:translate-x-0 lg:shadow-none ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ background: 'rgba(14,18,13,.98)', borderColor: 'var(--border)' }}
      >
        <div className="flex h-[86px] items-center justify-between px-5">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[11px] text-base font-extrabold" style={{ background: 'linear-gradient(135deg,#eadb8c,#bda54c)', color: '#0b0d09', boxShadow: '0 8px 22px rgba(216,195,106,.16)' }}>S</span>
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-extrabold tracking-[-.02em]">Safari To-Dos</span>
              <span className="block text-[10px] font-bold uppercase tracking-[.14em]" style={{ color: 'var(--muted)' }}>Safari Studios</span>
            </span>
          </Link>
          <button className="icon-button lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={17} /></button>
        </div>

        <div className="px-4 pb-4">
          <WorkspaceSwitcher workspaces={workspaces} canManage={profile?.role === 'admin'} />
        </div>

        <nav className="flex-1 overflow-y-auto px-4 pb-5">
          {groupLabel('Workspace')}
          {navItem('/dashboard', 'Overview', <Home size={17} />)}
          {kanbanBoards.map((board) => navItem(`/board/${board.id}`, board.name, <LayoutGrid size={17} />))}
          {kanbanBoards.length === 0 && (
            <Link href="/settings" className="mx-1 mt-1 block rounded-[10px] border border-dashed px-3 py-3 text-xs leading-5" style={{ borderColor: 'var(--border-strong)', color: 'var(--muted)' }}>
              No team board yet. Set up your workspace.
            </Link>
          )}
          {navItem('/calendar', 'Calendar', <Calendar size={17} />)}

          {groupLabel('Tools')}
          {navItem('/quests', 'Quests', <Trophy size={17} />)}
          {navItem('/templates', 'Templates', <ClipboardList size={17} />)}
          {navItem('/private', 'My private tasks', <Lock size={17} />)}

          {groupLabel('Activity')}
          {navItem('/notifications', 'Notifications', <Bell size={17} />, unreadCount)}
          {navItem('/archive', 'Archive', <Archive size={17} />)}

          {profile?.role === 'admin' && <>{groupLabel('Administration')}{navItem('/audit', 'Audit log', <ShieldCheck size={17} />)}{navItem('/settings', 'Settings', <Settings size={17} />)}</>}
        </nav>

        {profile && (
          <div className="border-t p-4" style={{ borderColor: 'var(--border)' }}>
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full text-xs font-extrabold" style={{ background: 'var(--accent)', color: '#0b0d09' }}>{getInitials(profile.full_name || profile.email)}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{profile.full_name || 'User'}</p>
                <p className="truncate text-[11px]" style={{ color: 'var(--muted)' }}>{levelInfo?.current.title} · {profile.xp} XP</p>
              </div>
              <span className="rounded-md px-2 py-1 text-[10px] font-extrabold" style={{ background: 'rgba(216,195,106,.1)', color: 'var(--accent)', border: '1px solid rgba(216,195,106,.22)' }}>L{levelInfo?.current.level}</span>
            </div>
            {levelInfo && <XPBar progress={levelInfo.progress} nextLevel={levelInfo.next?.title} />}
          </div>
        )}
      </aside>
    </>
  )
}
