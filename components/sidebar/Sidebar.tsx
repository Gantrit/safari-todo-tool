'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Profile, Board, Notification, getLevelInfo } from '@/lib/types'
import { getInitials } from '@/lib/utils'
import { Bell, Archive, Calendar, Settings, Lock, LayoutGrid, ChevronRight, Trophy, ClipboardList, ShieldCheck } from 'lucide-react'
import WorkspaceSwitcher from './WorkspaceSwitcher'
import XPBar from '../ui/XPBar'

interface SidebarProps {
  profile: Profile | null
  workspaces: any[]
  boards: Board[]
  notifications: Notification[]
}

export default function Sidebar({ profile, workspaces, boards, notifications }: SidebarProps) {
  const pathname = usePathname()
  const [privateOpen, setPrivateOpen] = useState(false)
  const unreadCount = notifications.length

  const kanbanBoards = boards.filter((b) => b.type === 'kanban')

  const navItem = (href: string, label: string, icon: React.ReactNode, badge?: number) => {
    const active = pathname === href || pathname.startsWith(href + '/')
    return (
      <Link
        key={href}
        href={href}
        className="flex items-center gap-2.5 px-3 py-2 rounded-[8px] text-sm transition-all group"
        style={{
          background: active ? 'var(--surface2)' : 'transparent',
          color: active ? 'var(--text)' : 'var(--muted)',
        }}
      >
        <span className="w-4 h-4 flex-shrink-0">{icon}</span>
        <span className="flex-1 truncate">{label}</span>
        {badge !== undefined && badge > 0 && (
          <span
            className="text-xs px-1.5 py-0.5 rounded-full"
            style={{ background: 'var(--accent)', color: '#0e0e0e', fontWeight: 600 }}
          >
            {badge}
          </span>
        )}
      </Link>
    )
  }

  const levelInfo = profile ? getLevelInfo(profile.xp) : null

  return (
    <aside
      className="fixed top-0 left-0 h-full flex flex-col overflow-hidden z-40"
      style={{
        width: '220px',
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
      }}
    >
      {/* Workspace switcher */}
      <div className="p-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <WorkspaceSwitcher workspaces={workspaces} />
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        <p className="text-xs px-3 py-1 mb-1 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
          Boards
        </p>

        {kanbanBoards.map((board) =>
          navItem(`/board/${board.id}`, board.name, <LayoutGrid size={14} />)
        )}
        {navItem('/calendar', 'Calendar', <Calendar size={14} />)}
        {navItem('/quests', 'Quests', <Trophy size={14} />)}
        {navItem('/templates', 'Templates', <ClipboardList size={14} />)}

        {/* Private Space */}
        <div className="pt-3">
          <p className="text-xs px-3 py-1 mb-1 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
            Private Space
          </p>
          <button
            onClick={() => setPrivateOpen(!privateOpen)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-[8px] text-sm transition-all"
            style={{ color: 'var(--muted)' }}
          >
            <Lock size={14} />
            <span className="flex-1 text-left">My Space</span>
            <ChevronRight
              size={12}
              style={{ transform: privateOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}
            />
          </button>
          {privateOpen && (
            <div className="pl-7 mt-1 space-y-1">
              {navItem('/private', 'Private Todos', <span className="text-xs">📝</span>)}
            </div>
          )}
        </div>

        {/* Alerts */}
        <div className="pt-3">
          <p className="text-xs px-3 py-1 mb-1 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
            Alerts
          </p>
          {navItem('/notifications', 'Notifications', <Bell size={14} />, unreadCount)}
          {navItem('/archive', 'Archive', <Archive size={14} />)}
        </div>

        {/* Admin */}
        {profile?.role === 'admin' && (
          <div className="pt-3">
            <p className="text-xs px-3 py-1 mb-1 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
              Admin
            </p>
            {navItem('/audit', 'Audit Log', <ShieldCheck size={14} />)}
            {navItem('/settings', 'Settings', <Settings size={14} />)}
          </div>
        )}
      </nav>

      {/* User profile */}
      {profile && (
        <div className="p-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2.5 mb-2.5">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{ background: 'var(--accent)', color: '#0e0e0e' }}
            >
              {getInitials(profile.full_name || profile.email)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
                {profile.full_name || 'User'}
              </p>
              <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>
                {levelInfo?.current.title} · {profile.xp} XP
              </p>
            </div>
            <span
              className="text-xs px-1.5 py-0.5 rounded font-bold flex-shrink-0"
              style={{ background: 'var(--surface2)', color: 'var(--accent)', border: '1px solid var(--accent)' }}
            >
              L{levelInfo?.current.level}
            </span>
          </div>
          {levelInfo && <XPBar progress={levelInfo.progress} nextLevel={levelInfo.next?.title} />}
        </div>
      )}
    </aside>
  )
}
