'use client'

import { useState } from 'react'
import { Task, Profile, TaskSection as TSectionType, getTaskDeadline } from '@/lib/types'
import { getInitials } from '@/lib/utils'
import { taskBelongsToMember } from '@/lib/boardViews'
import TaskSection from './TaskSection'
import { ChevronRight } from 'lucide-react'

const SECTIONS: TSectionType[] = ['DAILY', 'WEEKLY', 'MONTHLY']

/** Compact "2 Daily · 1 Weekly · next Fri 12 Jul" line for a collapsed lane —
 *  the essentials (task type, count, nearest deadline) without expanding. */
function laneSummary(openTasks: Task[]): string | null {
  if (openTasks.length === 0) return null
  const parts = SECTIONS
    .map((s) => {
      const n = openTasks.filter((t) => t.section === s).length
      return n > 0 ? `${n} ${s.charAt(0)}${s.slice(1).toLowerCase()}` : null
    })
    .filter(Boolean) as string[]
  const nextDeadline = openTasks
    .map((t) => getTaskDeadline(t))
    .filter(Boolean)
    .map((d) => new Date(d as string).getTime())
    .sort((a, b) => a - b)[0]
  if (nextDeadline) {
    parts.push(`next ${new Date(nextDeadline).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}`)
  }
  return parts.join(' · ')
}

interface MemberRowsViewProps {
  members: Profile[]
  tasks: Task[]
  currentUser: Profile
  onTaskClick: (task: Task) => void
  onAddTask: (memberId: string, section: TSectionType) => void
  onQuickAdd: (memberId: string, section: TSectionType, title: string) => void
  onDelete: (task: Task) => void
  collapsible?: boolean
  initiallyExpanded?: boolean
}

export default function MemberRowsView({
  members,
  tasks,
  currentUser,
  onTaskClick,
  onAddTask,
  onQuickAdd,
  onDelete,
  collapsible = true,
  initiallyExpanded = false,
}: MemberRowsViewProps) {
  const [openState, setOpenState] = useState<Record<string, boolean>>({})

  const toggle = (id: string, isOpen: boolean) => setOpenState((prev) => ({ ...prev, [id]: !isOpen }))

  return (
    <div className="board-stack">
      {members.map((member) => {
        const memberTasks = tasks.filter((t) => taskBelongsToMember(t, member.id))
        const openTasks = memberTasks.filter((t) => t.status !== 'APPROVED')
        const openCount = openTasks.length
        const isOpen = collapsible ? (openState[member.id] ?? initiallyExpanded) : true
        const isSelf = member.id === currentUser.id
        const summary = laneSummary(openTasks)
        // Empty WEEKLY/MONTHLY sections stay hidden until a task of that
        // category exists (created via the Create-task modal). DAILY always
        // renders so a lane never looks dead and quick-add stays reachable.
        const visibleSections = SECTIONS.filter((s) => s === 'DAILY' || memberTasks.some((t) => t.section === s))

        return (
          <section key={member.id} className={`member-lane ${isOpen ? 'is-open' : ''}`}>
            {collapsible ? (
              <button className="member-lane-head" onClick={() => toggle(member.id, isOpen)} aria-expanded={isOpen}>
                <ChevronRight size={15} className="member-lane-chevron" />
                {member.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={member.avatar_url} alt="" className="member-lane-avatar object-cover" />
                ) : (
                  <span className="member-lane-avatar" style={{ background: isSelf ? 'var(--accent)' : 'var(--surface3)', color: isSelf ? '#0b0d09' : 'var(--text)' }}>
                    {getInitials(member.full_name || member.email)}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold" style={{ color: 'var(--text)' }}>{member.full_name || member.email}{isSelf && <em className="ml-2 rounded px-1.5 py-0.5 text-[9px] not-italic uppercase tracking-wider" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>you</em>}</span>
                  {!isOpen && summary && (
                    <span className="mt-0.5 block truncate text-[11px] font-medium" style={{ color: 'var(--muted)' }}>{summary}</span>
                  )}
                </span>
                <span className="member-lane-count">{openCount} open</span>
              </button>
            ) : (
              <div className="member-lane-head" style={{ cursor: 'default' }}>
                {member.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={member.avatar_url} alt="" className="member-lane-avatar object-cover" />
                ) : (
                  <span className="member-lane-avatar" style={{ background: isSelf ? 'var(--accent)' : 'var(--surface3)', color: isSelf ? '#0b0d09' : 'var(--text)' }}>
                    {getInitials(member.full_name || member.email)}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold" style={{ color: 'var(--text)' }}>{member.full_name || member.email}</span>
                </span>
                <span className="member-lane-count">{openCount} open</span>
              </div>
            )}

            {isOpen && (
              <div className="member-lane-body">
                {visibleSections.map((section) => (
                  <TaskSection
                    key={section}
                    section={section}
                    tasks={memberTasks.filter((t) => t.section === section)}
                    onTaskClick={onTaskClick}
                    onAddTask={() => onAddTask(member.id, section)}
                    onQuickAdd={onQuickAdd}
                    onDelete={onDelete}
                    currentUser={currentUser}
                    memberId={member.id}
                  />
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
