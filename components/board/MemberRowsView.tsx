'use client'

import { useState } from 'react'
import { Task, Profile, TaskSection as TSectionType } from '@/lib/types'
import { getInitials } from '@/lib/utils'
import { taskBelongsToMember } from '@/lib/boardViews'
import TaskSection from './TaskSection'
import { ChevronRight } from 'lucide-react'

const SECTIONS: TSectionType[] = ['DAILY', 'WEEKLY', 'MONTHLY']

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
        const openCount = memberTasks.filter((t) => t.status !== 'APPROVED').length
        const isOpen = collapsible ? (openState[member.id] ?? initiallyExpanded) : true
        const isSelf = member.id === currentUser.id

        return (
          <section key={member.id} className={`member-lane ${isOpen ? 'is-open' : ''}`}>
            {collapsible ? (
              <button className="member-lane-head" onClick={() => toggle(member.id, isOpen)} aria-expanded={isOpen}>
                <ChevronRight size={15} className="member-lane-chevron" />
                <span className="member-lane-avatar" style={{ background: isSelf ? 'var(--accent)' : 'var(--surface3)', color: isSelf ? '#0b0d09' : 'var(--text)' }}>
                  {getInitials(member.full_name || member.email)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold" style={{ color: 'var(--text)' }}>{member.full_name || member.email}{isSelf && <em className="ml-2 rounded px-1.5 py-0.5 text-[9px] not-italic uppercase tracking-wider" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>you</em>}</span>
                </span>
                <span className="member-lane-count">{openCount} open</span>
              </button>
            ) : (
              <div className="member-lane-head" style={{ cursor: 'default' }}>
                <span className="member-lane-avatar" style={{ background: isSelf ? 'var(--accent)' : 'var(--surface3)', color: isSelf ? '#0b0d09' : 'var(--text)' }}>
                  {getInitials(member.full_name || member.email)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold" style={{ color: 'var(--text)' }}>{member.full_name || member.email}</span>
                </span>
                <span className="member-lane-count">{openCount} open</span>
              </div>
            )}

            {isOpen && (
              <div className="member-lane-body">
                {SECTIONS.map((section) => (
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
